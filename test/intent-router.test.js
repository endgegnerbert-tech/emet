import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuestionDomain, normalizeResearchMode } from "../lib/research-intent.js";
import { buildResearchGuardrails } from "../lib/research-guardrails.js";
import { resolveQuestionDomain } from "../lib/research/pipeline.js";

test("classifyQuestionDomain routes GitHub issue questions to github", () => {
  assert.equal(classifyQuestionDomain("bug in issue tracker for this repo"), "github");
});

test("classifyQuestionDomain routes CVE questions to security", () => {
  assert.equal(classifyQuestionDomain("is this package affected by CVE-2025-1234"), "security");
});

test("classifyQuestionDomain keeps release-note questions out of papers", () => {
  assert.equal(classifyQuestionDomain("What changed in the latest release notes for emet?"), "changelog");
});

test("classifyQuestionDomain keeps outage reports out of github", () => {
  assert.equal(classifyQuestionDomain("Any outage or incident reported?"), "vendor-status");
});

test("classifyQuestionDomain routes medical guidance queries to medical", () => {
  assert.equal(classifyQuestionDomain("clinical guideline for asthma treatment"), "medical");
});

test("classifyQuestionDomain routes legal compliance queries to legal", () => {
  assert.equal(classifyQuestionDomain("GDPR data retention compliance requirements"), "legal");
});

test("classifyQuestionDomain distinguishes trading from broader finance", () => {
  assert.equal(classifyQuestionDomain("nasdaq premarket trading hours today"), "trading");
  assert.equal(classifyQuestionDomain("best ETF allocation for retirement portfolio"), "finance");
});

test("classifyQuestionDomain routes provider docs and model routing queries", () => {
  assert.equal(classifyQuestionDomain("AWS IAM role trust policy reference"), "cloud-docs");
  assert.equal(classifyQuestionDomain("OpenAI embeddings model card"), "ai-ml");
  assert.equal(classifyQuestionDomain("Shopify admin API webhook docs"), "shopify");
});

test("classifyQuestionDomain adds standards, news, and local how-to domains", () => {
  assert.equal(classifyQuestionDomain("WCAG 2.2 color contrast requirements"), "standards");
  assert.equal(classifyQuestionDomain("latest OpenAI announcement headlines"), "news-current-events");
  assert.equal(classifyQuestionDomain("parking permit city hall appointment near me"), "local-howto");
});

test("normalizeResearchMode keeps explicit mode and default fallback", () => {
  assert.equal(normalizeResearchMode({ mode: "academic" }, "fast"), "academic");
  assert.equal(normalizeResearchMode({}, "fast"), "fast");
});

test("resolveQuestionDomain lets guardrails veto high-risk downgrade to web", async () => {
  const query = "Current CVE-2026-1234 vendor advisory mitigation";
  const guardrails = buildResearchGuardrails(query);
  const decision = await resolveQuestionDomain(query, { mode: "fast", domain: "web" }, undefined, guardrails);

  assert.equal(decision.heuristicDomain, "security");
  assert.equal(decision.finalDomain, "security");
  assert.equal(decision.decisionSource, "guardrail");
  assert.equal(decision.decisionReason, "guardrail_veto_domain_downgrade");
});
