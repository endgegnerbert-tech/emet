import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceState, createClaim, createEvidence, createEvidenceSource, explainConfidence, sourcePolicyFlagsFromConfig } from "../lib/research-evidence.js";

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

test("sourcePolicyFlagsFromConfig preserves overlay policy flags", () => {
  const flags = sourcePolicyFlagsFromConfig({
    overlays: ["shopify", "official-only"],
    sourcePolicy: { overlays: ["recency-required"] },
    requireAuthoritative: true,
  });

  assert.deepEqual(flags, ["official-only", "recency-required"]);
});

test("createEvidenceSource serializes per-source scores and policy context", () => {
  const source = createEvidenceSource({
    title: "Docs",
    url: "https://shopify.dev/docs/api",
    text: "Shopify API docs explain supported webhook versions.",
    sourceType: "official_doc",
  }, {
    query: "Shopify webhook API version",
    domainFamily: "developer-docs",
    overlays: ["shopify", "official-only"],
    sourcePolicyFlags: ["official-only"],
  });

  assert.equal(source.domain_family, "developer-docs");
  assert.deepEqual(source.overlays, ["shopify", "official-only"]);
  assert.equal(source.source_type, "official_doc");
  assert.equal(typeof source.authority_score, "number");
  assert.equal(typeof source.quality_score, "number");
  assert.equal(typeof source.text_hash, "string");
});

test("buildEvidenceState creates serializable graph nodes and policy edges", () => {
  const state = buildEvidenceState({
    query: "Shopify webhook API version",
    config: {
      domainFamily: "developer-docs",
      overlays: ["shopify", "official-only"],
      sourcePolicy: { family: "developer-docs", overlays: ["shopify", "official-only"] },
      requireAuthoritative: true,
    },
    turn: 1,
    sources: [{
      title: "Docs",
      url: "https://shopify.dev/docs/api",
      text: "Shopify API docs explain supported webhook versions.",
      sourceType: "official_doc",
      claims: [{ text: "Webhook versions are supported.", confidence: "medium" }],
    }],
    sufficiency: { sufficient: false, missingAspects: ["version context"] },
    stopReason: "needs_followup",
  });

  assert.equal(state.schemaVersion, 1);
  assert.equal(state.domain_family, "developer-docs");
  assert.deepEqual(state.source_policy_flags, ["official-only"]);
  assert.ok(state.nodes.some((node) => node.type === "query"));
  assert.ok(state.edges.some((edge) => edge.type === "source_matches_overlay" && edge.overlay === "shopify"));
  assert.ok(state.edges.some((edge) => edge.type === "claim_requires_more_evidence"));
  assert.doesNotThrow(() => JSON.stringify(state));
});
