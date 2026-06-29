// Sufficiency, conflict detection, confidence, fact-checking, gap detection.
// Layer: platform — imports from base modules and ranking.js.

import {
  buildAuthorityFollowUpQueries,
  buildConflictFollowUpQueries,
} from "../research-policy.js";
import { scoreSourceEntry, prioritizeSourceEntries } from "./ranking.js";
import { queryBase } from "./heuristics.js";

function hasImmutableAuthority(source = {}, query = "") {
  if (typeof source.authoritative === "boolean") return source.authoritative;
  return Boolean(scoreSourceEntry(source, query).authoritative);
}

// --- claim conflicts ---

export function detectClaimConflicts(claims = []) {
  const texts = claims.map((claim) => String(claim?.text || claim || "").toLowerCase());
  const hasPositive = texts.some((text) => /\b(supported|works|available|recommended|yes|stable|compatible)\b/.test(text));
  const hasNegative = texts.some((text) => /\b(not supported|unsupported|does not|no support|broken|incompatible|removed)\b/.test(text));
  return {
    detected: hasPositive && hasNegative,
    conflictSummary: hasPositive && hasNegative ? "Claims conflict." : "",
  };
}

// --- coverage gaps ---

export function detectCoverageGaps(input = {}) {
  const claims = Array.isArray(input.claims) ? input.claims : [];
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const authoritativeFromClaims = claims.some((claim) => Array.isArray(claim?.evidence) && claim.evidence.length > 0);
  const authoritativeFromSources = sources.some((source) => hasImmutableAuthority(source, input.query || ""));
  const authoritativeSourcesFound = authoritativeFromClaims || authoritativeFromSources;
  return {
    detected: !authoritativeSourcesFound,
    missingAspects: authoritativeSourcesFound ? [] : ["authoritative sources"],
  };
}

// --- page-based conflict detection ---

function summarizeConflictSentence(page = {}, pattern) {
  const text = String(page.text || "").replace(/\s+/g, " ");
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const match = sentences.find((sentence) => pattern.test(sentence)) || sentences[0] || page.title || page.url || "";
  return match.slice(0, 120).trim();
}

function summarizeConflictPair(positiveEntry, negativeEntry, positivePattern, negativePattern) {
  const leftHost = positiveEntry.domain || positiveEntry.page.title || "source A";
  const rightHost = negativeEntry.domain || negativeEntry.page.title || "source B";
  const leftClaim = summarizeConflictSentence(positiveEntry.page, positivePattern);
  const rightClaim = summarizeConflictSentence(negativeEntry.page, negativePattern);
  return `${leftHost} says "${leftClaim}", ${rightHost} says "${rightClaim}" → disagreement on support status.`;
}

export function detectConflictSignals(pages) {
  if (!Array.isArray(pages) || pages.length < 2) {
    return { detected: false, reason: null, conflictSummary: "", conflictingSourcePairs: [] };
  }

  const positivePattern = /\b(works?|supported|recommended|available|yes|stable|compatible)\b/i;
  const negativePattern = /\b(does not|not supported|unsupported|deprecated|no support|broken|incompatible|removed)\b/i;
  const entries = pages.map((page, index) => {
    try {
      return { page, index, domain: new URL(page.url).hostname.replace(/^www\./, "") };
    } catch {
      return { page, index, domain: "" };
    }
  });
  const positivePages = entries.filter(({ page }) => positivePattern.test(page.text || ""));
  const negativePages = entries.filter(({ page }) => negativePattern.test(page.text || ""));
  const pair = positivePages.find((pos) => negativePages.some((neg) => neg.domain !== pos.domain || neg.index !== pos.index));
  const opposite = pair && negativePages.find((neg) => neg.domain !== pair.domain || neg.index !== pair.index);

  if (pair && opposite) {
    return {
      detected: true,
      reason: "Some retrieved pages contain opposing support or recommendation claims.",
      conflictSummary: summarizeConflictPair(pair, opposite, positivePattern, negativePattern),
      conflictingSourcePairs: [[pair.index, opposite.index]],
    };
  }

  return { detected: false, reason: null, conflictSummary: "", conflictingSourcePairs: [] };
}

// --- follow-up query building ---

export function detectResearchGaps(query, pages, options = {}) {
  const hasAuthoritativeSource = pages.some((page) => hasImmutableAuthority(page, query || ""));
  if (!hasAuthoritativeSource) {
    return {
      detected: true,
      reason: "Retrieved pages lack an authoritative docs or README source.",
      followupQuery: buildAuthorityFollowUpQueries(query, "", options)[0] || `${queryBase(query)} official docs`,
      missingAspects: ["authoritative sources"],
    };
  }

  return { detected: false, reason: null, followupQuery: null, missingAspects: [] };
}

export function buildFollowUpQuery(query, pages, options = {}) {
  const conflict = detectConflictSignals(pages);
  if (conflict.detected) return buildConflictFollowUpQueries(query, "", options)[0] || `${queryBase(query)} official docs support status`;
  const gaps = detectResearchGaps(query, pages, options);
  if (gaps.detected) return gaps.followupQuery;
  return buildAuthorityFollowUpQueries(`${queryBase(query)} clarification`, "", options)[0] || `${queryBase(query)} clarification official docs`;
}

