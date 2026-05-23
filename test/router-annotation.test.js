import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnnotationItems,
  deriveAnnotationId,
  exportReviewedJsonl,
  parseJsonl,
  suggestAnnotation,
  summarizeAnnotationProgress,
  upsertAnnotationReview,
} from "../lib/router-annotation.js";

test("parseJsonl reads JSONL rows and ignores blanks", () => {
  const rows = parseJsonl('{"query":"a"}\n\n{"query":"b"}\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1].query, "b");
});

test("suggestAnnotation prefers authority and recency conservatively", () => {
  const suff = suggestAnnotation("sufficiency", {
    query: "Current node LTS version",
    candidateLabel: "insufficient",
    inputText: "[blog] Node blog post",
    meta: { authoritativeSourcesFound: false, sourceCount: 1 },
  });
  assert.equal(suff.label, "need_authority");

  const conflict = suggestAnnotation("conflict", {
    query: "React current support status",
    candidateLabel: "conflict",
    inputText: "[official_doc] Docs\n\n[blog] old post",
    meta: { sourceCount: 2 },
  });
  assert.equal(conflict.label, "resolved_by_recency");
});

test("buildAnnotationItems merges reviewed rows into draft rows", () => {
  const draftRows = [
    { query: "A", candidateLabel: "conflict", rationale: "", inputText: "text a", meta: { mode: "fast" } },
    { query: "B", candidateLabel: "no_conflict", rationale: "", inputText: "text b", meta: { mode: "deep" } },
  ];
  const reviewedRows = [
    { query: "B", label: "resolved_by_authority", rationale: "official docs win", inputText: "text b", meta: { mode: "deep" } },
  ];

  const items = buildAnnotationItems("conflict", draftRows, reviewedRows);
  assert.equal(items.length, 2);
  assert.equal(items[1].finalLabel, "resolved_by_authority");
  assert.equal(items[1].rationale, "official docs win");
  assert.equal(items[1].status, "reviewed");
  assert.equal(items[0].status, "pending");
  assert.equal(typeof items[0].suggestedLabel, "string");
});

test("upsertAnnotationReview updates the selected item only", () => {
  const items = buildAnnotationItems("sufficiency", [
    { query: "A", candidateLabel: "insufficient", rationale: "", inputText: "text a", meta: {} },
    { query: "B", candidateLabel: "sufficient", rationale: "", inputText: "text b", meta: {} },
  ]);

  const updated = upsertAnnotationReview(items, items[0].id, {
    finalLabel: "need_authority",
    rationale: "official source missing",
  });

  assert.equal(updated[0].finalLabel, "need_authority");
  assert.equal(updated[0].rationale, "official source missing");
  assert.equal(updated[0].status, "reviewed");
  assert.equal(updated[1].status, "pending");
});

test("exportReviewedJsonl writes only reviewed rows", () => {
  const items = [
    {
      id: deriveAnnotationId("conflict", { query: "A", inputText: "a" }),
      task: "conflict",
      query: "A",
      candidateLabel: "conflict",
      finalLabel: "needs_review",
      rationale: "unclear snippets",
      inputText: "a",
      meta: { mode: "fast" },
      status: "reviewed",
    },
    {
      id: deriveAnnotationId("conflict", { query: "B", inputText: "b" }),
      task: "conflict",
      query: "B",
      candidateLabel: "no_conflict",
      finalLabel: "",
      rationale: "",
      inputText: "b",
      meta: { mode: "deep" },
      status: "pending",
    },
  ];

  const jsonl = exportReviewedJsonl(items);
  const lines = jsonl.trim().split("\n");
  assert.equal(lines.length, 1);
  const row = JSON.parse(lines[0]);
  assert.equal(row.label, "needs_review");
  assert.equal(row.candidateLabel, "conflict");
});

test("summarizeAnnotationProgress reports reviewed counts and labels", () => {
  const items = [
    { status: "reviewed", finalLabel: "need_authority" },
    { status: "reviewed", finalLabel: "need_authority" },
    { status: "reviewed", finalLabel: "sufficient" },
    { status: "pending", finalLabel: "" },
  ];

  const summary = summarizeAnnotationProgress(items);
  assert.equal(summary.total, 4);
  assert.equal(summary.reviewed, 3);
  assert.equal(summary.pending, 1);
  assert.deepEqual(summary.byLabel, { need_authority: 2, sufficient: 1 });
});
