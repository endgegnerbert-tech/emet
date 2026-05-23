import test from "node:test";
import assert from "node:assert/strict";
import { createClaim, createEvidence, explainConfidence } from "../lib/research-evidence.js";

test("createClaim keeps evidence and confidence", () => {
  const claim = createClaim({
    text: "This package supports ESM.",
    confidence: "high",
    evidence: [createEvidence({ type: "web", source: "https://example.com", snippet: "supports ESM" })],
  });

  assert.equal(claim.text, "This package supports ESM.");
  assert.equal(claim.confidence, "high");
  assert.equal(claim.evidence[0].type, "web");
});

test("explainConfidence maps high confidence to a readable reason", () => {
  assert.match(explainConfidence("high", 3), /multiple/i);
});
