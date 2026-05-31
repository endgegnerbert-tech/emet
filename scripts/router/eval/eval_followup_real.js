import fs from "node:fs";
import path from "node:path";
import { classifyFollowupWithTinyRouter, stopTinyRouterDaemon } from "../../../lib/tiny-router.js";
import {
  conflictStateFromPages,
  observedActionFromResult,
  parseSessionsFromLog,
  sourceMetaFromPages,
} from "../utils/followup-log-utils.js";

const cachePath = path.join(process.cwd(), ".cache", "research-cache.json");

const rawCache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
const cacheRuns = Object.values(rawCache).map((entry) => entry.value).filter(Boolean);

const env = {
  EMET_TINY_ROUTER: "1",
  EMET_TINY_ROUTER_FOLLOWUP: "1",
  EMET_TINY_ROUTER_MODEL: path.join(process.cwd(), ".cache", "models", "emet-router"),
  EMET_TINY_ROUTER_PYTHON: path.join(process.cwd(), ".venv-router", "bin", "python"),
  EMET_TINY_ROUTER_TIMEOUT_MS: "1000",
};



function uniqueRecentSessions(sessions) {
  // Keep the latest session per query/mode/followupQuery to avoid repeated test fixture runs dominating metrics.
  const byKey = new Map();
  for (const session of sessions) {
    if (!session.result?.ok) continue;
    const key = JSON.stringify([session.query, session.mode, session.result.followupQuery || null, session.result.followupRounds || 0]);
    byKey.set(key, session);
  }
  return [...byKey.values()];
}

function confusionKey(expected, actual) {
  return `${expected} -> ${actual}`;
}

async function evaluateRows(rows) {
  const counts = {};
  const confusion = {};
  let binaryCorrect = 0;
  let actionCorrect = 0;

  for (const row of rows) {
    row.predicted = await classifyFollowupWithTinyRouter(
      row.query,
      row.mode,
      row.conflict,
      row.sourcesMeta,
      undefined,
      env,
    ) || "heuristic_fallback";

    const expectedBinary = row.expected === "stop" ? "stop" : "followup";
    const predictedBinary = row.predicted === "stop" ? "stop" : "followup";
    if (expectedBinary === predictedBinary) binaryCorrect += 1;
    if (row.expected === row.predicted) actionCorrect += 1;

    counts[row.predicted] = (counts[row.predicted] || 0) + 1;
    confusion[confusionKey(row.expected, row.predicted)] = (confusion[confusionKey(row.expected, row.predicted)] || 0) + 1;
  }

  return {
    binaryAccuracy: rows.length ? binaryCorrect / rows.length : 0,
    actionAccuracy: rows.length ? actionCorrect / rows.length : 0,
    predictionCounts: counts,
    confusion,
  };
}

async function main() {
  const logSessions = uniqueRecentSessions(parseSessionsFromLog());
  const followupSessions = logSessions.filter((session) => Number(session.result.followupRounds || 0) > 0 && session.firstTurnPages.length > 0);
  const stopSessions = logSessions.filter((session) => Number(session.result.followupRounds || 0) === 0 && session.result.sufficient === true && session.result.followupRecommended === false && session.firstTurnPages.length > 0);

  const rows = [...followupSessions, ...stopSessions].map((session) => ({
    query: session.query,
    mode: session.mode,
    followupRounds: session.result.followupRounds || 0,
    expected: observedActionFromResult(session.result),
    predicted: null,
    conflict: conflictStateFromPages(session.result, session.firstTurnPages),
    sourceCount: session.firstTurnPages.length,
    authoritative: sourceMetaFromPages(session.firstTurnPages).has_authority,
    sourcesMeta: sourceMetaFromPages(session.firstTurnPages),
    firstTurnUrls: session.firstTurnPages.map((page) => page.url),
    followupQuery: session.result.followupQuery,
  }));

  const metrics = await evaluateRows(rows);
  const report = {
    note: "Real-run silver validation from ~/.pi/logs/emet.jsonl. Inputs use first-turn fetched pages; action labels are inferred from actual stored followupQuery/followupRounds, not synthetic training data. This is not hand-labeled gold.",
    cacheRuns: cacheRuns.length,
    logSessions: logSessions.length,
    evalRuns: rows.length,
    followupRuns: followupSessions.length,
    stopRuns: stopSessions.length,
    ...metrics,
    rows,
  };

  fs.mkdirSync(path.join(process.cwd(), "metrics", "router"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "metrics", "router", "followup-real-cache-eval.json"), JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    cacheRuns: report.cacheRuns,
    logSessions: report.logSessions,
    evalRuns: report.evalRuns,
    followupRuns: report.followupRuns,
    stopRuns: report.stopRuns,
    binaryAccuracy: report.binaryAccuracy,
    actionAccuracy: report.actionAccuracy,
    predictionCounts: report.predictionCounts,
    confusion: report.confusion,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  stopTinyRouterDaemon();
});
