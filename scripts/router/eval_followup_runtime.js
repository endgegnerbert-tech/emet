import fs from "node:fs";
import path from "node:path";
import { classifyFollowupWithTinyRouter, stopTinyRouterDaemon } from "../../lib/tiny-router.js";

const rows = fs.readFileSync(path.join(process.cwd(), "data", "followup", "gold-followup.jsonl"), "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const env = {
  EMET_TINY_ROUTER: "1",
  EMET_TINY_ROUTER_FOLLOWUP: "1",
  EMET_TINY_ROUTER_MODEL: path.join(process.cwd(), ".cache", "models", "emet-router"),
  EMET_TINY_ROUTER_PYTHON: path.join(process.cwd(), ".venv-router", "bin", "python"),
  EMET_TINY_ROUTER_TIMEOUT_MS: "1000",
};

const report = {
  total: rows.length,
  correct: 0,
  rows: [],
};

for (const row of rows) {
  const predicted = await classifyFollowupWithTinyRouter(row.query, row.mode, row.conflict, row.sources, undefined, env);
  if (predicted === row.label) report.correct += 1;
  report.rows.push({
    query: row.query,
    mode: row.mode,
    gold: row.label,
    predicted,
  });
}

report.accuracy = report.total ? report.correct / report.total : 0;
fs.mkdirSync(path.join(process.cwd(), "metrics", "router"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), "metrics", "router", "followup-runtime-gold.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ total: report.total, accuracy: report.accuracy }, null, 2));
stopTinyRouterDaemon();