export function buildActionBasedFollowUpQuery(query, action, options = {}) {
  if (action === "need_conflict_resolution") return buildConflictFollowUpQueries(query, "", options)[0] || `${queryBase(query)} official docs support status`;
  if (action === "need_authority") return buildAuthorityFollowUpQueries(query, "", options)[0] || `${queryBase(query)} official docs`;
  if (action === "need_recency") return `${queryBase(query)} latest`;
  if (action === "need_version_context") return buildConflictFollowUpQueries(query, "", options)[0] || `${queryBase(query)} release notes changelog`;
  if (action === "need_primary_source") return `${queryBase(query)} source announcement`;
  if (action === "ask_clarifying_question") return `${queryBase(query)} clarification official context`;
  return buildAuthorityFollowUpQueries(`${queryBase(query)} clarification`, "", options)[0] || `${queryBase(query)} clarification official docs`;
}

// --- fact-checking ---

function queryTermsForFactCheck(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 3 && !["that", "this", "with", "from", "have", "has", "are", "was", "were", "the", "and", "for", "not", "you", "your", "about", "into"].includes(term));
}

const BOILERPLATE_FACT_CHECK_PATTERNS = [
  /^i found \d+ sources?/i,
  /\bstrongest sources?\b/i,
  /\bsummar(?:y|ized|ised) below\b/i,
  /\bbased on \d+ readable sources?\b/i,
  /\bi could not find enough reliable sources?\b/i,
];

function isBoilerplateClaim(sentence) {
  return BOILERPLATE_FACT_CHECK_PATTERNS.some((pattern) => pattern.test(sentence));
}

export function factCheckAnswer(answer, sources = []) {
  const sentences = String(answer || "")
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const unverifiedClaims = [];
  const verifiedClaims = [];

  for (const sentence of sentences) {
    if (isBoilerplateClaim(sentence)) continue;
    const terms = queryTermsForFactCheck(sentence);
    if (terms.length === 0) continue;
    const verified = sources.some((source) => {
      const haystack = `${source.title || ""} ${source.snippet || source.text || ""}`.toLowerCase();
      return terms.filter((term) => haystack.includes(term)).length >= Math.max(1, Math.ceil(terms.length / 2));
    });
    if (verified) verifiedClaims.push(sentence);
    else unverifiedClaims.push(sentence);
  }

  return { verifiedClaims, unverifiedClaims };
}

// --- confidence summary ---

export function buildConfidenceSummary(pages, meta = {}) {
  if (!pages.length) return "Based on 0 readable sources.";
  const domains = new Set();
  for (const page of pages) {
    try {
      domains.add(new URL(page.url).hostname.replace(/^www\./, ""));
    } catch {
      // ignore
    }
  }

  const lines = [
    `Based on ${pages.length} readable sources from ${domains.size || 1} independent domains.`,
    pages.some((page) => hasImmutableAuthority(page, ""))
      ? "Authoritative docs, papers, or README sources were found."
      : "No authoritative docs, papers, or README source was found.",
  ];

  if (meta.followupRounds > 0) lines.push(`One follow-up round was used to resolve uncertainty.`);
  lines.push(meta.conflictDetected ? "Conflict scan found opposing claims in the retrieved pages." : "No clear source conflicts detected in the retrieved pages.");
  return lines.join("\n");
}

// --- sufficiency evaluation ---

export function evaluateSufficiency(input, legacyPages, legacyConflictDetected = false) {
  const payload = typeof input === "string"
    ? { query: input, sources: legacyPages || [], conflictDetected: legacyConflictDetected }
    : { query: input?.query || "", sources: input?.sources || [], claims: input?.claims || [], conflictDetected: Boolean(input?.conflictDetected), confidence: input?.confidence, minSources: input?.minSources };

  const authoritativeCount = payload.sources.filter((source) => hasImmutableAuthority(source, payload.query || "")).length;
  const authoritativeSourcesFound = authoritativeCount > 0;
  const conflict = detectConflictSignals(payload.sources);
  const claimConflict = detectClaimConflicts(payload.claims);
  const coverage = detectCoverageGaps(payload);
  const conflictDetected = payload.conflictDetected || conflict.detected || claimConflict.detected;
  const missingAspects = [];
  if (!authoritativeSourcesFound || coverage.detected) missingAspects.push("authoritative sources");
  if (conflictDetected) missingAspects.push("conflict resolution");
  if (!payload.sources.length) missingAspects.push("readable sources");

  const openSubQuestions = [
    ...(!authoritativeSourcesFound ? buildAuthorityFollowUpQueries(payload.query) : []),
    ...(conflictDetected ? buildConflictFollowUpQueries(payload.query) : []),
  ];
  if (!openSubQuestions.length) openSubQuestions.push(`${queryBase(payload.query)} follow-up`);

  const minSources = payload.minSources || 1;
  const sourceCount = payload.sources.length;
  const domainCount = new Set(payload.sources.map((page) => {
    try {
      return new URL(page.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }).filter(Boolean)).size;
  const confidenceScore = typeof payload.confidence === "number"
    ? payload.confidence
    : Math.max(0.1, Math.min(0.95, 0.35 + Math.min(sourceCount, 4) * 0.08 + Math.min(authoritativeCount, 3) * 0.12 + Math.min(domainCount, 3) * 0.04 - (conflictDetected ? 0.18 : 0)));

  const sufficient = sourceCount >= minSources && confidenceScore >= 0.85 && (!conflictDetected || authoritativeSourcesFound);

  return {
    sufficient,
    confidence: confidenceScore,
    confidenceScore,
    missingAspects: [...new Set(missingAspects)],
    openSubQuestions: [...new Set(openSubQuestions)],
    authoritativeSourcesFound,
    conflictSummary: conflictDetected ? (conflict.conflictSummary || `Sources disagree on ${queryBase(payload.query)}.`) : "",
    conflictingSourcePairs: conflict.conflictingSourcePairs || [],
  };
}

export function isAuthoritativeResearchSource(source = {}) {
  return hasImmutableAuthority(source);
}
