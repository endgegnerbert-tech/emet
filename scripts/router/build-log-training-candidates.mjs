#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyQuestionDomain } from "../../lib/research-intent.js";
import { suggestAnnotation } from "../../lib/router-annotation.js";
import {
  conflictStateFromPages,
  normalizeQueryGroup,
  observedActionFromResult,
  sourceMetaFromPages,
} from "./followup-log-utils.js";

const HIGH_RISK_DOMAINS = new Set(["security", "papers", "specs"]);
const DEFAULT_FIXTURE_QUERIES = new Set([
  "cache probe unique",
  "topic guidance",
  "retrieval augmented generation papers",
  "local docs",
]);
const TEST_CWD_PATTERNS = [
  /\/github\/emet(?:\/|$)/,
  /\/github\/pi-research(?:\/|$)/,
];
const FAKE_SOURCE_PATTERNS = [
  /(^|\.)example\.com$/i,
  /(^|\.)example\.org$/i,
  /^fast\.example\.com$/i,
  /^slow\.example\.com$/i,
  /^blocked(?:-expensive)?\.example\.com$/i,
];

function hashString(value = "") {
  return createHash("sha1").update(String(value)).digest("hex");
}

function hostFromUrl(url = "") {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function eventKey(event = {}) {
  const data = event.data || {};
  const query = data.query || data.originalInput?.query || data.finalInput?.query || "";
  return `${event.pid || "unknown"}:${query}`;
}

function activeSessionFor(active, event) {
  const queue = active.get(eventKey(event));
  return queue?.[0] || null;
}

export function parseResearchSessionsFromLogEvents(events = []) {
  const sessions = [];
  const active = new Map();

  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const data = event.data || {};
    const key = eventKey(event);

    if (event.type === "research_start") {
      const session = {
        pid: event.pid,
        ts: event.ts,
        cwd: event.cwd || "",
        query: data.query || "",
        mode: data.mode || "fast",
        logPath: event.logPath || null,
        inFollowup: false,
        firstTurnPages: [],
        result: null,
      };
      if (!active.has(key)) active.set(key, []);
      active.get(key).push(session);
      continue;
    }

    const session = activeSessionFor(active, event);
    if (!session) continue;

    if (event.type === "pipeline_stage" && data.stage === "followup") {
      session.inFollowup = true;
      continue;
    }

    if (event.type === "page_fetch_results" && !session.inFollowup) {
      session.firstTurnPages.push(...(Array.isArray(data.pages) ? data.pages : []));
      continue;
    }

    if (event.type === "research_end") {
      session.result = data;
      sessions.push(session);
      const queue = active.get(key) || [];
      queue.shift();
      if (queue.length) active.set(key, queue);
      else active.delete(key);
    }
  }

  return sessions;
}

export function readLogEvents(paths = []) {
  const events = [];
  for (const path of paths) {
    if (!path || !existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = safeJsonParse(line);
      if (event) events.push({ ...event, logPath: path });
    }
  }
  return events.sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
}

function allSessionSources(session = {}) {
  return [
    ...(Array.isArray(session.firstTurnPages) ? session.firstTurnPages : []),
    ...(Array.isArray(session.result?.sources) ? session.result.sources : []),
  ];
}

function hasFakeSource(session = {}) {
  return allSessionSources(session).some((source) => {
    const host = hostFromUrl(source?.url || "");
    return host && FAKE_SOURCE_PATTERNS.some((pattern) => pattern.test(host));
  });
}

function isInternalTestCwd(cwd = "") {
  return TEST_CWD_PATTERNS.some((pattern) => pattern.test(String(cwd)));
}

export function buildQueryCounts(sessions = []) {
  const counts = new Map();
  for (const session of sessions) {
    const query = String(session.query || "").trim().toLowerCase();
    if (!query) continue;
    counts.set(query, (counts.get(query) || 0) + 1);
  }
  return counts;
}

export function assessSessionForTraining(session = {}, queryCounts = new Map(), options = {}) {
  const maxQueryOccurrences = Number(options.maxQueryOccurrences || 10);
  const query = String(session.query || "").trim();
  const normalizedQuery = query.toLowerCase();
  const result = session.result || {};
  const sourceCount = Array.isArray(result.sources) ? result.sources.length : 0;
  const pageCount = Array.isArray(session.firstTurnPages) ? session.firstTurnPages.length : 0;

  if (!query) return { keep: false, reason: "missing_query" };
  if (!result || result.ok !== true) return { keep: false, reason: "not_ok" };
  if (result.cacheHit) return { keep: false, reason: "cache_hit" };
  if (!options.includeInternal && isInternalTestCwd(session.cwd)) return { keep: false, reason: "internal_test_cwd" };
  if (DEFAULT_FIXTURE_QUERIES.has(normalizedQuery)) return { keep: false, reason: "known_fixture_query" };
  if ((queryCounts.get(normalizedQuery) || 0) > maxQueryOccurrences) return { keep: false, reason: "over_repeated_query" };
  if (hasFakeSource(session)) return { keep: false, reason: "fake_source_domain" };
  if (sourceCount === 0 && pageCount === 0) return { keep: false, reason: "no_sources" };

  return { keep: true, reason: "kept" };
}

