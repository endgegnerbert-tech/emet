import test from "node:test";
import assert from "node:assert/strict";

import { buildStructuredRows } from "../scripts/router/export_structured_provisional.mjs";

test("buildStructuredRows attaches feature objects for conflict and sufficiency tasks", () => {
  const conflictRows = buildStructuredRows("conflict", [{
    query: "Python 3.12 support status",
    label: "resolved_by_authority",
    inputText: `Query: x\n\nSources:\n[official_doc] Python docs\n\n[blog] Old post`,
    meta: { mode: "deep" },
  }]);

  assert.equal(conflictRows.length, 1);
  assert.equal(conflictRows[0].label, "resolved_by_authority");
  assert.equal(conflictRows[0].features.official_doc_count, 1);

  const suffRows = buildStructuredRows("sufficiency", [{
    query: "Current node LTS version",
    label: "need_authority",
    inputText: `Query: x\n\nSources:\n[blog] Rumour`,
    meta: { mode: "fast" },
  }]);

  assert.equal(suffRows[0].features.query_temporal, 1);
  assert.equal(suffRows[0].task, "sufficiency");
});
