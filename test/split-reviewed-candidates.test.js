import test from "node:test";
import assert from "node:assert/strict";

import { splitReviewedRows } from "../scripts/router/split-reviewed-candidates.mjs";

test("splitReviewedRows accepts only high-confidence rows not marked for human review", () => {
  const { accepted, human } = splitReviewedRows([
    { label: "web", confidence: 0.9, needs_human_review: false },
    { label: "web", confidence: 0.9, needs_human_review: true },
    { label: "web", confidence: 0.7, needs_human_review: false },
  ], 0.85);

  assert.equal(accepted.length, 1);
  assert.equal(human.length, 2);
});
