import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { analyzeResearchCache, writeAuditReport } from "../scripts/router/audit-cache.mjs";

test("analyzeResearchCache summarizes usable research runs deterministically", () => {
  const cache = {
    a: {
      expiresAt: Date.now() + 1000,
      value: {
        ok: true,
        action: "web_research",
        query: "CVE-2024-3094 advisory impact",
        mode: "fast",
        sufficient: false,
        conflictDetected: true,
        conflictSummary: "Sources disagree.",
        conflictingSourcePairs: [[0, 1]],
        authoritativeSourcesFound: true,
        sourceTypes: ["official_doc", "blog"],
        sources: [
          { title: "NVD", url: "https://nvd.nist.gov/vuln/detail/CVE-2024-3094", sourceType: "official_doc" },
          { title: "Blog", url: "https://example.com/blog", sourceType: "blog" },
        ],
      },
    },
    b: {
      value: {
        ok: true,
        action: "web_research",
        query: "GitHub issue about pnpm recursive install",
        mode: "deep",
        sufficient: true,
        conflictDetected: false,
        authoritativeSourcesFound: false,
        sources: [{ title: "Issue", url: "https://github.com/pnpm/pnpm/issues/1", sourceType: "github_repo" }],
      },
    },
    c: {
      value: {
        ok: true,
        action: "web_research",
        query: "github issue about pnpm recursive install?",
        mode: "fast",
        sufficient: true,
        conflictDetected: false,
        sources: [],
      },
    },
    ignored: { value: { ok: false, action: "other" } },
  };

  const report = analyzeResearchCache(cache);

  assert.equal(report.totalEntries, 4);
  assert.equal(report.usableRuns, 3);
  assert.deepEqual(report.modes, { deep: 1, fast: 2 });
  assert.equal(report.domains.security, 1);
  assert.equal(report.domains.github, 2);
  assert.deepEqual(report.sufficient, { false: 1, true: 2 });
  assert.deepEqual(report.conflictDetected, { false: 2, true: 1 });
  assert.equal(report.sourceTypes.official_doc, 1);
  assert.equal(report.sourceTypes.github_repo, 1);
  assert.equal(report.duplicateNormalizedQueries.length, 1);
  assert.equal(report.highRiskDomains.security, 1);
  assert.equal(report.conflictCandidates.length, 1);
  assert.equal(report.missingFields.authoritativeSourcesFound, 1);
});

test("writeAuditReport writes JSON report", () => {
  const root = mkdtempSync(join(tmpdir(), "router-audit-"));
  const out = join(root, "nested", "report.json");

  try {
    const report = writeAuditReport({ one: { value: { ok: true, action: "web_research", query: "what is react", sources: [] } } }, out);
    const written = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(written.usableRuns, 1);
    assert.deepEqual(written, report);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
