import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalReviewFromRow,
  isTrainableReview,
  summarizeReviewProvenance,
  toCanonicalTrainingRow,
  validateCanonicalTrainingRow,
} from "../lib/router-training-schema.js";

test("toCanonicalTrainingRow maps reviewed legacy rows to the canonical Phase 2 schema", () => {
  const row = toCanonicalTrainingRow({
    query: "CVE-2024-3094 xz utils",
    label: "security",
    confidence: 0.97,
    reviewSource: "pi_review",
    needs_human_review: false,
    inputText: "CVE-2024-3094 xz utils",
    meta: { mode: "deep", sourceCount: 2, authoritativeSourcesFound: true, logPath: "/tmp/emet.jsonl" },
  }, { task: "domain", split: "train" });

  assert.equal(row.schema_version, 1);
  assert.equal(row.task, "domain");
  assert.equal(row.mode, "deep");
  assert.equal(row.labels.domain, "security");
  assert.equal(row.source_state.source_count, 2);
  assert.equal(row.source_state.authority_count, 1);
  assert.equal(row.review.source, "pi_review");
  assert.equal(row.review.confidence, 0.97);
  assert.equal(validateCanonicalTrainingRow(row).ok, true);
});

test("validateCanonicalTrainingRow rejects prelabels and missing confidence for train rows", () => {
  const prelabel = toCanonicalTrainingRow({ query: "latest package status", label: "web", reviewSource: "ai_prelabel" }, { task: "domain" });
  const prelabelValidation = validateCanonicalTrainingRow(prelabel);
  assert.equal(prelabelValidation.ok, false);
  assert.ok(prelabelValidation.errors.includes("prelabel_not_trainable"));
  assert.ok(prelabelValidation.errors.includes("missing_review_confidence"));

  const reviewedWithoutConfidence = toCanonicalTrainingRow({ query: "latest package status", label: "web", reviewSource: "pi_review" }, { task: "domain" });
  const confidenceValidation = validateCanonicalTrainingRow(reviewedWithoutConfidence);
  assert.equal(confidenceValidation.ok, false);
  assert.ok(confidenceValidation.errors.includes("missing_review_confidence"));
});

test("canonicalReviewFromRow treats human gold holdouts as human review", () => {
  const review = canonicalReviewFromRow({ reviewSource: "human_gold", confidence: 1 });
  assert.equal(review.source, "human");
  assert.equal(isTrainableReview({ reviewSource: "human_gold", confidence: 1 }), true);
});

test("summarizeReviewProvenance centralizes review counts for audits", () => {
  const summary = summarizeReviewProvenance([
    { reviewSource: "pi_review", confidence: 0.9, needs_human_review: false },
    { reviewSource: "ai_prelabel" },
    { reviewSource: "pi_review", confidence: 0.8, needs_human_review: true },
    {},
  ]);

  assert.equal(summary.reviewedRows, 2);
  assert.equal(summary.trainableRows, 1);
  assert.equal(summary.prelabelRows, 1);
  assert.equal(summary.missingReviewRows, 1);
  assert.equal(summary.missingConfidenceRows, 2);
  assert.equal(summary.needsHumanRows, 1);
  assert.deepEqual(summary.reviewSources, { pi_review: 2, ai_prelabel: 1, "<missing>": 1 });
});
