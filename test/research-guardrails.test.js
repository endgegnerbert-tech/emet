import test from "node:test";
import assert from "node:assert/strict";

import {
  applyGuardrailsToResearchConfig,
  buildResearchGuardrails,
  guardrailVetoesDomainDowngrade,
} from "../lib/research-guardrails.js";

test("research guardrails detect non-negotiable high-risk flags", () => {
  const guardrails = buildResearchGuardrails("Current CVE-2024-3094 xz advisory mitigation from official vendor docs");

  assert.equal(guardrails.guardrail_flags.security_sensitive, true);
  assert.equal(guardrails.guardrail_flags.recency_required, true);
  assert.equal(guardrails.guardrail_flags.version_sensitive, true);
  assert.equal(guardrails.guardrail_flags.official_source_required, true);
  assert.equal(guardrails.minimumEvidence.requireAuthoritative, true);
  assert.equal(guardrails.minimumEvidence.requireRecent, true);
  assert.ok(guardrails.decisions.includes("security_guardrail"));
});


test("research guardrails detect medical legal finance and privacy-sensitive inputs", () => {
  const guardrails = buildResearchGuardrails("Can I paste patient SSN and bank account data for legal compliance advice?");

  assert.equal(guardrails.guardrail_flags.medical_sensitive, true);
  assert.equal(guardrails.guardrail_flags.legal_sensitive, true);
  assert.equal(guardrails.guardrail_flags.finance_sensitive, true);
  assert.equal(guardrails.guardrail_flags.privacy_sensitive, true);
  assert.equal(guardrails.guardrail_flags.official_source_required, true);
});


test("guardrails apply minimum evidence requirements to runtime config", () => {
  const guardrails = buildResearchGuardrails("latest react 19 migration guide official docs");
  const config = applyGuardrailsToResearchConfig({
    mode: "fast",
    minSources: 1,
    minAuthoritativeSources: 0,
    requireAuthoritative: false,
    preferRecent: false,
    maxTurns: 1,
  }, guardrails);

  assert.equal(config.requireAuthoritative, true);
  assert.equal(config.preferRecent, true);
  assert.equal(config.minSources >= 2, true);
  assert.equal(config.minAuthoritativeSources, 1);
  assert.equal(config.guardrails.guardrail_flags.version_sensitive, true);
});


test("domain guardrails veto high-risk and authority downgrades to generic web", () => {
  const changelog = buildResearchGuardrails("React 19 release notes changelog");
  assert.equal(guardrailVetoesDomainDowngrade("changelog", "web", changelog), true);

  const docsRequired = buildResearchGuardrails("official Kubernetes API reference docs");
  assert.equal(guardrailVetoesDomainDowngrade("github", "web", docsRequired), true);
});
