import test from "node:test";
import assert from "node:assert/strict";

import { prelabelDraftRows } from "../scripts/router/prelabel-gold-drafts.mjs";

test("prelabelDraftRows applies conservative suggestions to all rows", () => {
  const rows = [
    {
      query: "Current node LTS version",
      candidateLabel: "insufficient",
      rationale: "",
      inputText: "Query: Current node LTS version\n\nSources:\n[blog] Blog only",
      meta: { authoritativeSourcesFound: false, sourceCount: 1 },
    },
    {
      query: "Python 3.12 support status",
      candidateLabel: "conflict",
      rationale: "",
      inputText: "Query: Python 3.12 support status\n\nSources:\n[official_doc] Docs\n\n[blog] Old post",
      meta: { sourceCount: 2 },
    },
  ];

  const suff = prelabelDraftRows("sufficiency", [rows[0]]);
  assert.equal(suff.length, 1);
  assert.equal(suff[0].label, "need_authority");
  assert.equal(typeof suff[0].rationale, "string");
  assert.equal(suff[0].reviewSource, "ai_prelabel");

  const conflict = prelabelDraftRows("conflict", [rows[1]]);
  assert.equal(conflict.length, 1);
  assert.equal(conflict[0].label, "resolved_by_recency");
  assert.equal(conflict[0].reviewSource, "ai_prelabel");
});
