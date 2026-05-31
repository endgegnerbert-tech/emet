import fs from "node:fs";
import path from "node:path";
import {
  conflictStateFromPages,
  normalizeQueryGroup,
  observedActionFromResult,
  parseSessionsFromLog,
  sourceMetaFromPages,
} from "../utils/followup-log-utils.js";

const outPath = path.join(process.cwd(), "data", "followup", "real-candidates.jsonl");

function dedupeSessions(sessions) {
  const byKey = new Map();
  for (const session of sessions) {
    if (!session.result?.ok || !session.firstTurnPages.length) continue;
    const key = JSON.stringify([
      normalizeQueryGroup(session.query),
      session.mode,
      observedActionFromResult(session.result),
      session.result.followupQuery || null,
      sourceMetaFromPages(session.firstTurnPages),
    ]);
    byKey.set(key, session);
  }
  return [...byKey.values()];
}

const sessions = dedupeSessions(parseSessionsFromLog());
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const out = fs.createWriteStream(outPath);
for (const session of sessions) {
  const row = {
    id: `${session.pid}:${session.ts}`,
    query: session.query,
    group: normalizeQueryGroup(session.query),
    mode: session.mode,
    conflict: conflictStateFromPages(session.result, session.firstTurnPages),
    sources: sourceMetaFromPages(session.firstTurnPages),
    label: observedActionFromResult(session.result),
    followupQuery: session.result.followupQuery || null,
    firstTurnUrls: session.firstTurnPages.map((page) => page.url),
  };
  out.write(`${JSON.stringify(row)}\n`);
}
out.end();
console.log(`Wrote ${sessions.length} followup candidates to ${outPath}`);