function buildSourceText(sources = []) {
  return sources
    .map((source) => `[${source.sourceType || "other"}] ${source.title || source.url || "Untitled"}\n${source.snippet || source.text || ""}`)
    .join("\n\n")
    .trim();
}

function versionMeta(run = {}) {
  return {
    versionContext: run.meta?.versionContext || null,
    versionCoverage: run.meta?.versionCoverage || run.runtimeTrace?.final?.versionSummary || null,
  };
}

function provenance(session = {}, extra = {}) {
  return {
    source: "research_log",
    logPath: session.logPath,
    cwd: session.cwd,
    pid: session.pid,
    ts: session.ts,
    ...extra,
  };
}

function dedupeRows(rows = [], keyFn) {
  const byKey = new Map();
  for (const row of rows) byKey.set(keyFn(row), row);
  return [...byKey.values()].sort((a, b) => String(a.query || "").localeCompare(String(b.query || "")) || String(a.id || "").localeCompare(String(b.id || "")));
}

export function buildCandidateSets(sessions = [], options = {}) {
  const queryCounts = buildQueryCounts(sessions);
  const report = {
    totalSessions: sessions.length,
    keptSessions: 0,
    skipped: {},
    labels: { domain: {}, followup: {}, sufficiency: {}, conflict: {} },
  };
  const examples = [];
  const followup = [];

  for (const session of sessions) {
    const assessment = assessSessionForTraining(session, queryCounts, options);
    if (!assessment.keep) {
      report.skipped[assessment.reason] = (report.skipped[assessment.reason] || 0) + 1;
      continue;
    }
    report.keptSessions += 1;

    const run = session.result || {};
    const query = String(session.query || "").trim();
    const mode = session.mode || run.mode || "fast";
    const sources = Array.isArray(run.sources) ? run.sources : [];
    const sourceCount = sources.length;
    const domain = classifyQuestionDomain(query);
    const risk = HIGH_RISK_DOMAINS.has(domain) ? "high" : "low";
    const baseMeta = provenance(session, { mode, ...versionMeta(run) });

    examples.push({
      id: hashString(`log:domain:${query}:${mode}`),
      task: "domain",
      query,
      inputText: query,
      label: domain,
      labelSource: "heuristic_candidate",
      risk,
      meta: baseMeta,
    });
    report.labels.domain[domain] = (report.labels.domain[domain] || 0) + 1;

    if (sourceCount > 0 && typeof run.sufficient === "boolean") {
      const label = run.sufficient ? "sufficient" : "insufficient";
      examples.push({
        id: hashString(`log:sufficiency:${query}:${mode}:${sourceCount}`),
        task: "sufficiency",
        query,
        inputText: `Query: ${query}\n\nSources:\n${buildSourceText(sources)}`,
        label,
        labelSource: "pipeline_candidate",
        risk,
        meta: provenance(session, {
          mode,
          sourceCount,
          authoritativeSourcesFound: Boolean(run.authoritativeSourcesFound),
          ...versionMeta(run),
        }),
      });
      report.labels.sufficiency[label] = (report.labels.sufficiency[label] || 0) + 1;
    }

    if (sourceCount > 1 && typeof run.conflictDetected === "boolean") {
      const label = run.conflictDetected ? "conflict" : "no_conflict";
      examples.push({
        id: hashString(`log:conflict:${query}:${mode}:${sourceCount}`),
        task: "conflict",
        query,
        inputText: `Query: ${query}\n\nSources:\n${buildSourceText(sources)}`,
        label,
        labelSource: "candidate_only",
        risk,
        meta: provenance(session, {
          mode,
          sourceCount,
          conflictSummary: run.conflictSummary || "",
          ...versionMeta(run),
        }),
      });
      report.labels.conflict[label] = (report.labels.conflict[label] || 0) + 1;
    }

    if (Array.isArray(session.firstTurnPages) && session.firstTurnPages.length) {
      const label = observedActionFromResult(run);
      followup.push({
        id: hashString(`log:followup:${query}:${mode}:${session.ts}`),
        query,
        group: normalizeQueryGroup(query),
        mode,
        conflict: conflictStateFromPages(run, session.firstTurnPages),
        sources: sourceMetaFromPages(session.firstTurnPages),
        label,
        labelSource: "observed_candidate",
        followupQuery: run.followupQuery || null,
        firstTurnUrls: session.firstTurnPages.map((page) => page.url).filter(Boolean),
        meta: provenance(session),
      });
      report.labels.followup[label] = (report.labels.followup[label] || 0) + 1;
    }
  }

  const dedupedExamples = dedupeRows(examples, (row) => `${row.task}:${row.query}:${row.meta?.mode || ""}:${row.label}`);
  const dedupedFollowup = dedupeRows(followup, (row) => `${row.query}:${row.mode}:${row.label}:${JSON.stringify(row.sources)}`);

  return {
    examples: dedupedExamples,
    domainDraft: dedupedExamples.filter((row) => row.task === "domain").map((row) => ({
      query: row.query,
      candidateLabel: row.label,
      suggestedLabel: row.label,
      rationale: "Heuristic domain label from production log candidate; requires review before gold merge.",
      inputText: row.inputText,
      meta: row.meta,
      reviewSource: "candidate_heuristic",
    })),
    sufficiencyDraft: dedupedExamples.filter((row) => row.task === "sufficiency").map((row) => ({
      query: row.query,
      candidateLabel: row.label,
      rationale: "",
      inputText: row.inputText,
      meta: { ...row.meta, labelSource: row.labelSource },
    })),
    conflictDraft: dedupedExamples.filter((row) => row.task === "conflict").map((row) => ({
      query: row.query,
      candidateLabel: row.label,
      rationale: "",
      inputText: row.inputText,
      meta: { ...row.meta, labelSource: row.labelSource },
    })),
    followupDraft: dedupedFollowup,
    report,
  };
}

