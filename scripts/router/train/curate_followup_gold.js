import fs from "node:fs";
import path from "node:path";

const inputPath = path.join(process.cwd(), "data", "followup", "real-candidates.jsonl");
const outPath = path.join(process.cwd(), "data", "followup", "gold-followup.jsonl");

const rows = fs.readFileSync(inputPath, "utf-8").split("\n").filter(Boolean).map((line) => JSON.parse(line));

function curateLabel(row) {
  const query = String(row.query || "").toLowerCase();
  const mode = row.mode;
  const sources = row.sources || {};

  if (query === "topic guidance" && mode === "deep" && sources.has_authority && sources.source_count === 1) {
    return {
      label: "need_more_sources",
      rationale: "Deep mode already has one authoritative source; the next step is breadth, not more authority.",
    };
  }

  if (query === "retrieval augmented generation papers" && mode === "academic" && sources.has_authority && sources.source_count === 3) {
    return {
      label: "need_primary_source",
      rationale: "Academic paper query already has scholarly sources; the next step is primary-paper triangulation, not generic docs.",
    };
  }

  if (row.label === "stop" && row.conflict === "severe" && !sources.has_authority) {
    return null;
  }

  if (row.label !== "stop" && typeof row.followupQuery !== "string") {
    return null;
  }

  return {
    label: row.label,
    rationale: "Derived from real run followup behavior.",
  };
}

const curated = [];
for (const row of rows) {
  const decision = curateLabel(row);
  if (!decision) continue;
  curated.push({
    ...row,
    label: decision.label,
    rationale: decision.rationale,
  });
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, curated.map((row) => JSON.stringify(row)).join("\n") + "\n");
console.log(`Wrote ${curated.length} curated rows to ${outPath}`);
