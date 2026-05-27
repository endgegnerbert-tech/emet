import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReviewPrompt,
  defaultPathsForTask,
  parseReviewResponse,
  REVIEW_LABELS,
} from "../scripts/router/llm-review-candidates.mjs";

test("buildReviewPrompt isolates one row and lists allowed task labels", () => {
  const prompt = buildReviewPrompt("sufficiency", {
    query: "React 19 migration",
    candidateLabel: "insufficient",
    inputText: "Query: React 19 migration\n\nSources:\n[official_doc] React 19 upgrade guide",
    meta: { mode: "deep" },
  });

  assert.match(prompt.system, /exactly one candidate/i);
  assert.match(prompt.system, /need_version_context/);
  assert.match(prompt.user, /React 19 migration/);
  const payload = JSON.parse(prompt.user);
  assert.deepEqual(payload.allowedLabels, REVIEW_LABELS.sufficiency);
  assert.equal(payload.candidateLabel, "insufficient");
});

test("parseReviewResponse accepts fenced JSON and normalizes low confidence to human review", () => {
  const review = parseReviewResponse("domain", '```json\n{"label":"github","confidence":0.7,"rationale":"GitHub API docs","needs_human_review":false}\n```');
  assert.equal(review.label, "github");
  assert.equal(review.confidence, 0.7);
  assert.equal(review.needs_human_review, true);
});

test("parseReviewResponse rejects labels outside task schema", () => {
  assert.throws(
    () => parseReviewResponse("conflict", '{"label":"conflict","confidence":0.9,"rationale":"bad","needs_human_review":false}'),
    /Invalid label/,
  );
});

test("defaultPathsForTask routes followup separately", () => {
  assert.equal(defaultPathsForTask("followup").input, "data/followup/log-candidates/followup-draft.jsonl");
  assert.equal(defaultPathsForTask("conflict").output, "data/router/log-candidates/conflict-llm-reviewed.jsonl");
});
