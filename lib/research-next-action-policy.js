import { buildActionBasedFollowUpQuery } from "./research.js";
import {
  ROUTING_FAMILIES,
  ROUTING_OVERLAYS,
  ROUTING_RISK_MARKERS,
  SOURCE_POLICY_FLAGS,
  normalizeRoutingToken,
  sourcePolicyFlagsFromOverlays,
  uniqueRoutingTokens,
} from "./router-policy-context.js";
import { extractQueryAspectFlags } from "./router-structured-features.js";

export const RESEARCH_POLICY_ACTIONS = [
  "stop",
  "fetch_more",
  "fetch_authority",
  "fetch_primary_source",
  "fetch_recent",
  "fetch_version_context",
  "resolve_conflict",
  "switch_family",
  "add_overlay",
  "tighten_source_policy",
  "ask_clarifying_question",
];

const ACTION_SET = new Set(RESEARCH_POLICY_ACTIONS);
const RECENT_FRESHNESS = new Set(["today", "this_week", "this_year"]);
const PRIMARY_SOURCE_TYPES = new Set(["official_doc", "paper", "github_repo", "file"]);

function hostFromSource(source = {}) {
  if (source.host) return String(source.host).toLowerCase();
  try {
    return new URL(source.url || "").hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function qualityStats(sources = []) {
  const scores = sources.map((source) => numberOr(source.quality_score ?? source.qualityScore, null)).filter((value) => value !== null);
  const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0;
  return {
    avgQualityScore: average,
    lowQualitySourceCount: sources.filter((source) => numberOr(source.quality_score ?? source.qualityScore, 1) < 0.5 || source.quality?.weak || source.quality?.blocked).length,
    blockedSourceCount: sources.filter((source) => source.quality?.blocked).length,
  };
}

function normalizePolicyFlags(values = []) {
  return uniqueRoutingTokens(values).filter((flag) => SOURCE_POLICY_FLAGS.includes(flag));
}

function contextFromInput(input = {}) {
  const evidenceState = input.evidenceState || {};
  const config = input.config || {};
  const sourcePolicy = config.sourcePolicy && typeof config.sourcePolicy === "object" ? config.sourcePolicy : {};
  const family = normalizeRoutingToken(input.domainFamily || evidenceState.domain_family || config.domainFamily || sourcePolicy.family || config.domain || "web");
  const overlays = uniqueRoutingTokens([
    ...(Array.isArray(evidenceState.overlays) ? evidenceState.overlays : []),
    ...(Array.isArray(config.overlays) ? config.overlays : []),
    ...(Array.isArray(sourcePolicy.overlays) ? sourcePolicy.overlays : []),
  ]);
  const sourcePolicyFlags = normalizePolicyFlags([
    ...(Array.isArray(evidenceState.source_policy_flags) ? evidenceState.source_policy_flags : []),
    ...(Array.isArray(config.sourcePolicyFlags) ? config.sourcePolicyFlags : []),
    ...(Array.isArray(sourcePolicy.flags) ? sourcePolicy.flags : []),
    ...sourcePolicyFlagsFromOverlays(overlays),
  ]);
  return { family, overlays, sourcePolicyFlags };
}

function inferConflictScore(conflict = {}, sufficiency = {}) {
  if (conflict.finalDetected || conflict.detected || conflict.heuristicDetected) return 1;
  if (sufficiency.conflictSummary || sufficiency.missingAspects?.includes("conflict resolution")) return 0.75;
  return 0;
}

function inferTargetFamily(state = {}) {
  const sourceFamily = normalizeRoutingToken(state.queryUnderstanding?.source_family || state.queryUnderstanding?.sourceFamily || "");
  const mapping = {
    official_docs: "developer-docs",
    academic: "academic",
    primary_source: state.highRisk ? "regulated" : "developer-docs",
    government_or_legal: "regulated",
    product_or_ecommerce: "commerce",
    recent_news: "current-events",
    community: "community",
    encyclopedia: "web",
  };
  return mapping[sourceFamily] || null;
}

function inferMissingOverlay(query = "", state = {}) {
  const text = String(query || "").toLowerCase();
  const hasOverlay = (overlay) => state.overlays?.includes(overlay);
  const candidates = [
    ["security", /\b(cve|vulnerability|exploit|patch|advisory|security)\b/],
    ["github", /\b(github|readme|repository|repo)\b/],
    ["package-registry", /\b(npm|pypi|crates|maven|package)\b/],
    ["changelog", /\b(changelog|release notes?|breaking changes?|migration|deprecated|removed)\b/],
    ["papers", /\b(arxiv|doi|paper|study|benchmark|research)\b/],
    ["vendor-status", /\b(status|outage|incident|downtime)\b/],
    ["news-current-events", /\b(latest|today|announced|headline|current news)\b/],
    ["forums", /\b(reddit|stackoverflow|forum|community)\b/],
  ];
  return candidates.find(([overlay, pattern]) => ROUTING_OVERLAYS.includes(overlay) && !hasOverlay(overlay) && pattern.test(text))?.[0] || null;
}

export function buildResearchPolicyState(input = {}) {
  const evidenceState = input.evidenceState || {};
  const sources = Array.isArray(input.sources) ? input.sources : (Array.isArray(evidenceState.sources) ? evidenceState.sources : []);
  const config = input.config || {};
  const { family, overlays, sourcePolicyFlags } = contextFromInput(input);
  const quality = qualityStats(sources);
  const domains = new Set(sources.map(hostFromSource).filter(Boolean));
  const authorityCount = sources.filter((source) => source.authoritative || numberOr(source.authority_score ?? source.authorityScore, 0) >= 0.65).length;
  const primarySourceCount = sources.filter((source) => source.authoritative && PRIMARY_SOURCE_TYPES.has(source.source_type || source.sourceType)).length;
  const recentSourceCount = sources.filter((source) => RECENT_FRESHNESS.has(source.freshness)).length;
  const versionMatchScore = sources.reduce((max, source) => Math.max(max, numberOr(source.version_match_score ?? source.versionMatchScore, 0)), 0);
  const queryUnderstanding = input.queryUnderstandingDecision || input.queryUnderstanding || config.queryUnderstandingDecision || {};
  const queryFlags = extractQueryAspectFlags(input.query || evidenceState.query || "");
  const highRisk = Boolean(input.guardrails?.highRisk)
    || family === "regulated"
    || overlays.some((overlay) => ROUTING_RISK_MARKERS.has(overlay))
    || sourcePolicyFlags.some((flag) => ROUTING_RISK_MARKERS.has(flag));
  const minSources = numberOr(input.minSources ?? config.minSources, config.mode === "deep" || config.mode === "academic" ? 2 : 1);

  return {
    query: input.query || evidenceState.query || "",
    mode: input.mode || config.mode || "fast",
    turnIndex: numberOr(input.turnIndex ?? evidenceState.turn, 1),
    maxTurns: numberOr(input.maxTurns ?? config.maxTurns, 1),
    previousActions: Array.isArray(input.previousActions) ? input.previousActions.filter((action) => ACTION_SET.has(action)) : [],
    family,
    overlays,
    sourcePolicyFlags,
    queryUnderstanding,
    queryFlags,
    sourceCount: sources.length,
    authorityCount,
    primarySourceCount,
    recentSourceCount,
    distinctDomainCount: domains.size,
    ...quality,
    conflictScore: inferConflictScore(input.conflict || evidenceState.conflict || {}, input.sufficiency || evidenceState.sufficiency || {}),
    versionMatchScore,
    recencyRequired: Boolean(input.recencyRequired || config.preferRecent || sourcePolicyFlags.includes("recency-required") || queryFlags.temporal || ["required", "fresh", "current"].includes(normalizeRoutingToken(queryUnderstanding.recency_need))),
    versionContextRequired: Boolean(sourcePolicyFlags.includes("version-sensitive") || queryFlags.versioned),
    highRisk,
    sufficient: Boolean(input.sufficiency?.sufficient ?? evidenceState.sufficiency?.sufficient),
    confidenceScore: numberOr(input.sufficiency?.confidenceScore ?? input.sufficiency?.confidence ?? evidenceState.sufficiency?.confidenceScore, 0),
    missingAspects: Array.isArray(input.sufficiency?.missingAspects) ? input.sufficiency.missingAspects : (Array.isArray(evidenceState.sufficiency?.missingAspects) ? evidenceState.sufficiency.missingAspects : []),
  };
}

function decision(action, reason, controls = {}, confidence = 0.7) {
  return { action, reason, controls, confidence };
}

export function chooseResearchPolicyAction(state = {}) {
  if (state.highRisk && !state.sourcePolicyFlags?.some((flag) => ["official-only", "primary-source-required"].includes(flag)) && !state.previousActions?.includes("tighten_source_policy")) {
    return decision("tighten_source_policy", "high_risk_requires_authoritative_source_policy", { sourcePolicyFlags: ["official-only"] }, 0.8);
  }

  if (state.queryUnderstanding?.ambiguity && /ambiguous|needs_clarification/.test(normalizeRoutingToken(state.queryUnderstanding.ambiguity)) && state.sourceCount === 0) {
    return decision("ask_clarifying_question", "query_understanding_marked_ambiguous_without_evidence", {}, 0.72);
  }

  if (state.conflictScore >= 0.6 || state.missingAspects?.includes("conflict resolution")) {
    return decision("resolve_conflict", "evidence_conflict_requires_resolution", { sourcePolicyFlags: ["official-only"] }, 0.85);
  }

  if (state.versionContextRequired && state.versionMatchScore <= 0 && !state.previousActions?.includes("fetch_version_context")) {
    return decision("fetch_version_context", "version_sensitive_query_lacks_version_evidence", { sourcePolicyFlags: ["version-sensitive"], overlays: ["changelog"] }, 0.82);
  }

  if (state.recencyRequired && state.recentSourceCount === 0 && !state.previousActions?.includes("fetch_recent")) {
    return decision("fetch_recent", "recency_required_without_recent_sources", { sourcePolicyFlags: ["recency-required"], preferRecent: true }, 0.78);
  }

  if ((state.sourcePolicyFlags?.includes("primary-source-required") || state.mode === "academic") && state.primarySourceCount === 0) {
    return decision("fetch_primary_source", "primary_source_required_but_missing", { sourcePolicyFlags: ["primary-source-required"] }, 0.8);
  }

  if ((state.highRisk || state.sourcePolicyFlags?.includes("official-only")) && state.authorityCount === 0) {
    return decision("fetch_authority", "authoritative_source_required_but_missing", { sourcePolicyFlags: ["official-only"] }, 0.82);
  }

  if (state.sufficient && state.confidenceScore >= (state.highRisk ? 0.9 : 0.75)) {
    return decision("stop", "evidence_sufficient_for_policy", {}, state.highRisk ? 0.9 : 0.8);
  }

  if (state.sourceCount < Math.max(1, state.minSources || 1)) {
    return decision("fetch_more", "source_count_below_required_minimum", {}, 0.75);
  }

  if ((state.mode === "deep" || state.mode === "academic") && state.distinctDomainCount < 2 && !state.previousActions?.includes("fetch_more")) {
    return decision("fetch_more", "deep_research_needs_independent_domains", {}, 0.7);
  }

  if (state.lowQualitySourceCount > 0 && state.lowQualitySourceCount >= state.sourceCount) {
    return decision("fetch_more", "only_low_quality_sources_available", {}, 0.72);
  }

  if (state.authorityCount === 0 && !state.previousActions?.includes("fetch_authority")) {
    return decision("fetch_authority", "no_authoritative_sources_found", { sourcePolicyFlags: ["official-only"] }, 0.7);
  }

  const targetFamily = inferTargetFamily(state);
  if (targetFamily && ROUTING_FAMILIES.includes(targetFamily) && targetFamily !== state.family && !state.previousActions?.includes("switch_family")) {
    return decision("switch_family", `query_understanding_prefers_${targetFamily}`, { family: targetFamily }, 0.72);
  }

  const missingOverlay = inferMissingOverlay(state.query, state);
  if (missingOverlay && !state.previousActions?.includes("add_overlay")) {
    return decision("add_overlay", `query_matches_${missingOverlay}_overlay`, { overlays: [missingOverlay] }, 0.68);
  }

  return decision("fetch_more", "insufficient_evidence_after_policy_checks", {}, 0.62);
}

export function decideResearchPolicyAction(input = {}) {
  const state = input.state || buildResearchPolicyState(input);
  const selected = chooseResearchPolicyAction(state);
  return { ...selected, state };
}

export function summarizeResearchPolicyDecision(policyDecision = {}) {
  const state = policyDecision.state || {};
  return {
    action: policyDecision.action,
    reason: policyDecision.reason,
    confidence: policyDecision.confidence,
    controls: policyDecision.controls,
    state: {
      family: state.family,
      overlays: state.overlays,
      sourcePolicyFlags: state.sourcePolicyFlags,
      sourceCount: state.sourceCount,
      authorityCount: state.authorityCount,
      primarySourceCount: state.primarySourceCount,
      recentSourceCount: state.recentSourceCount,
      distinctDomainCount: state.distinctDomainCount,
      conflictScore: state.conflictScore,
      versionMatchScore: state.versionMatchScore,
      highRisk: state.highRisk,
      sufficient: state.sufficient,
    },
  };
}

function mergeSourcePolicy(config = {}, updates = {}) {
  const sourcePolicy = config.sourcePolicy && typeof config.sourcePolicy === "object" ? config.sourcePolicy : {};
  const overlays = uniqueRoutingTokens([...(Array.isArray(config.overlays) ? config.overlays : []), ...(Array.isArray(sourcePolicy.overlays) ? sourcePolicy.overlays : []), ...(updates.overlays || [])]);
  const flags = normalizePolicyFlags([...(Array.isArray(config.sourcePolicyFlags) ? config.sourcePolicyFlags : []), ...(Array.isArray(sourcePolicy.flags) ? sourcePolicy.flags : []), ...(updates.sourcePolicyFlags || []), ...sourcePolicyFlagsFromOverlays(overlays)]);
  const family = updates.family || config.domainFamily || sourcePolicy.family || config.domain;
  return {
    ...config,
    ...(updates.preferRecent ? { preferRecent: true } : {}),
    ...(family ? { domainFamily: family } : {}),
    overlays,
    sourcePolicyFlags: flags,
    sourcePolicy: {
      ...sourcePolicy,
      ...(family ? { family } : {}),
      overlays,
      flags,
    },
    requireAuthoritative: config.requireAuthoritative || flags.includes("official-only") || flags.includes("primary-source-required"),
  };
}

export function applyResearchPolicyControls(config = {}, policyDecision = {}) {
  return mergeSourcePolicy(config, policyDecision.controls || {});
}

export function legacyFollowupActionFromPolicyAction(action = "") {
  return {
    fetch_more: "need_more_sources",
    fetch_authority: "need_authority",
    fetch_primary_source: "need_primary_source",
    fetch_recent: "need_recency",
    fetch_version_context: "need_version_context",
    resolve_conflict: "need_conflict_resolution",
    ask_clarifying_question: "ask_clarifying_question",
    tighten_source_policy: "need_authority",
    switch_family: "need_authority",
    add_overlay: "need_authority",
    stop: "stop",
  }[action] || "need_more_sources";
}

export function buildPolicyFollowUpQuery(query = "", policyDecision = {}, options = {}) {
  const legacyAction = legacyFollowupActionFromPolicyAction(policyDecision.action);
  if (legacyAction === "stop") return null;
  return buildActionBasedFollowUpQuery(query, legacyAction, options);
}
