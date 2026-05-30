import { createHash } from "node:crypto";

import {
  classifySourceType,
  normalizeResearchFreshness,
  scoreSourceEntry,
} from "./research.js";
import { pageQualitySignals } from "./research-policy.js";
import { extractVersionContext, scoreVersionMatch } from "./version-context.js";

const POLICY_FLAG_OVERLAYS = new Set([
  "official-only",
  "primary-source-required",
  "recency-required",
  "version-sensitive",
]);
const RECENT_FRESHNESS = new Set(["today", "this_week", "this_year"]);

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function roundScore(value) {
  return Number(clamp01(value).toFixed(3));
}

function hashText(text = "") {
  return createHash("sha1").update(String(text || "")).digest("hex");
}

function hostFromUrl(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeGraphSourceType(sourceType = "other") {
  if (sourceType === "github_readme") return "github_repo";
  if (["official_doc", "paper", "github_repo", "news", "forum", "other"].includes(sourceType)) return sourceType;
  return "other";
}

function qualityScoreFromSignals(quality = {}) {
  if (quality.blocked) return 0;
  let score = 1;
  if (quality.placeholder) score -= 0.45;
  if (quality.weak) score -= 0.25;
  score -= Math.min(0.45, (quality.negativeSignals?.length || 0) * 0.12);
  if (quality.plainLength && quality.plainLength < 1200) score -= 0.1;
  return roundScore(score);
}

function authorityScoreFromTotal(total = 0) {
  return roundScore((Number(total || 0) + 10) / 45);
}

function versionMatchScore(versionSignals = {}) {
  if (versionSignals.exactVersionMatch) return 1;
  if (versionSignals.partialVersionMatch) return 0.65;
  if (versionSignals.mismatch) return 0;
  return roundScore(Number(versionSignals.score || 0) / 10);
}

function sourceTextSample(source = {}) {
  return String(source.text || source.snippet || "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

export function createEvidence(evidence = {}) {
  return {
    type: evidence.type || "web",
    source: evidence.source || "",
    snippet: evidence.snippet || "",
  };
}

export function createClaim(claim = {}) {
  return {
    text: claim.text || "",
    confidence: claim.confidence || "low",
    evidence: Array.isArray(claim.evidence) ? claim.evidence.map(createEvidence) : [],
  };
}

export function explainConfidence(confidence = "low", evidenceCount = 0) {
  if (confidence === "high" && evidenceCount >= 2) return "Multiple sources support this claim.";
  if (confidence === "medium") return "Some supporting evidence was found.";
  return "Limited supporting evidence was found.";
}

export function sourcePolicyFlagsFromConfig(config = {}) {
  const sourcePolicy = config.sourcePolicy && typeof config.sourcePolicy === "object" ? config.sourcePolicy : {};
  const overlays = unique([
    ...(Array.isArray(config.overlays) ? config.overlays : []),
    ...(Array.isArray(sourcePolicy.overlays) ? sourcePolicy.overlays : []),
  ]);
  const explicitFlags = unique([
    ...(Array.isArray(config.sourcePolicyFlags) ? config.sourcePolicyFlags : []),
    ...(Array.isArray(sourcePolicy.flags) ? sourcePolicy.flags : []),
    ...overlays.filter((overlay) => POLICY_FLAG_OVERLAYS.has(overlay)),
  ]);

  if (config.requireAuthoritative && !explicitFlags.includes("official-only") && !explicitFlags.includes("primary-source-required")) explicitFlags.push("official-only");
  if (config.preferRecent && !explicitFlags.includes("recency-required")) explicitFlags.push("recency-required");
  return unique(explicitFlags);
}

export function createEvidenceSource(source = {}, context = {}) {
  const query = context.query || "";
  const domainFamily = context.domainFamily || "web";
  const overlays = unique(context.overlays || []);
  const sourcePolicyFlags = unique(context.sourcePolicyFlags || []);
  const url = String(source.url || "");
  const title = String(source.title || "");
  const textSample = sourceTextSample(source);
  const scored = scoreSourceEntry(source, query);
  const sourceType = source.sourceType || scored.sourceType || classifySourceType(url, title);
  const freshness = normalizeResearchFreshness(source.freshness, source.publishDate);
  const quality = source.quality || pageQualitySignals({
    title,
    text: source.text || source.snippet || "",
    url,
    query,
    status: source.fetchStatus ?? 200,
    contentType: source.contentType || "text/html",
  });
  const versionSignals = source.versionSignals || scoreVersionMatch(source, extractVersionContext(query));
  const textHash = source.textHash || hashText(source.text || source.snippet || `${title}:${url}`);
  const authorityScore = authorityScoreFromTotal(scored.total);
  const qualityScore = qualityScoreFromSignals(quality);
  const claims = Array.isArray(source.claims) ? source.claims.map(createClaim).filter((claim) => claim.text) : [];

  return {
    id: `source:${textHash.slice(0, 12)}`,
    url,
    host: hostFromUrl(url),
    title,
    snippet: source.snippet || "",
    text_sample: textSample,
    source_type: normalizeGraphSourceType(sourceType),
    sourceType,
    domain_family: domainFamily,
    domainFamily,
    overlays,
    source_policy_flags: sourcePolicyFlags,
    sourcePolicyFlags,
    authority_score: authorityScore,
    authorityScore,
    quality_score: qualityScore,
    qualityScore,
    authoritative: Boolean(source.authoritative ?? scored.authoritative),
    score: typeof source.score === "number" ? source.score : scored.total,
    freshness,
    publishDate: source.publishDate || null,
    version_match_score: versionMatchScore(versionSignals),
    versionSignals,
    claims,
    quality,
    text_hash: textHash,
    textHash,
  };
}

function claimPolarity(claim = {}) {
  const text = String(claim.text || "").toLowerCase();
  if (/\b(not supported|unsupported|does not|no support|broken|incompatible|removed)\b/.test(text)) return "negative";
  if (/\b(supported|works|available|recommended|stable|compatible)\b/.test(text)) return "positive";
  return "neutral";
}

function addNode(nodes, seen, node) {
  if (!node?.id || seen.has(node.id)) return;
  seen.add(node.id);
  nodes.push(node);
}

function addEdge(edges, edge) {
  if (!edge?.from || !edge?.to || !edge?.type) return;
  edges.push(edge);
}

export function buildEvidenceState({ query = "", sources = [], config = {}, turn = null, action = "research_turn", conflict = null, sufficiency = null, followup = null, stopReason = null } = {}) {
  const domainFamily = config.domainFamily || config.sourcePolicy?.family || config.domain || "web";
  const overlays = unique([...(Array.isArray(config.overlays) ? config.overlays : []), ...(Array.isArray(config.sourcePolicy?.overlays) ? config.sourcePolicy.overlays : [])]);
  const sourcePolicyFlags = sourcePolicyFlagsFromConfig(config);
  const evidenceSources = sources.map((source) => createEvidenceSource(source, { query, domainFamily, overlays, sourcePolicyFlags }));
  const queryId = `query:${hashText(query).slice(0, 12)}`;
  const actionId = `action:${turn || 0}:${hashText(`${query}:${action}:${turn || 0}`).slice(0, 8)}`;
  const nodes = [];
  const edges = [];
  const seenNodes = new Set();
  const versionContext = extractVersionContext(query);

  addNode(nodes, seenNodes, { id: queryId, type: "query", text: query, domain_family: domainFamily, overlays, source_policy_flags: sourcePolicyFlags });
  addNode(nodes, seenNodes, { id: actionId, type: "action/turn", turn, action, stopReason });
  addEdge(edges, { from: actionId, to: queryId, type: "action_for_query" });

  if (versionContext.explicitVersion) {
    const versionId = `version:${hashText(versionContext.explicitVersion).slice(0, 12)}`;
    addNode(nodes, seenNodes, { id: versionId, type: "version", value: versionContext.explicitVersion });
    addEdge(edges, { from: queryId, to: versionId, type: "query_mentions_version" });
  }

  for (const source of evidenceSources) {
    addNode(nodes, seenNodes, { id: source.id, type: "source", url: source.url, title: source.title, source_type: source.source_type, authority_score: source.authority_score, quality_score: source.quality_score });
    if (source.host) {
      const hostId = `publisher:${source.host}`;
      addNode(nodes, seenNodes, { id: hostId, type: "publisher/domain", host: source.host });
      addEdge(edges, { from: source.id, to: hostId, type: "source_from_publisher" });
    }
    addEdge(edges, { from: source.id, to: queryId, type: "source_matches_family", family: domainFamily });
    for (const overlay of overlays) addEdge(edges, { from: source.id, to: queryId, type: "source_matches_overlay", overlay });
    if (source.authoritative || source.authority_score >= 0.65) addEdge(edges, { from: source.id, to: queryId, type: "source_is_primary_for_policy", source_policy_flags: sourcePolicyFlags });
    if (RECENT_FRESHNESS.has(source.freshness)) addEdge(edges, { from: source.id, to: queryId, type: "source_is_recent_for_query", freshness: source.freshness });
    if (source.version_match_score > 0) addEdge(edges, { from: source.id, to: queryId, type: "source_mentions_version", version_match_score: source.version_match_score });

    for (const [index, claim] of source.claims.entries()) {
      const claimId = `claim:${hashText(`${source.id}:${claim.text}:${index}`).slice(0, 12)}`;
      const polarity = claimPolarity(claim);
      addNode(nodes, seenNodes, { id: claimId, type: "claim", text: claim.text, confidence: claim.confidence, polarity });
      addEdge(edges, { from: source.id, to: claimId, type: polarity === "negative" ? "source_contradicts_claim" : "source_supports_claim" });
    }
  }

  if (sufficiency?.missingAspects?.length || sufficiency?.sufficient === false) {
    const claimId = `claim:${hashText(`${query}:requires-more-evidence`).slice(0, 12)}`;
    addNode(nodes, seenNodes, { id: claimId, type: "claim", text: "Research state may require more evidence", missingAspects: sufficiency?.missingAspects || [] });
    addEdge(edges, { from: claimId, to: queryId, type: "claim_requires_more_evidence", missingAspects: sufficiency?.missingAspects || [] });
  }

  return {
    schemaVersion: 1,
    query,
    turn,
    action,
    stopReason,
    domain_family: domainFamily,
    overlays,
    source_policy_flags: sourcePolicyFlags,
    sources: evidenceSources,
    nodes,
    edges,
    conflict: conflict ? { ...conflict } : null,
    sufficiency: sufficiency ? { ...sufficiency } : null,
    followup: followup ? { ...followup } : null,
    summary: {
      source_count: evidenceSources.length,
      authoritative_source_count: evidenceSources.filter((source) => source.authoritative).length,
      blocked_source_count: evidenceSources.filter((source) => source.quality?.blocked).length,
      recent_source_count: evidenceSources.filter((source) => RECENT_FRESHNESS.has(source.freshness)).length,
      version_match_source_count: evidenceSources.filter((source) => source.version_match_score > 0).length,
    },
  };
}

export function buildTurnEvidenceState({ query = "", sources = [], config = {}, turn = null, turnTrace = {}, stopReason = null } = {}) {
  return buildEvidenceState({
    query,
    sources,
    config,
    turn,
    action: "evaluate_turn",
    conflict: turnTrace.conflict || null,
    sufficiency: turnTrace.sufficiency || null,
    followup: turnTrace.followup || null,
    stopReason: stopReason || turnTrace.stopReason || null,
  });
}
