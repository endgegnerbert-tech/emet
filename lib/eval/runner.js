import { classifyQuestionDomain } from "../research-intent.js";
import { buildFollowUpQuery, evaluateSufficiency, scoreSourceEntry } from "../research.js";
import { pageQualitySignals } from "../research-policy.js";
import { loadEvalCases } from "./case-loader.js";

function normalizeHost(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function runChecks(checks = []) {
  const passed = checks.filter((check) => check.ok).length;
  return {
    passed,
    total: checks.length,
    checks,
    ok: passed === checks.length,
  };
}

function evaluateFollowupProbe(probe = {}) {
  if (!probe || !probe.query) return [];
  const followup = buildFollowUpQuery(probe.query, probe.pages || []);
  const checks = [];

  if (probe.expectNoQuestionMark !== false) {
    checks.push({
      name: "followup-no-question-mark",
      ok: !followup.includes("?"),
      actual: followup,
    });
  }
  if (Array.isArray(probe.expectNotIncludes)) {
    for (const token of probe.expectNotIncludes) {
      checks.push({
        name: `followup-not-includes:${token}`,
        ok: !followup.toLowerCase().includes(String(token).toLowerCase()),
        actual: followup,
      });
    }
  }
  if (Array.isArray(probe.expectAnyIncludes) && probe.expectAnyIncludes.length) {
    checks.push({
      name: "followup-includes-one-expected-token",
      ok: probe.expectAnyIncludes.some((token) => followup.toLowerCase().includes(String(token).toLowerCase())),
      actual: followup,
    });
  }

  return checks;
}

function evaluatePageProbe(probe = {}) {
  if (!probe || !probe.page) return [];
  const quality = pageQualitySignals(probe.page);
  const checks = [];

  if (typeof probe.expectBlocked === "boolean") {
    checks.push({ name: "page-blocked", ok: quality.blocked === probe.expectBlocked, actual: quality.blocked });
  }
  if (typeof probe.expectWeak === "boolean") {
    checks.push({ name: "page-weak", ok: quality.weak === probe.expectWeak, actual: quality.weak });
  }
  if (Array.isArray(probe.expectSignals)) {
    for (const signal of probe.expectSignals) {
      checks.push({
        name: `page-signal:${signal}`,
        ok: quality.negativeSignals.includes(signal),
        actual: quality.negativeSignals,
      });
    }
  }

  return checks;
}

function evaluateSourceProbe(probe = {}) {
  if (!probe || !Array.isArray(probe.sources)) return [];
  const scored = probe.sources.map((source) => ({ source, scored: scoreSourceEntry(source, probe.query || "") }));
  const checks = [];

  if (Array.isArray(probe.expectAuthoritativeHosts)) {
    for (const host of probe.expectAuthoritativeHosts) {
      const match = scored.find(({ source }) => normalizeHost(source.url) === host);
      checks.push({
        name: `authoritative-host:${host}`,
        ok: Boolean(match?.scored.authoritative),
        actual: match?.scored,
      });
    }
  }
  if (Array.isArray(probe.expectNonAuthoritativeHosts)) {
    for (const host of probe.expectNonAuthoritativeHosts) {
      const match = scored.find(({ source }) => normalizeHost(source.url) === host);
      checks.push({
        name: `non-authoritative-host:${host}`,
        ok: match ? !match.scored.authoritative : false,
        actual: match?.scored,
      });
    }
  }
  if (Array.isArray(probe.expectSourceTypes)) {
    for (const expected of probe.expectSourceTypes) {
      const match = scored.find(({ source }) => normalizeHost(source.url) === expected.host);
      checks.push({
        name: `source-type:${expected.host}`,
        ok: match?.scored.sourceType === expected.sourceType,
        actual: match?.scored,
      });
    }
  }

  return checks;
}

function evaluateSufficiencyProbe(probe = {}) {
  if (!probe || !probe.query) return [];
  const result = evaluateSufficiency({
    query: probe.query,
    sources: probe.sources || [],
    conflictDetected: Boolean(probe.conflictDetected),
    minSources: probe.minSources,
  });
  const checks = [];

  if (typeof probe.expectSufficient === "boolean") {
    checks.push({ name: "sufficient", ok: result.sufficient === probe.expectSufficient, actual: result.sufficient });
  }
  if (typeof probe.expectAuthoritativeSourcesFound === "boolean") {
    checks.push({
      name: "authoritative-sources-found",
      ok: result.authoritativeSourcesFound === probe.expectAuthoritativeSourcesFound,
      actual: result.authoritativeSourcesFound,
    });
  }
  if (probe.expectOpenSubQuestionsNoQuestionMark) {
    checks.push({
      name: "open-subquestions-no-question-mark",
      ok: result.openSubQuestions.every((item) => !String(item).includes("?")),
      actual: result.openSubQuestions,
    });
  }

  return checks;
}

function evaluateCase(domain, item) {
  const checks = [];
  checks.push({
    name: "domain-match",
    ok: classifyQuestionDomain(item.question) === (item.expectedDomain || domain),
    actual: classifyQuestionDomain(item.question),
  });

  checks.push(...evaluateFollowupProbe(item.followupProbe));
  checks.push(...evaluatePageProbe(item.pageProbe));
  checks.push(...evaluateSourceProbe(item.sourceProbe));
  checks.push(...evaluateSufficiencyProbe(item.sufficiencyProbe));

  return {
    question: item.question,
    notes: item.notes || "",
    ...runChecks(checks),
  };
}

export async function runEvalSuite({ domain }) {
  const cases = loadEvalCases(domain);
  const details = cases.map((item) => evaluateCase(domain, item));
  const metadataChecks = cases.flatMap((item) => [
    {
      question: item.question,
      name: "expected-quality-declared",
      ok: !item.expectedQuality || ["high", "mixed", "low"].includes(item.expectedQuality),
      actual: item.expectedQuality,
    },
    {
      question: item.question,
      name: "expected-claims-declared",
      ok: item.expectedClaims === undefined || Array.isArray(item.expectedClaims),
      actual: item.expectedClaims,
    },
  ]);
  const passedCases = details.filter((item) => item.ok).length;
  const passedChecks = details.reduce((sum, item) => sum + item.passed, 0);
  const totalChecks = details.reduce((sum, item) => sum + item.total, 0);
  const passedMetadataChecks = metadataChecks.filter((item) => item.ok).length;

  return {
    total: cases.length,
    passed: passedCases,
    passRate: cases.length ? passedCases / cases.length : 0,
    checkPassRate: (totalChecks + metadataChecks.length) ? (passedChecks + passedMetadataChecks) / (totalChecks + metadataChecks.length) : 0,
    passedChecks: passedChecks + passedMetadataChecks,
    totalChecks: totalChecks + metadataChecks.length,
    metadataChecks,
    details,
  };
}
