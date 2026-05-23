import test from "node:test";
import assert from "node:assert/strict";

import { selectGoldDraftCandidates } from "../scripts/router/sample-gold-draft.mjs";

test("selectGoldDraftCandidates excludes existing gold and keeps diversity", () => {
  const selected = selectGoldDraftCandidates([
    { query: "a", candidateLabel: "conflict", inputText: "a", rationale: "", meta: { mode: "fast", sourceCount: 2 } },
    { query: "b", candidateLabel: "no_conflict", inputText: "b", rationale: "", meta: { mode: "deep", sourceCount: 5 } },
    { query: "c", candidateLabel: "conflict", inputText: "c", rationale: "", meta: { mode: "academic", sourceCount: 3 } },
    { query: "d", candidateLabel: "no_conflict", inputText: "d", rationale: "", meta: { mode: "fast", sourceCount: 4 } },
  ], [{ query: "a" }], 3);

  assert.equal(selected.length, 3);
  assert.deepEqual(selected.map((row) => row.query), ["c", "b", "d"]);
  assert.equal(selected.some((row) => row.query === "a"), false);
});
