import test from "node:test";
import assert from "node:assert/strict";

import { mergeReviewedRows, normalizeReviewedRow } from "../scripts/router/build-provisional-gold.mjs";

test("normalizeReviewedRow upgrades legacy sufficiency labels", () => {
  const row = normalizeReviewedRow("sufficiency", {
    query: "Current node LTS version",
    label: "insufficient",
    rationale: "Needs authoritative source (nodejs.org) to be truly sufficient",
  });
  assert.equal(row.label, "need_authority");
});

test("mergeReviewedRows prefers human gold over ai-reviewed rows for the same query", () => {
  const merged = mergeReviewedRows("conflict",
    [{ query: "A", label: "needs_review", rationale: "human" }],
    [{ query: "A", label: "resolved_by_authority", rationale: "ai" }, { query: "B", label: "no_conflict", rationale: "ai" }],
  );

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((row) => row.query), ["A", "B"]);
  assert.equal(merged[0].label, "needs_review");
  assert.equal(merged[1].label, "no_conflict");
});
