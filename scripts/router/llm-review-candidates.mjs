#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ANNOTATION_LABELS } from "../../lib/router-annotation.js";

export const REVIEW_LABELS = {
  domain: ["security", "vendor-status", "papers", "specs", "package-registry", "github", "changelog", "forums", "web"],
  followup: ["stop", "need_more_sources", "need_authority", "need_primary_source", "need_recency", "need_version_context", "need_conflict_resolution"],
  conflict: ANNOTATION_LABELS.conflict,
  sufficiency: ANNOTATION_LABELS.sufficiency,
  source_authority: ["primary_source", "authoritative", "secondary_but_good", "community_context", "weak_source", "unusable"],
  page_quality: ["usable", "thin", "blocked", "placeholder", "off_topic", "duplicate", "low_query_overlap"],
};

function stableId(task, row = {}) {
  return createHash("sha1")
    .update(JSON.stringify([task, row.query || "", row.inputText || "", row.candidateLabel || row.label || "", row.meta?.ts || ""]))
    .digest("hex");
}

function readJsonl(path) {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function appendJsonl(path, row) {
  mkdirSync(dirname(path), { recursive: true });
  const existing = existsSync(path) && readFileSync(path, "utf8").trim().length > 0;
  writeFileSync(path, `${existing ? "\n" : ""}${JSON.stringify(row)}`, { flag: "a" });
}

function truncateText(text = "", maxChars = 12000) {
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[TRUNCATED ${value.length - maxChars} chars]`;
}

export function buildReviewPrompt(task, row = {}) {
  const labels = REVIEW_LABELS[task];
  if (!labels) throw new Error(`Unsupported task: ${task}`);

  const taskGuide = {
    domain: [
      "Choose the best domain for the query only.",
      "Use security for vulnerabilities/CVEs/advisories.",
      "Use vendor-status for outages/status pages/incidents.",
      "Use papers for academic papers, arXiv, DOI, PubMed, studies.",
      "Use specs for standards/RFC/W3C/WHATWG/language specifications.",
      "Use package-registry for npm/PyPI/package metadata/version availability.",
      "Use github for GitHub repos/issues/PRs/actions/API docs.",
      "Use changelog for release notes, migration, breaking changes, version history.",
      "Use forums for Reddit/StackOverflow/community discussions.",
      "Use web for general web research not fitting another class.",
    ],
    followup: [
      "Decide the next research action after the first turn.",
      "stop: sources are enough for the requested mode.",
      "need_more_sources: not enough independent coverage.",
      "need_authority: sources are weak/non-authoritative.",
      "need_primary_source: academic/paper query needs primary paper/DOI/publisher/arXiv.",
      "need_recency: current/latest/status query lacks current evidence.",
      "need_version_context: version/migration/compatibility query lacks exact version evidence.",
      "need_conflict_resolution: sources conflict or need resolving by authority/recency.",
    ],
    conflict: [
      "Judge whether source disagreement is real and how to resolve it.",
      "no_conflict: no clear factual contradiction on the same claim.",
      "resolved_by_authority: contradiction exists but authoritative source wins.",
      "resolved_by_recency: time-sensitive contradiction resolved by newer/current source.",
      "needs_review: unresolved conflict, insufficient evidence, or ambiguous contradiction.",
    ],
    sufficiency: [
      "Judge whether the sources are enough to answer reliably.",
      "sufficient: enough authoritative/current/version-correct evidence.",
      "need_authority: sources are not authoritative enough.",
      "need_more_sources: evidence is too thin or too few independent sources.",
      "need_recency: current/latest/status query lacks fresh evidence.",
      "need_version_context: version/migration/compatibility query lacks exact version evidence.",
    ],
    source_authority: [
      "Judge the authority and relevance of a source for a given query.",
      "primary_source: the absolute primary publisher of this specific concept or fact.",
      "authoritative: a highly credible, official, or peer-reviewed source.",
      "secondary_but_good: a reputable aggregator, major blog, or high-quality news.",
      "community_context: a forum, reddit, or stackoverflow post providing context.",
      "weak_source: random unverified blog or SEO spam.",
      "unusable: explicitly broken, irrelevant, or known-bad source.",
    ],
    page_quality: [
      "Judge the usability and readability of the fetched page text.",
      "usable: clear, relevant text that is long enough to read.",
      "thin: too short or lacks substantive information.",
      "blocked: explicitly blocked by a WAF, 403, or 429.",
      "placeholder: captcha, turnstile, or 'attention required' pages.",
      "off_topic: text does not match the query intent at all.",
      "duplicate: exact duplicate of another processed source.",
      "low_query_overlap: very few query terms appear in the text.",
    ],
  }[task];

  const payload = {
    task,
    allowedLabels: labels,
    query: row.query || "",
    candidateLabel: row.candidateLabel || row.label || "",
    mode: row.meta?.mode || row.mode || null,
    meta: row.meta || {},
    inputText: truncateText(row.inputText || row.query || ""),
  };

  return {
    system: [
      "You are a strict dataset labeling reviewer for a small ML router.",
      "Review exactly one candidate at a time. Do not rubber-stamp candidate labels.",
      "Prefer needs_human_review=true when evidence is ambiguous, labels are close, snippets are too thin, or the candidate appears from test/fixture data.",
      "Return only valid JSON with keys: label, confidence, rationale, needs_human_review.",
      "confidence must be a number from 0 to 1.",
      `Allowed labels: ${labels.join(", ")}.`,
      ...taskGuide,
    ].join("\n"),
    user: JSON.stringify(payload, null, 2),
  };
}

function stripJsonFence(text = "") {
  return String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function parseReviewResponse(task, text = "") {
  const labels = REVIEW_LABELS[task];
  if (!labels) throw new Error(`Unsupported task: ${task}`);

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch (error) {
    throw new Error(`Invalid JSON review response: ${error.message}`);
  }

  const label = String(parsed.label || "");
  if (!labels.includes(label)) throw new Error(`Invalid label '${label}' for task '${task}'`);

  const confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`Invalid confidence '${parsed.confidence}'`);
  }

  return {
    label,
    confidence,
    rationale: String(parsed.rationale || "").slice(0, 2000),
    needs_human_review: Boolean(parsed.needs_human_review || confidence < 0.8),
  };
}

function resolveEndpoint(baseUrl = "") {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base) throw new Error("Missing LLM review base URL. Set LLM_REVIEW_BASE_URL or pass --base-url.");
  if (/\/chat\/completions$/.test(base)) return base;
  return `${base}/chat/completions`;
}

export async function callOpenAiCompatibleReview({ baseUrl, apiKey, model, task, row, temperature = 0 }) {
  if (!apiKey) throw new Error("Missing API key. Set LLM_REVIEW_API_KEY or pass --api-key-env with an environment variable name.");
  if (!model) throw new Error("Missing model. Set LLM_REVIEW_MODEL or pass --model.");

  const prompt = buildReviewPrompt(task, row);
  const response = await fetch(resolveEndpoint(baseUrl), {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`LLM review request failed (${response.status}): ${body.slice(0, 1000)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`Provider returned invalid JSON envelope: ${error.message}`);
  }

  const content = parsed.choices?.[0]?.message?.content;
  if (!content) throw new Error("Provider response missing choices[0].message.content");
  return parseReviewResponse(task, content);
}

