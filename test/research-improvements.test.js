import test from "node:test";
import assert from "node:assert/strict";

import { assessPageAttempt } from "../lib/page-fetch-adapter.js";
import { isUsableContent, pageQualitySignals } from "../lib/research-policy.js";
import { evaluateSufficiency, scoreSourceEntry } from "../lib/research.js";

test("blocked placeholders are detected early", () => {
  const page = assessPageAttempt({
    status: 200,
    contentType: "text/html",
    url: "https://www.researchgate.net/publication/123",
    body: "<html><title>ResearchGate - Temporarily Unavailable</title><body>Access denied. Please enable cookies.</body></html>",
  });

  assert.equal(page.blocked, true);
  assert.ok(page.negativeSignals.includes("placeholder"));
});

test("page quality does not demote a page on text length alone", () => {
  const quality = pageQualitySignals({
    title: "Quantum Error Correction - IBM Research",
    text: "Quantum error correction research updates roadmap experiments " + "A".repeat(500),
    url: "https://research.ibm.com/topics/quantum-error-correction",
    query: "quantum error correction roadmap",
  });

  assert.equal(quality.blocked, false);
  assert.equal(quality.weak, false);
});


test("isUsableContent accepts readable non-placeholder pages", () => {
  assert.equal(isUsableContent({
    title: "Docs",
    url: "https://example.com/docs",
    text: "Useful content ".repeat(40),
    contentType: "text/html",
    fetchStatus: 200,
  }, { minPageText: 300, query: "useful content" }), true);
});

test("isUsableContent rejects placeholder and weak pages", () => {
  assert.equal(isUsableContent({
    title: "Attention Required! | Cloudflare",
    url: "https://blocked.example.com",
    text: "Access denied. Verify you are human.",
    contentType: "text/html",
    fetchStatus: 200,
  }, { minPageText: 300, query: "blocked page" }), false);
});

test("vendor research hosts classify above generic other", () => {
  const scored = scoreSourceEntry({
    url: "https://research.ibm.com/topics/quantum-error-correction",
    title: "Quantum Error Correction - IBM Research",
    text: "Quantum error correction research updates and roadmap for fault tolerance.",
  }, "2025 practical quantum error correction compare surface code qLDPC bosonic codes roadmap 2030 authoritative review");

  assert.equal(scored.sourceType, "official_doc");
  assert.equal(scored.authoritative, true);
  assert.ok(scored.score >= 18);
});

test("readable researchgate mirrors remain non-authoritative secondary evidence", () => {
  const scored = scoreSourceEntry({
    url: "https://www.researchgate.net/publication/396541744_Quantum_Low-Density_Parity-Check_Codes",
    title: "(PDF) Quantum Low-Density Parity-Check Codes - ResearchGate",
    text: "Quantum low-density parity-check codes paper with decoding thresholds, experiments, and references.",
  }, "quantum low density parity check codes paper");

  assert.equal(scored.authoritative, false);
  assert.notEqual(scored.sourceType, "official_doc");
});

test("sufficiency follow-ups stay search-oriented instead of question-oriented", () => {
  const result = evaluateSufficiency({
    query: "surface code still dominant 2025 quantum error correction review practical roadmap 2030 authoritative",
    sources: [
      {
        title: "Source A",
        url: "https://a.example.com",
        text: "Surface code is supported and recommended for practical roadmap discussions.",
      },
      {
        title: "Source B",
        url: "https://b.example.com",
        text: "Surface code is not supported for the same practical roadmap according to this source.",
      },
    ],
    conflictDetected: true,
    minSources: 2,
  });

  assert.ok(result.openSubQuestions.length > 0);
  for (const query of result.openSubQuestions) {
    assert.ok(!query.includes("?"));
    assert.ok(!/which authoritative source/i.test(query));
  }
});
