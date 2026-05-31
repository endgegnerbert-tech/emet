import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { auditImplementationRoadmap } from "../scripts/router/audit-implementation-roadmap.mjs";

function writeFile(path, value = "ok\n") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function writeJson(path, value) {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonl(path, rows) {
  writeFile(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

const fixtureSlices = [
  {
    id: "fixture-slice",
    title: "fixture slice",
    checks: [
      { kind: "file", name: "artifact", path: "artifact.txt" },
      { kind: "contains", name: "flag", path: "flags.txt", text: "EMET_TINY_ROUTER" },
      { kind: "jsonl_min_rows", name: "rows", path: "rows.jsonl", minRows: 2 },
      { kind: "json_number_equals", name: "zero_risk", path: "metrics.json", fieldPath: ["high_risk_downgrades"], expected: 0 },
      {
        kind: "any",
        name: "metric_choice",
        checks: [
          { kind: "file", name: "missing_primary_metric", path: "missing-primary.json" },
          { kind: "file", name: "fallback_metric", path: "fallback.json" },
        ],
      },
    ],
  },
];

test("auditImplementationRoadmap passes when all slice evidence is present", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "emet-roadmap-pass-"));
  writeFile(join(baseDir, "artifact.txt"));
  writeFile(join(baseDir, "flags.txt"), "EMET_TINY_ROUTER=1\n");
  writeJsonl(join(baseDir, "rows.jsonl"), [{ id: 1 }, { id: 2 }]);
  writeJson(join(baseDir, "metrics.json"), { high_risk_downgrades: 0 });
  writeJson(join(baseDir, "fallback.json"), { macro_f1: 0.9 });

  const report = auditImplementationRoadmap({ baseDir, slices: fixtureSlices });

  assert.equal(report.allSlicesReady, true);
  assert.equal(report.slices[0].pass, true);
  assert.equal(report.slices[0].checks.every((check) => check.pass), true);
});

test("auditImplementationRoadmap fails closed on missing evidence or unsafe metrics", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "emet-roadmap-fail-"));
  writeFile(join(baseDir, "artifact.txt"));
  writeFile(join(baseDir, "flags.txt"), "EMET_TINY_ROUTER=1\n");
  writeJsonl(join(baseDir, "rows.jsonl"), [{ id: 1 }, { id: 2 }]);
  writeJson(join(baseDir, "metrics.json"), { high_risk_downgrades: 1 });

  const report = auditImplementationRoadmap({ baseDir, slices: fixtureSlices });
  const failedChecks = report.slices[0].checks.filter((check) => !check.pass);

  assert.equal(report.allSlicesReady, false);
  assert.deepEqual(failedChecks.map((check) => check.name), ["zero_risk", "metric_choice"]);
  assert.ok(failedChecks[0].warnings.includes("unexpected_number"));
  assert.ok(failedChecks[1].warnings.includes("no_alternative_passed"));
});
