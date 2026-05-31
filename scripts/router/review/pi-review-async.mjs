#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

import { ANNOTATION_LABELS } from "../../../lib/router-annotation.js";
import { appendJsonl, extractJsonObject, processQueue, runPiReview, stableReviewId, withRetry } from "./review-utils.mjs";

const REVIEW_LABELS = {
  domain: ["security", "medical", "legal", "trading", "finance", "vendor-status", "changelog", "github", "package-registry", "shopify", "papers", "news-current-events", "quantum", "ai-ml", "cloud-docs", "standards", "specs", "forums", "local-howto", "ecommerce", "web"],
  source_authority: ["primary_source", "authoritative", "secondary_but_good", "community_context", "weak_source", "unusable"],
  page_quality: ["usable", "thin", "blocked", "placeholder", "off_topic", "duplicate", "low_query_overlap"],
  conflict: ANNOTATION_LABELS.conflict,
  sufficiency: ANNOTATION_LABELS.sufficiency,
  followup: ANNOTATION_LABELS.followup,
};

const GUIDELINES = {
  domain: `Use security for vulnerabilities/CVEs. Use medical for diagnosis/drugs. Use legal for law/liability. Use trading for forex/options/market hours. Use finance for banking/investments. Use vendor-status for outages/status pages. Use changelog for release notes/version history. Use github for repos/issues. Use package-registry for npm/PyPI. Use shopify for liquid/shopify apps. Use papers for academic/arxiv. Use news-current-events for breaking news/headlines. Use quantum for qubits/quantum error correction. Use ai-ml for LLMs/rag. Use cloud-docs for AWS/Azure/GCP/k8s. Use standards for NIST/ISO/SOC2. Use specs for RFC/OpenAPI. Use forums for reddit/SO. Use local-howto for city hall/dmv. Use ecommerce for pricing/shipping. Use web for general research.`,
  source_authority: `primary_source: absolute primary publisher. authoritative: highly credible/official. secondary_but_good: reputable aggregator. community_context: forum/social. weak_source: random unverified blog. unusable: explicitly broken/irrelevant.`,
  page_quality: `usable: clear text. thin: too short. blocked: WAF/403/429. placeholder: captcha. off_topic: irrelevant. duplicate: exact copy. low_query_overlap: lacks query terms.`,
  conflict: `no_conflict: no contradiction. resolved_by_authority/recency/version: contradiction has a clear resolver. open_conflict: unresolved contradiction. needs_review: ambiguous signal.`,
  sufficiency: `sufficient only when evidence is enough. need_authority/primary_source/more_sources/recency/version_context/conflict_resolution describe the missing evidence.`,
  followup: `Choose the next evidence-oriented action. stop only when enough evidence is present. ask_clarifying_question only when ambiguity prevents safe retrieval.`,
};

function stableId(task, row = {}) {
  return stableReviewId([task, row.query || "", row.inputText || ""]);
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

  const user = JSON.stringify({ query: row.query, inputText: String(row.inputText || row.query || "").slice(0, 4000) }, null, 2);
  const prompt = `${system}\n\nCandidate JSON:\n${user}`;

  const raw = await withRetry(() => runPiReview(prompt, { model }));
  const parsed = JSON.parse(extractJsonObject(raw));

  if (!REVIEW_LABELS[task].includes(parsed.label)) throw new Error(`Invalid label: ${parsed.label}`);

  return {
    ...parsed,
    needs_human_review: Boolean(parsed.needs_human_review || parsed.confidence < minConfidence),
  };
}

async function main() {
  const args = process.argv.slice(2);
  let task = "domain", input = "", out = "", failuresOut = "", model = "google/gemini-3.5-flash", limit = 1000, concurrency = 10;

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

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
