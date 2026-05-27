import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { auditDataGovernance } from "../scripts/router/audit-data-governance.mjs";

function writeJsonl(path, rows) {
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("auditDataGovernance passes reviewed train rows, gold holdout, split separation, and privacy manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "emet-governance-"));
  const train = join(dir, "train.jsonl");
  const gold = join(dir, "gold.jsonl");
  const splits = join(dir, "splits.json");
  const manifest = join(dir, "datasets.json");

  writeJsonl(train, [{
    query: "CVE-2024-3094 xz utils",
    label: "security",
    confidence: 0.95,
    needs_human_review: false,
    reviewSource: "pi_review",
  }]);
  writeJsonl(gold, [{ query: "React 19 release notes", label: "changelog", rationale: "versioned release query" }]);
  writeJson(splits, { trainIds: ["a"], valIds: ["b"], testIds: ["c"] });
  writeJson(manifest, { aol_query_log: { status: "not_downloaded_privacy_sensitive_opt_in_only", localPath: null, notes: "privacy-sensitive" } });

  const report = auditDataGovernance({
    trainFiles: [{ task: "domain", path: train }],
    goldFiles: [{ task: "domain", path: gold }],
    splits,
    manifest,
  });

  assert.equal(report.ok, true);
  assert.equal(report.trainFiles[0].missingConfidenceRows, 0);
  assert.equal(report.goldHoldouts[0].rows, 1);
});

test("auditDataGovernance blocks prelabel train rows and downloaded AOL logs", () => {
  const dir = mkdtempSync(join(tmpdir(), "emet-governance-bad-"));
  const train = join(dir, "train.jsonl");
  const gold = join(dir, "gold.jsonl");
  const splits = join(dir, "splits.json");
  const manifest = join(dir, "datasets.json");

  writeJsonl(train, [{ query: "latest package status", label: "web", reviewSource: "ai_prelabel" }]);
  writeJsonl(gold, [{ query: "React 19 release notes", label: "changelog", rationale: "versioned release query" }]);
  writeJson(splits, { trainIds: ["a"], valIds: ["b"], testIds: ["c"] });
  writeJson(manifest, { aol_query_log: { status: "downloaded", localPath: "/tmp/aol", notes: "" } });

  const report = auditDataGovernance({
    trainFiles: [{ task: "domain", path: train }],
    goldFiles: [{ task: "domain", path: gold }],
    splits,
    manifest,
  });

  assert.equal(report.ok, false);
  assert.equal(report.trainFiles[0].prelabelRows, 1);
  assert.equal(report.trainFiles[0].validationErrors.prelabel_not_trainable, 1);
  assert.ok(report.manifest.errors.includes("aol_query_log_has_local_path"));
});
