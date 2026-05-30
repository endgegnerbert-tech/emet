#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildEvidenceState } from "../../lib/research-evidence.js";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function traceFromResult(result = {}) {
  return result.runtimeTrace || result.trace || (result.final || result.turns ? result : null);
}

function stateFromTurn(trace = {}, turn = {}, index = 0, fallbackQuery = "") {
  if (turn.evidenceState) return turn.evidenceState;
  return buildEvidenceState({
    query: trace.query || trace.final?.query || fallbackQuery,
    sources: turn.mergedPages || turn.rankedPages || [],
    config: trace.config || {},
    turn: turn.turn || index + 1,
    action: "replay_turn",
    conflict: turn.conflict || null,
    sufficiency: turn.sufficiency || null,
    followup: turn.followup || null,
    stopReason: turn.stopReason || null,
  });
}

function finalStateFromTrace(trace = {}, fallbackQuery = "") {
  if (trace.final?.evidenceState) return trace.final.evidenceState;
  return buildEvidenceState({
    query: trace.query || fallbackQuery,
    sources: trace.final?.mergedPages || [],
    config: trace.config || {},
    turn: Array.isArray(trace.turns) ? trace.turns.length : null,
    action: "replay_final",
    stopReason: trace.turns?.at?.(-1)?.stopReason || null,
  });
}

export function extractEvidenceStatesFromResult(result = {}) {
  const trace = traceFromResult(result);
  if (!trace) return [];
  const states = [];
  for (const [index, turn] of (trace.turns || []).entries()) states.push(stateFromTurn(trace, turn, index, result.query || ""));
  states.push(finalStateFromTrace(trace, result.query || ""));
  return states.filter(Boolean);
}

export function extractEvidenceStatesFromLogEvents(events = []) {
  return events
    .filter((event) => event?.type === "research_end")
    .flatMap((event) => extractEvidenceStatesFromResult(event.data || {}));
}

export function summarizeEvidenceStates(states = []) {
  return states.map((state, index) => ({
    index,
    schemaVersion: state.schemaVersion,
    turn: state.turn,
    action: state.action,
    stopReason: state.stopReason || null,
    domain_family: state.domain_family,
    overlays: state.overlays || [],
    source_policy_flags: state.source_policy_flags || [],
    source_count: state.summary?.source_count ?? state.sources?.length ?? 0,
    authoritative_source_count: state.summary?.authoritative_source_count ?? 0,
    recent_source_count: state.summary?.recent_source_count ?? 0,
    version_match_source_count: state.summary?.version_match_source_count ?? 0,
    edge_count: state.edges?.length || 0,
  }));
}

export function readEvidenceStatesFromFile(path) {
  const text = readFileSync(path, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];

  const json = safeJsonParse(trimmed);
  if (json) {
    if (Array.isArray(json)) return json.flatMap((item) => extractEvidenceStatesFromResult(item));
    return extractEvidenceStatesFromResult(json);
  }

  const events = trimmed.split("\n").map(safeJsonParse).filter(Boolean);
  return extractEvidenceStatesFromLogEvents(events);
}

function usage() {
  return [
    "Usage: node scripts/router/replay-evidence-trace.mjs [path] [--full]",
    "",
    "Reads an emet JSONL log or a saved runtimeTrace/result JSON and prints replayed evidence-state summaries.",
    "Default path: ~/.pi/logs/emet.jsonl",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }
  const full = args.includes("--full");
  const path = args.find((arg) => !arg.startsWith("-")) || join(homedir(), ".pi", "logs", "emet.jsonl");
  if (!existsSync(path)) {
    console.error(`Evidence trace file not found: ${path}`);
    process.exit(1);
  }
  const states = readEvidenceStatesFromFile(path);
  console.log(JSON.stringify(full ? states : summarizeEvidenceStates(states), null, 2));
}
