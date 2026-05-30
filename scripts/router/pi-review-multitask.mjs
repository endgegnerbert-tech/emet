#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

const MULTITASK_LABELS = {
  domain: ["security", "medical", "legal", "trading", "finance", "vendor-status", "changelog", "github", "package-registry", "shopify", "papers", "news-current-events", "quantum", "ai-ml", "cloud-docs", "standards", "specs", "forums", "local-howto", "ecommerce", "web"],
  query_shape: ["short_fact", "explanation", "comparison", "howto", "troubleshooting", "ambiguous_factoid", "current_or_version_sensitive", "academic_review", "shopping_or_ecommerce", "legal_medical_finance_sensitive"],
  answer_shape: ["short_answer", "list", "long_explanation", "step_by_step", "comparison_table", "citation_heavy"],
  source_family: ["encyclopedia", "official_docs", "academic", "primary_source", "recent_news", "government_or_legal", "community", "product_or_ecommerce", "general_web"],
  recency_need: ["none", "helpful", "required"],
  ambiguity: ["low", "medium", "high"]
};

const GUIDELINES = `
- domain: Choose the most specific domain (e.g. medical, legal, cloud-docs) or "web" as fallback.
- query_shape: Identify the core intent of the question.
- answer_shape: What format would best answer this?
- source_family: What type of source is most trusted for this?
- recency_need: Is this time-sensitive? (none = evergreen, helpful = recent is better, required = strictly needs current status/news).
- ambiguity: How many different interpretations does this query have?
`;

function stableId(row = {}) {
  return createHash("sha1").update(JSON.stringify(["multitask", row.query || ""])).digest("hex");
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

async function processRow(row, model, minConfidence) {
  const system = `You are a strict ML dataset labeling judge performing Multi-Task classification for a search engine router.

CRITICAL INSTRUCTION - CHAIN OF THOUGHT:
You MUST generate the keys in exactly this order:
1. "rationale": (string) Step-by-step reasoning evaluating the input query across all 6 dimensions.
2. "domain": (string) from [${MULTITASK_LABELS.domain.join(", ")}]
3. "query_shape": (string) from [${MULTITASK_LABELS.query_shape.join(", ")}]
4. "answer_shape": (string) from [${MULTITASK_LABELS.answer_shape.join(", ")}]
5. "source_family": (string) from [${MULTITASK_LABELS.source_family.join(", ")}]
6. "recency_need": (string) from [${MULTITASK_LABELS.recency_need.join(", ")}]
7. "ambiguity": (string) from [${MULTITASK_LABELS.ambiguity.join(", ")}]
8. "confidence": (number) 0.0 to 1.0 representing average confidence across all labels.
9. "needs_human_review": (boolean) True if query is highly ambiguous, offensive, or confidence < ${minConfidence}.

Guidelines: ${GUIDELINES}`;

  const user = JSON.stringify({ query: row.query }, null, 2);
  const prompt = `${system}\n\nCandidate Query JSON:\n${user}`;

  const raw = await withRetry(() => runPiReview(prompt, model));
  const parsed = JSON.parse(extractJsonObject(raw));
  
  for (const [key, allowed] of Object.entries(MULTITASK_LABELS)) {
    if (!allowed.includes(parsed[key])) throw new Error(`Invalid label for ${key}: ${parsed[key]}`);
  }
  
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
  let input = "", out = "", failuresOut = "", model = "google/gemini-3.5-flash", limit = 1000, concurrency = 10;
  
  for (let i = 0; i < args.length; i++) {
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
  
  const pending = rows.filter(r => !existingIds.has(stableId(r)));
  console.log(`Starting Async Multi-Task Review for ${pending.length} rows (concurrency: ${concurrency}, model: ${model})...`);

  await processQueue(pending, concurrency, async (row) => {
    const reviewId = stableId(row);
    try {
      const review = await processRow(row, model, 0.85);
      appendJsonl(out, {
        query: row.query,
        rationale: review.rationale,
        labels: {
          domain: review.domain,
          query_shape: review.query_shape,
          answer_shape: review.answer_shape,
          source_family: review.source_family,
          recency_need: review.recency_need,
          ambiguity: review.ambiguity
        },
        confidence: review.confidence,
        needs_human_review: review.needs_human_review,
        meta: row.meta || {},
        reviewId,
        reviewSource: "pi_multitask_async",
        reviewerModel: model,
        reviewedAt: new Date().toISOString()
      });
    } catch (err) {
      appendJsonl(failuresOut, { reviewId, query: row.query, error: err.message, reviewedAt: new Date().toISOString() });
    }
  });

  console.log("Async Multi-Task Review completed!");
}

main().catch(console.error);
