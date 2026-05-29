#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

const REVIEW_LABELS = {
  domain: ["security", "medical", "legal", "trading", "finance", "vendor-status", "changelog", "github", "package-registry", "shopify", "papers", "news-current-events", "quantum", "ai-ml", "cloud-docs", "standards", "specs", "forums", "local-howto", "ecommerce", "web"],
  source_authority: ["primary_source", "authoritative", "secondary_but_good", "community_context", "weak_source", "unusable"],
  page_quality: ["usable", "thin", "blocked", "placeholder", "off_topic", "duplicate", "low_query_overlap"],
  conflict: ["no_conflict", "resolved_by_authority", "resolved_by_recency", "needs_review"],
  sufficiency: ["sufficient", "need_authority", "need_more_sources", "need_recency", "need_version_context", "insufficient"],
  followup: ["stop", "need_more_sources", "need_authority", "need_primary_source", "need_recency", "need_version_context", "need_conflict_resolution"],
};

const GUIDELINES = {
  domain: `Use security for vulnerabilities/CVEs. Use medical for diagnosis/drugs. Use legal for law/liability. Use trading for forex/options/market hours. Use finance for banking/investments. Use vendor-status for outages/status pages. Use changelog for release notes/version history. Use github for repos/issues. Use package-registry for npm/PyPI. Use shopify for liquid/shopify apps. Use papers for academic/arxiv. Use news-current-events for breaking news/headlines. Use quantum for qubits/quantum error correction. Use ai-ml for LLMs/rag. Use cloud-docs for AWS/Azure/GCP/k8s. Use standards for NIST/ISO/SOC2. Use specs for RFC/OpenAPI. Use forums for reddit/SO. Use local-howto for city hall/dmv. Use ecommerce for pricing/shipping. Use web for general research.`,
  source_authority: `primary_source: absolute primary publisher. authoritative: highly credible/official. secondary_but_good: reputable aggregator. community_context: forum/social. weak_source: random unverified blog. unusable: explicitly broken/irrelevant.`,
  page_quality: `usable: clear text. thin: too short. blocked: WAF/403/429. placeholder: captcha. off_topic: irrelevant. duplicate: exact copy. low_query_overlap: lacks query terms.`,
};

function stableId(task, row = {}) {
  return createHash("sha1").update(JSON.stringify([task, row.query || "", row.inputText || ""])).digest("hex");
}

function stripAnsi(text = "") {
  return String(text).replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function extractJsonObject(text = "") {
  const clean = stripAnsi(text).trim();
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last > first) return clean.slice(first, last + 1);
  return clean;
}

function runPiReview(prompt, model) {
  return new Promise((resolve, reject) => {
    const args = ["--no-tools", "--no-context-files", "--no-skills", "--no-session", "--model", model, "-p", prompt];
    const child = spawn("pi", args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" } });
    
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
    });
  });
}

async function withRetry(fn, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === maxRetries - 1) throw err;
      const isRateLimit = err.message.includes("429") || err.message.includes("usage_limit_reached") || err.message.includes("Quota");
      const delay = isRateLimit ? (Math.pow(2, i) * 2000 + Math.random() * 2000) : (Math.pow(2, i) * 1000 + Math.random() * 500);
      console.warn(`[Retry ${i+1}/${maxRetries}] Failed: ${err.message.split("\\n")[0]}. Waiting ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function processRow(task, row, model, minConfidence) {
  const system = `You are a strict ML dataset labeling judge.
Task: ${task}
Allowed labels: ${REVIEW_LABELS[task].join(", ")}

CRITICAL INSTRUCTION - CHAIN OF THOUGHT:
You MUST generate the keys in exactly this order:
1. "rationale": (string) Step-by-step reasoning evaluating the input.
2. "label": (string) The final chosen label from the allowed list.
3. "confidence": (number) 0.0 to 1.0.
4. "needs_human_review": (boolean) True if ambiguous or confidence < ${minConfidence}.

Guidelines: ${GUIDELINES[task] || ""}`;

  const user = JSON.stringify({ query: row.query, inputText: row.inputText.slice(0, 4000) }, null, 2);
  const prompt = `${system}\n\nCandidate JSON:\n${user}`;

  const raw = await withRetry(() => runPiReview(prompt, model));
  const parsed = JSON.parse(extractJsonObject(raw));
  
  if (!REVIEW_LABELS[task].includes(parsed.label)) throw new Error(`Invalid label: ${parsed.label}`);
  
  return {
    ...parsed,
    needs_human_review: Boolean(parsed.needs_human_review || parsed.confidence < minConfidence),
  };
}

function appendJsonl(path, row) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(row)}\n`, { flag: "a" });
}

async function processQueue(items, concurrency, processor) {
  let index = 0;
  let done = 0;
  const workers = Array(concurrency).fill(null).map(async () => {
    while (index < items.length) {
      const item = items[index++];
      await processor(item);
      done++;
      if (done % 10 === 0) console.log(`Progress: ${done} / ${items.length}`);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const args = process.argv.slice(2);
  let task = "domain", input = "", out = "", failuresOut = "", model = "google/gemini-2.5-flash", limit = 1000, concurrency = 10;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--task") task = args[++i];
    if (args[i] === "--in") input = args[++i];
    if (args[i] === "--out") out = args[++i];
    if (args[i] === "--model") model = args[++i];
    if (args[i] === "--limit") limit = Number(args[++i]);
    if (args[i] === "--concurrency") concurrency = Number(args[++i]);
  }

  if (!input || !out) throw new Error("Missing --in or --out");
  failuresOut = out.replace(".jsonl", "-failures.jsonl");

  const rows = readFileSync(input, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).slice(0, limit);
  const existingIds = new Set(existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l).reviewId) : []);
  
  const pending = rows.filter(r => !existingIds.has(stableId(task, r)));
  console.log(`Starting async LLM review for ${pending.length} rows (concurrency: ${concurrency}, model: ${model})...`);

  await processQueue(pending, concurrency, async (row) => {
    const reviewId = stableId(task, row);
    try {
      const review = await processRow(task, row, model, 0.85);
      appendJsonl(out, {
        query: row.query,
        label: review.label,
        confidence: review.confidence,
        rationale: review.rationale,
        needs_human_review: review.needs_human_review,
        inputText: row.inputText,
        meta: row.meta || {},
        reviewId,
        reviewSource: "pi_review_async",
        reviewerModel: model,
        reviewedAt: new Date().toISOString()
      });
    } catch (err) {
      appendJsonl(failuresOut, { reviewId, query: row.query, error: err.message, reviewedAt: new Date().toISOString() });
    }
  });

  console.log("Async review completed!");
}

main().catch(console.error);
