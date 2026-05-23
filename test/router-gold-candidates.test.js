import test from "node:test";
import assert from "node:assert/strict";

import { buildConflictGoldCandidates, buildSufficiencyGoldCandidates } from "../scripts/router/prepare-gold-candidates.mjs";

test("buildConflictGoldCandidates exports structured manual-label candidates", () => {
  const candidates = buildConflictGoldCandidates([
    {
      task: "conflict",
      query: "Is Python 3.12 GIL-free?",
      inputText: "Query: Is Python 3.12 GIL-free?\n\nSources:\n[official_doc] PEP 703\nOptional build flag",
      label: "conflict",
      labelSource: "candidate_only",
      meta: { mode: "fast", sourceCount: 2, conflictSummary: "Sources disagree." },
    },
    {
      task: "sufficiency",
      query: "ignore me",
      inputText: "",
      label: "insufficient",
      labelSource: "pipeline",
      meta: { mode: "fast", sourceCount: 1 },
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].query, "Is Python 3.12 GIL-free?");
  assert.equal(candidates[0].candidateLabel, "conflict");
  assert.equal(candidates[0].rationale, "");
  assert.match(candidates[0].inputText, /PEP 703/);
  assert.equal(candidates[0].meta.sourceCount, 2);
});

test("buildSufficiencyGoldCandidates exports structured manual-label candidates", () => {
  const candidates = buildSufficiencyGoldCandidates([
    {
      task: "sufficiency",
      query: "Current node LTS version",
      inputText: "Query: Current node LTS version\n\nSources:\n[blog] Blog post\nNode version maybe 22",
      label: "insufficient",
      labelSource: "pipeline",
      meta: { mode: "fast", sourceCount: 1, authoritativeSourcesFound: false },
    },
    {
      task: "domain",
      query: "ignore me",
      inputText: "",
      label: "web",
      labelSource: "heuristic",
      meta: { mode: "fast" },
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].query, "Current node LTS version");
  assert.equal(candidates[0].candidateLabel, "insufficient");
  assert.equal(candidates[0].rationale, "");
  assert.match(candidates[0].inputText, /Node version maybe 22/);
  assert.equal(candidates[0].meta.authoritativeSourcesFound, false);
});
