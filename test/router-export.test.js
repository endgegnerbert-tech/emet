import test from "node:test";
import assert from "node:assert/strict";
import { exportExamples } from "../scripts/router/export-examples.mjs";

test("exportExamples extracts domain, sufficiency, and conflict tasks", () => {
  const cache = {
    a: {
      value: {
        ok: true,
        action: "web_research",
        query: "React versus Vue",
        mode: "fast",
        sufficient: true,
        conflictDetected: true,
        meta: {
          versionContext: { versionSensitive: true, explicitVersion: true, normalizedTokens: [{ normalized: "2022-11-28" }] },
          versionCoverage: { exactMatchSources: 1, mismatchSources: 0 },
        },
        sources: [
          { title: "React", snippet: "React docs", sourceType: "official_doc" },
          { title: "Vue", snippet: "Vue docs", sourceType: "official_doc" }
        ]
      }
    },
    b: {
      value: {
        ok: true,
        action: "web_research",
        query: "CVE-2024-3094",
        mode: "fast",
        sufficient: false, // only 1 source, so no conflict exported
        conflictDetected: false,
        sources: [
          { title: "NVD", snippet: "Advisory", sourceType: "official_doc" }
        ]
      }
    }
  };

  const examples = exportExamples(cache);
  
  const domains = examples.filter(e => e.task === "domain");
  const sufficiencies = examples.filter(e => e.task === "sufficiency");
  const conflicts = examples.filter(e => e.task === "conflict");

  assert.equal(domains.length, 2);
  assert.equal(sufficiencies.length, 2);
  assert.equal(conflicts.length, 1); // Run B has only 1 source, so no conflict

  // Check Domain task
  const secDomain = domains.find(d => d.query === "CVE-2024-3094");
  assert.equal(secDomain.label, "security");
  assert.equal(secDomain.risk, "high");
  assert.equal(secDomain.labelSource, "heuristic");

  // Check Sufficiency task
  const suff = sufficiencies.find(s => s.query === "CVE-2024-3094");
  assert.equal(suff.label, "insufficient");
  assert.equal(suff.labelSource, "pipeline");

  // Check Conflict task
  assert.equal(conflicts[0].label, "conflict");
  assert.equal(conflicts[0].labelSource, "candidate_only");
  assert.equal(sufficiencies.find((s) => s.query === "React versus Vue").meta.versionContext.explicitVersion, true);
  assert.equal(conflicts[0].meta.versionCoverage.exactMatchSources, 1);
});
