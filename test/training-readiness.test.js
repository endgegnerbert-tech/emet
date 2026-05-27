import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { auditTask, auditTrainingReadiness } from "../scripts/router/audit-training-readiness.mjs";

function writeJsonl(path, rows) {
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

test("auditTask blocks prelabel-only candidates from promotion", () => {
  const dir = mkdtempSync(join(tmpdir(), "emet-audit-"));
  const gold = join(dir, "gold.jsonl");
  const candidates = join(dir, "candidates.jsonl");
  writeJsonl(gold, [
    { query: "a", label: "x" },
    { query: "b", label: "x" },
    { query: "c", label: "y" },
    { query: "d", label: "y" },
  ]);
  writeJsonl(candidates, [{ query: "new", label: "x", reviewSource: "ai_prelabel" }]);

  const report = auditTask("demo", { gold, candidates, minClassCount: 2 });
  assert.equal(report.promoteSafe, false);
  assert.equal(report.reviewedCandidateRows, 0);
  assert.ok(report.warnings.includes("new_candidates_not_human_reviewed"));
  assert.ok(report.warnings.includes("prelabels_must_not_be_promoted_without_review"));
});

test("auditTask blocks reviewed candidates without confidence", () => {
  const dir = mkdtempSync(join(tmpdir(), "emet-audit-confidence-"));
  const gold = join(dir, "gold.jsonl");
  const candidates = join(dir, "candidates.jsonl");
  writeJsonl(gold, [
    { query: "a", label: "x" },
    { query: "b", label: "x" },
    { query: "c", label: "y" },
    { query: "d", label: "y" },
  ]);
  writeJsonl(candidates, [{ query: "new", label: "x", reviewSource: "pi_review" }]);

  const report = auditTask("demo", { gold, candidates, minClassCount: 2 });
  assert.equal(report.promoteSafe, false);
  assert.equal(report.missingConfidenceCandidateRows, 1);
  assert.ok(report.warnings.includes("candidate_missing_review_confidence"));
});

test("auditTrainingReadiness passes only when every task is clean", () => {
  const dir = mkdtempSync(join(tmpdir(), "emet-audit-all-"));
  const tasks = {};
  for (const task of ["a", "b"]) {
    const gold = join(dir, `${task}-gold.jsonl`);
    const candidates = join(dir, `${task}-candidates.jsonl`);
    writeJsonl(gold, [
      { query: `${task}-1`, label: "x" },
      { query: `${task}-2`, label: "x" },
      { query: `${task}-3`, label: "y" },
      { query: `${task}-4`, label: "y" },
    ]);
    writeJsonl(candidates, []);
    tasks[task] = { gold, candidates, minClassCount: 2 };
  }

  const report = auditTrainingReadiness(tasks);
  assert.equal(report.promoteSafe, true);
});