export function defaultPathsForTask(task) {
  if (task === "followup") {
    return {
      input: "data/followup/log-candidates/followup-draft.jsonl",
      output: "data/followup/log-candidates/followup-llm-reviewed.jsonl",
    };
  }
  return {
    input: `data/router/log-candidates/${task}-draft.jsonl`,
    output: `data/router/log-candidates/${task}-llm-reviewed.jsonl`,
  };
}

function parseArgs(argv) {
  const args = {
    task: "",
    input: "",
    output: "",
    baseUrl: process.env.LLM_REVIEW_BASE_URL || "",
    model: process.env.LLM_REVIEW_MODEL || "",
    apiKeyEnv: "LLM_REVIEW_API_KEY",
    limit: Infinity,
    minConfidence: 0.8,
    temperature: 0,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--task") args.task = argv[++index];
    else if (arg === "--in") args.input = argv[++index];
    else if (arg === "--out") args.output = argv[++index];
    else if (arg === "--base-url") args.baseUrl = argv[++index];
    else if (arg === "--model") args.model = argv[++index];
    else if (arg === "--api-key-env") args.apiKeyEnv = argv[++index];
    else if (arg === "--limit") args.limit = Number(argv[++index]);
    else if (arg === "--min-confidence") args.minConfidence = Number(argv[++index]);
    else if (arg === "--temperature") args.temperature = Number(argv[++index]);
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.task && REVIEW_LABELS[args.task]) {
    const defaults = defaultPathsForTask(args.task);
    if (!args.input) args.input = defaults.input;
    if (!args.output) args.output = defaults.output;
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/router/llm-review-candidates.mjs --task <domain|followup|conflict|sufficiency> [--limit N]",
    "Requires an OpenAI-compatible chat/completions endpoint:",
    "  export LLM_REVIEW_BASE_URL=https://provider.example/v1",
    "  export LLM_REVIEW_MODEL=<model-name>",
    "  export LLM_REVIEW_API_KEY=<secret>",
    "The API key is read only from the environment and is never written to output files.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!REVIEW_LABELS[args.task]) throw new Error(`Unsupported or missing --task. Expected one of: ${Object.keys(REVIEW_LABELS).join(", ")}`);

  const rows = readJsonl(args.input);
  const existing = readJsonl(args.output);
  const doneIds = new Set(existing.map((row) => row.reviewId || stableId(args.task, row)));
  const apiKey = process.env[args.apiKeyEnv] || "";

  let reviewed = 0;
  let skipped = 0;
  for (const row of rows) {
    const reviewId = stableId(args.task, row);
    if (doneIds.has(reviewId)) {
      skipped += 1;
      continue;
    }
    if (reviewed >= args.limit) break;

    if (args.dryRun) {
      const prompt = buildReviewPrompt(args.task, row);
      console.log(JSON.stringify({ reviewId, prompt }, null, 2));
      reviewed += 1;
      continue;
    }

    const review = await callOpenAiCompatibleReview({
      baseUrl: args.baseUrl,
      apiKey,
      model: args.model,
      task: args.task,
      row,
      temperature: args.temperature,
    });

    const outputRow = {
      query: row.query,
      label: review.label,
      confidence: review.confidence,
      rationale: review.rationale,
      needs_human_review: review.needs_human_review || review.confidence < args.minConfidence,
      inputText: row.inputText || row.query || "",
      candidateLabel: row.candidateLabel || row.label || "",
      meta: row.meta && typeof row.meta === "object" ? row.meta : {},
      reviewId,
      reviewSource: "llm_review",
      reviewerModel: args.model,
      reviewedAt: new Date().toISOString(),
    };
    appendJsonl(args.output, outputRow);
    reviewed += 1;
  }

  console.log(JSON.stringify({ task: args.task, input: args.input, output: args.output, total: rows.length, skipped, reviewed }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
