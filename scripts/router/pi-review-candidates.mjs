#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { buildReviewPrompt, defaultPathsForTask, parseReviewResponse, REVIEW_LABELS } from "./llm-review-candidates.mjs";

function readJsonl(path) {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function appendJsonl(path, row) {
  mkdirSync(dirname(path), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(path, `${prefix}${JSON.stringify(row)}\n`, { flag: "a" });
}

function stableId(task, row = {}) {
  return createHash("sha1")
    .update(JSON.stringify([task, row.query || "", row.inputText || "", row.candidateLabel || row.label || "", row.meta?.ts || ""]))
    .digest("hex");
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

function runPiReview(prompt, args = {}) {
  return new Promise((resolve, reject) => {
    const piArgs = [
      "--no-tools",
      "--no-context-files",
      "--no-skills",
      "--no-extensions",
      "--no-prompt-templates",
      "--no-themes",
      "--no-session",
      "--model", args.model,
      "--thinking", args.thinking,
      "-p",
      prompt,
    ];

    const child = spawn(args.piBin || "pi", piArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`pi review timed out after ${args.timeoutMs}ms`));
    }, args.timeoutMs);
    timer.unref?.();

    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`pi exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

export async function reviewRowWithPi(task, row, args = {}) {
  const promptParts = buildReviewPrompt(task, row);
  const prompt = `${promptParts.system}\n\nCandidate JSON:\n${promptParts.user}`;
  const raw = await runPiReview(prompt, args);
  return parseReviewResponse(task, extractJsonObject(raw));
}

function parseArgs(argv) {
  const args = {
    task: "",
    input: "",
    output: "",
    model: "openai-codex/gpt-5.4-mini",
    thinking: "minimal",
    limit: Infinity,
    minConfidence: 0.8,
    timeoutMs: 180000,
    piBin: "pi",
    failuresOutput: "",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--task") args.task = argv[++index];
    else if (arg === "--in") args.input = argv[++index];
    else if (arg === "--out") args.output = argv[++index];
    else if (arg === "--model") args.model = argv[++index];
    else if (arg === "--thinking") args.thinking = argv[++index];
    else if (arg === "--limit") args.limit = Number(argv[++index]);
    else if (arg === "--min-confidence") args.minConfidence = Number(argv[++index]);
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++index]);
    else if (arg === "--pi-bin") args.piBin = argv[++index];
    else if (arg === "--failures-out") args.failuresOutput = argv[++index];
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.task && REVIEW_LABELS[args.task]) {
    const defaults = defaultPathsForTask(args.task);
    if (!args.input) args.input = defaults.input;
    if (!args.output) args.output = defaults.output.replace("-llm-reviewed.jsonl", "-pi-reviewed.jsonl");
    if (!args.failuresOutput) args.failuresOutput = args.output.replace(".jsonl", "-failures.jsonl");
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/router/pi-review-candidates.mjs --task <domain|followup|conflict|sufficiency> [--limit N]",
    "Runs one fresh ephemeral pi print-mode session per candidate.",
    "Default model: openai-codex/gpt-5.4-mini, tools/context disabled.",
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
  let reviewed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const reviewId = stableId(args.task, row);
    if (doneIds.has(reviewId)) {
      skipped += 1;
      continue;
    }
    if (reviewed >= args.limit) break;

    if (args.dryRun) {
      const promptParts = buildReviewPrompt(args.task, row);
      console.log(JSON.stringify({ reviewId, model: args.model, prompt: `${promptParts.system}\n\nCandidate JSON:\n${promptParts.user}` }, null, 2));
      reviewed += 1;
      continue;
    }

    try {
      const review = await reviewRowWithPi(args.task, row, args);
      appendJsonl(args.output, {
        query: row.query,
        label: review.label,
        confidence: review.confidence,
        rationale: review.rationale,
        needs_human_review: review.needs_human_review || review.confidence < args.minConfidence,
        inputText: row.inputText || row.query || "",
        candidateLabel: row.candidateLabel || row.label || "",
        meta: row.meta && typeof row.meta === "object" ? row.meta : {},
        reviewId,
        reviewSource: "pi_review",
        reviewerModel: args.model,
        reviewedAt: new Date().toISOString(),
      });
      reviewed += 1;
      console.error(JSON.stringify({ task: args.task, reviewed, failed, total: rows.length, query: row.query, label: review.label, confidence: review.confidence }));
    } catch (error) {
      failed += 1;
      appendJsonl(args.failuresOutput, {
        query: row.query,
        candidateLabel: row.candidateLabel || row.label || "",
        inputText: row.inputText || row.query || "",
        meta: row.meta && typeof row.meta === "object" ? row.meta : {},
        reviewId,
        reviewSource: "pi_review_failure",
        reviewerModel: args.model,
        error: error?.message || String(error),
        reviewedAt: new Date().toISOString(),
      });
      console.error(JSON.stringify({ task: args.task, reviewed, failed, total: rows.length, query: row.query, error: error?.message || String(error) }));
    }
  }

  console.log(JSON.stringify({ task: args.task, input: args.input, output: args.output, failuresOutput: args.failuresOutput, total: rows.length, skipped, reviewed, failed, model: args.model }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
