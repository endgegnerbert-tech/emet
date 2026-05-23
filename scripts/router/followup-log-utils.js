import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_RESEARCH_LOG_PATH = process.env.EMET_LOG_PATH || path.join(os.homedir(), ".pi", "logs", "emet.jsonl");

export function isAuthoritativeSource(source = {}) {
  return Boolean(source.authoritative) || ["official_doc", "github_readme", "github_repo", "paper"].includes(source.sourceType);
}

export function sourceMetaFromPages(pages = []) {
  return {
    has_authority: pages.some(isAuthoritativeSource),
    has_forum: pages.some((source) => source.sourceType === "forum" || /forum|reddit|stack/i.test(source.url || "")),
    has_news: pages.some((source) => source.sourceType === "news" || /news|blog|article/i.test(source.url || "")),
    has_recent: pages.some((source) => source.freshness === "recent" || source.freshness === "current_year"),
    source_count: pages.length,
  };
}

export function observedActionFromResult(result = {}) {
  if (Number(result.followupRounds || 0) === 0) return "stop";

  const followupQuery = String(result.followupQuery || "").toLowerCase();
  if (followupQuery.includes("support status") || result.conflictDetected) return "need_conflict_resolution";
  if (/\b(latest|current|2024|2025|release|changelog)\b/.test(followupQuery)) return "need_recency";
  if (/\b(arxiv|doi|publisher|primary source|announcement)\b/.test(followupQuery)) return "need_primary_source";
  if (/\b(version|migration|upgrade|v\d+)\b/.test(followupQuery)) return "need_version_context";
  if (/\b(official docs|documentation|readme|authority|authoritative)\b/.test(followupQuery)) return "need_authority";
  return "need_more_sources";
}

export function conflictStateFromPages(result = {}, firstTurnPages = []) {
  if (!result.conflictDetected) return "none";
  return sourceMetaFromPages(firstTurnPages).has_authority ? "minor" : "severe";
}

export function normalizeQueryGroup(query = "") {
  return String(query)
    .toLowerCase()
    .replace(/\b(2024|2025|2026|v\d+)\b/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSessionsFromLog(logPath = DEFAULT_RESEARCH_LOG_PATH, cwd = process.cwd()) {
  const sessions = [];
  const active = new Map();
  if (!fs.existsSync(logPath)) return sessions;

  const lines = fs.readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.cwd !== cwd) continue;
    const data = event.data || {};

    if (event.type === "research_start") {
      active.set(event.pid, {
        pid: event.pid,
        ts: event.ts,
        query: data.query,
        mode: data.mode || "fast",
        inFollowup: false,
        firstTurnPages: [],
        result: null,
      });
      continue;
    }

    const session = active.get(event.pid);
    if (!session) continue;

    if (event.type === "pipeline_stage" && data.stage === "followup") {
      session.inFollowup = true;
      continue;
    }

    if (event.type === "page_fetch_results" && !session.inFollowup) {
      session.firstTurnPages.push(...(data.pages || []));
      continue;
    }

    if (event.type === "research_end") {
      session.result = data;
      sessions.push(session);
      active.delete(event.pid);
    }
  }

  return sessions;
}
