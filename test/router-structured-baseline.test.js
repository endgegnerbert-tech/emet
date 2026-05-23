import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateConflictBaselineRow,
  evaluateSufficiencyBaselineRow,
  parseSourcesFromInputText,
  predictConflictBaseline,
  predictSufficiencyBaseline,
} from "../scripts/router/eval_structured_baselines.mjs";

test("parseSourcesFromInputText extracts source entries from draft text", () => {
  const sources = parseSourcesFromInputText(`Query: demo\n\nSources:\n[official_doc] Node docs\n\n[blog] Some blog`);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].sourceType, "official_doc");
  assert.equal(sources[1].title, "Some blog");
  assert.match(sources[0].url, /^https:\/\/official_doc-0\.example\.test\//);
});

test("predictConflictBaseline maps current heuristic into structured labels", () => {
  const noConflict = predictConflictBaseline({
    query: "Node docs how to run tests",
    inputText: `Query: x\n\nSources:\n[official_doc] Node docs\n\n[github_readme] README`,
  });
  assert.equal(noConflict, "no_conflict");
});

test("predictSufficiencyBaseline maps current heuristic into structured labels", () => {
  const needAuthority = predictSufficiencyBaseline({
    query: "Current node LTS version",
    inputText: `Query: x\n\nSources:\n[blog] Node blog rumour`,
    meta: { sourceCount: 1, authoritativeSourcesFound: false },
  });
  assert.equal(needAuthority, "need_authority");
});

test("evaluateConflictBaselineRow includes gold and prediction", () => {
  const row = evaluateConflictBaselineRow({
    query: "React server components performance",
    label: "no_conflict",
    inputText: `Query: x\n\nSources:\n[official_doc] React docs\n\n[blog] Performance opinions`,
    meta: { mode: "deep" },
  });

  assert.equal(row.gold, "no_conflict");
  assert.equal(row.predicted, "no_conflict");
});

test("evaluateSufficiencyBaselineRow includes heuristic diagnostics", () => {
  const row = evaluateSufficiencyBaselineRow({
    query: "retrieval augmented generation papers",
    label: "need_more_sources",
    inputText: `Query: x\n\nSources:\n[paper] Paper`,
    meta: { mode: "academic", sourceCount: 1, authoritativeSourcesFound: true },
  });

  assert.equal(row.gold, "need_more_sources");
  assert.equal(typeof row.sufficient, "boolean");
  assert.ok(Array.isArray(row.missingAspects));
});