export function prelabelRows(task, rows = []) {
  if (task === "domain") {
    return rows.map((row) => ({
      query: row.query,
      label: row.suggestedLabel || row.candidateLabel,
      rationale: row.rationale || "Heuristic domain label; review before gold merge.",
      inputText: row.inputText || row.query || "",
      candidateLabel: row.candidateLabel || row.suggestedLabel || "",
      meta: row.meta || {},
      reviewSource: "heuristic_prelabel",
    }));
  }

  if (task === "followup") {
    return rows.map((row) => ({
      query: row.query,
      label: row.label,
      rationale: "Observed follow-up action from a completed log session; review before gold merge.",
      inputText: row.query,
      candidateLabel: row.label,
      meta: row.meta || {},
      reviewSource: "observed_prelabel",
    }));
  }

  return rows.map((row) => {
    const suggestion = suggestAnnotation(task, row);
    return {
      query: row.query,
      label: suggestion.label,
      rationale: suggestion.rationale,
      inputText: row.inputText || "",
      candidateLabel: row.candidateLabel || row.label || "",
      meta: row.meta && typeof row.meta === "object" ? row.meta : {},
      reviewSource: "ai_prelabel",
    };
  });
}

function writeJsonl(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const args = {
    logs: [join(homedir(), ".pi", "logs", "emet.jsonl"), join(homedir(), ".pi", "logs", "pi-research.jsonl")],
    outDir: "data/router/log-candidates",
    followupOutDir: "data/followup/log-candidates",
    maxQueryOccurrences: 10,
    includeInternal: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--logs") args.logs = String(argv[++index] || "").split(",").filter(Boolean);
    else if (arg === "--out-dir") args.outDir = argv[++index];
    else if (arg === "--followup-out-dir") args.followupOutDir = argv[++index];
    else if (arg === "--max-query-occurrences") args.maxQueryOccurrences = Number(argv[++index]);
    else if (arg === "--include-internal") args.includeInternal = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/router/build-log-training-candidates.mjs [--logs a.jsonl,b.jsonl] [--out-dir data/router/log-candidates]",
    "Builds cleaned, review-required training candidates from research logs. It never writes gold files or trainable model artifacts.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const events = readLogEvents(args.logs);
  const sessions = parseResearchSessionsFromLogEvents(events);
  const candidates = buildCandidateSets(sessions, args);

  writeJsonl(join(args.outDir, "examples.jsonl"), candidates.examples);
  writeJsonl(join(args.outDir, "domain-draft.jsonl"), candidates.domainDraft);
  writeJsonl(join(args.outDir, "domain-ai-reviewed.jsonl"), prelabelRows("domain", candidates.domainDraft));
  writeJsonl(join(args.outDir, "sufficiency-draft.jsonl"), candidates.sufficiencyDraft);
  writeJsonl(join(args.outDir, "sufficiency-ai-reviewed.jsonl"), prelabelRows("sufficiency", candidates.sufficiencyDraft));
  writeJsonl(join(args.outDir, "conflict-draft.jsonl"), candidates.conflictDraft);
  writeJsonl(join(args.outDir, "conflict-ai-reviewed.jsonl"), prelabelRows("conflict", candidates.conflictDraft));
  writeJsonl(join(args.followupOutDir, "followup-draft.jsonl"), candidates.followupDraft);
  writeJsonl(join(args.followupOutDir, "followup-ai-reviewed.jsonl"), prelabelRows("followup", candidates.followupDraft));
  writeJson(join(args.outDir, "report.json"), candidates.report);

  console.log(JSON.stringify({
    events: events.length,
    sessions: sessions.length,
    keptSessions: candidates.report.keptSessions,
    skipped: candidates.report.skipped,
    examples: candidates.examples.length,
    domainDraft: candidates.domainDraft.length,
    sufficiencyDraft: candidates.sufficiencyDraft.length,
    conflictDraft: candidates.conflictDraft.length,
    followupDraft: candidates.followupDraft.length,
    outDir: args.outDir,
    followupOutDir: args.followupOutDir,
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
