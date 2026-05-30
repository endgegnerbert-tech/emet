import { PLACEHOLDER_PATTERNS } from "./research-policy.js";
import {
  QUERY_UNDERSTANDING_SOURCE_FAMILIES,
  ROUTING_FAMILIES,
  ROUTING_OVERLAYS,
  SOURCE_POLICY_FLAGS,
  normalizeRoutingToken,
  sourcePolicyFlagsFromOverlays,
  uniqueRoutingTokens,
} from "./router-policy-context.js";
import { extractVersionContext, scoreVersionMatch } from "./version-context.js";

const AUTHORITATIVE_TYPES = new Set(["official_doc", "paper", "github_readme", "github_repo", "file"]);
const POSITIVE_PATTERN = /\b(supported|works|available|recommended|stable|benchmark|comprehensive|practical)\b/i;
const NEGATIVE_PATTERN = /\b(not supported|unsupported|does not|no support|broken|incompatible|removed|blocked|denied)\b/i;
const KNOWN_SOURCE_TYPES = new Set(["official_doc", "paper", "github_readme", "github_repo", "forum", "blog", "news", "other", "file"]);

function routingContextFromSources(sources = [], context = {}) {
  const firstSource = sources.find(Boolean) || {};
  const meta = context && typeof context === "object" ? context : {};
  const sourcePolicy = meta.sourcePolicy && typeof meta.sourcePolicy === "object" ? meta.sourcePolicy : {};
  const queryUnderstanding = meta.queryUnderstandingDecision || meta.queryUnderstanding || meta.query_understanding || {};
  const family = normalizeRoutingToken(meta.domainFamily || meta.domain_family || sourcePolicy.family || firstSource.domain_family || firstSource.domainFamily || meta.domain || "web");
  const overlays = uniqueRoutingTokens([
    ...(Array.isArray(meta.overlays) ? meta.overlays : []),
    ...(Array.isArray(sourcePolicy.overlays) ? sourcePolicy.overlays : []),
    ...(Array.isArray(firstSource.overlays) ? firstSource.overlays : []),
  ]);
  const sourcePolicyFlags = uniqueRoutingTokens([
    ...(Array.isArray(meta.sourcePolicyFlags) ? meta.sourcePolicyFlags : []),
    ...(Array.isArray(meta.source_policy_flags) ? meta.source_policy_flags : []),
    ...(Array.isArray(sourcePolicy.flags) ? sourcePolicy.flags : []),
    ...(Array.isArray(firstSource.source_policy_flags) ? firstSource.source_policy_flags : []),
    ...(Array.isArray(firstSource.sourcePolicyFlags) ? firstSource.sourcePolicyFlags : []),
    ...sourcePolicyFlagsFromOverlays(overlays),
  ]);

  return { family, overlays, sourcePolicyFlags, queryUnderstanding };
}

function categoricalFeatures(prefix, values, activeValues = []) {
  const active = new Set(uniqueRoutingTokens(activeValues));
  return Object.fromEntries(values.map((value) => [`${prefix}_${value.replaceAll("-", "_")}`, active.has(value) ? 1 : 0]));
}

function routingContextFeatures(sources = [], context = {}) {
  const { family, overlays, sourcePolicyFlags, queryUnderstanding } = routingContextFromSources(sources, context);
  const sourceFamily = normalizeRoutingToken(queryUnderstanding.source_family);
  const recencyNeed = normalizeRoutingToken(queryUnderstanding.recency_need);
  const ambiguity = normalizeRoutingToken(queryUnderstanding.ambiguity);
  return {
    ...categoricalFeatures("domain_family", ROUTING_FAMILIES, [family]),
    ...categoricalFeatures("overlay", ROUTING_OVERLAYS, overlays),
    ...categoricalFeatures("source_policy", SOURCE_POLICY_FLAGS, sourcePolicyFlags),
    overlay_count: overlays.length,
    source_policy_flag_count: sourcePolicyFlags.length,
    high_risk_family: family === "regulated" ? 1 : 0,
    requires_authority: sourcePolicyFlags.includes("official-only") || sourcePolicyFlags.includes("primary-source-required") ? 1 : 0,
    requires_primary_source: sourcePolicyFlags.includes("primary-source-required") ? 1 : 0,
    requires_recency: sourcePolicyFlags.includes("recency-required") ? 1 : 0,
    requires_version_context: sourcePolicyFlags.includes("version-sensitive") ? 1 : 0,
    query_understanding_present: Object.keys(queryUnderstanding).length ? 1 : 0,
    ...categoricalFeatures("query_understanding_source_family", QUERY_UNDERSTANDING_SOURCE_FAMILIES, [sourceFamily]),
    query_understanding_recency_required: ["required", "fresh", "current"].includes(recencyNeed) ? 1 : 0,
    query_understanding_ambiguous: /ambiguous|needs_clarification/.test(ambiguity) ? 1 : 0,
  };
}

export function parseStructuredSources(inputText = "") {
  const marker = "Sources:";
  const index = String(inputText).indexOf(marker);
  if (index === -1) return [];
  const body = String(inputText).slice(index + marker.length).trim();
  if (!body) return [];

  return body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, idx) => {
      const match = chunk.match(/^\[([^\]]+)\]\s*(.*)$/s);
      const sourceType = match?.[1] || "other";
      const text = (match?.[2] || chunk).replace(/\s+/g, " ").trim();
      return {
        index: idx,
        sourceType,
        title: text,
        text,
        authoritative: AUTHORITATIVE_TYPES.has(sourceType),
        blocked: PLACEHOLDER_PATTERNS.some((p) => p.test(text)),
        positive: POSITIVE_PATTERN.test(text),
        negative: NEGATIVE_PATTERN.test(text),
      };
    });
}

export function structuredSourceFromPage(page = {}, index = 0) {
  const sourceType = KNOWN_SOURCE_TYPES.has(page.sourceType) ? page.sourceType : "other";
  const text = `${page.title || ""} ${page.snippet || page.text_sample || page.text || ""}`.replace(/\s+/g, " ").trim();
  const blocked = Boolean(page.quality?.blocked) || PLACEHOLDER_PATTERNS.some((p) => p.test(text));
  const authoritative = !blocked && (Boolean(page.authoritative) || AUTHORITATIVE_TYPES.has(sourceType));

  return {
    index,
    sourceType,
    title: page.title || text,
    text,
    authoritative,
    blocked,
    positive: POSITIVE_PATTERN.test(text),
    negative: NEGATIVE_PATTERN.test(text),
    versionSignals: page.versionSignals || null,
    domain_family: page.domain_family || page.domainFamily || null,
    domainFamily: page.domainFamily || page.domain_family || null,
    overlays: Array.isArray(page.overlays) ? page.overlays : [],
    source_policy_flags: Array.isArray(page.source_policy_flags) ? page.source_policy_flags : (Array.isArray(page.sourcePolicyFlags) ? page.sourcePolicyFlags : []),
    sourcePolicyFlags: Array.isArray(page.sourcePolicyFlags) ? page.sourcePolicyFlags : (Array.isArray(page.source_policy_flags) ? page.source_policy_flags : []),
  };
}

export function structuredSourcesFromPages(pages = []) {
  return Array.isArray(pages) ? pages.map((page, index) => structuredSourceFromPage(page, index)) : [];
}

export function extractQueryAspectFlags(query = "") {
  const text = String(query || "");
  const versionContext = extractVersionContext(query);
  return {
    temporal: /\b(current|latest|today|status|support|supported|lts|2024|2025|2026|release)\b/i.test(text) ? 1 : 0,
    versioned: versionContext.versionSensitive ? 1 : 0,
    explicitVersion: versionContext.explicitVersion ? 1 : 0,
    deprecatedIntent: versionContext.deprecatedIntent ? 1 : 0,
    prefersChangelog: versionContext.prefersChangelog ? 1 : 0,
    comparison: /\b(vs\.?|versus|compare|comparison|compared to)\b/i.test(text) ? 1 : 0,
    academic: /\b(paper|papers|study|studies|arxiv|doi|research|benchmark)\b/i.test(text) ? 1 : 0,
    procedural: /\b(readme|issue|repo|repository|docs|documentation|file|csv|json|run|how to|api)\b/i.test(text) ? 1 : 0,
  };
}

function countBySourceType(sources = []) {
  const keys = ["official_doc", "paper", "github_readme", "github_repo", "forum", "blog", "other", "file"];
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const source of sources) counts[source.sourceType] = (counts[source.sourceType] || 0) + 1;
  return counts;
}

function baseStructuredFeatures(query, sources, context = {}) {
  const flags = extractQueryAspectFlags(query);
  const counts = countBySourceType(sources);
  const authoritativeSources = sources.filter((source) => source.authoritative && !source.blocked);
  const versionContext = extractVersionContext(query);
  const normalizedSources = sources.map((source) => ({
    ...source,
    versionSignals: source.versionSignals || scoreVersionMatch(source, versionContext),
  }));
  return {
    query_temporal: flags.temporal,
    query_versioned: flags.versioned,
    query_explicit_version: flags.explicitVersion,
    query_deprecated_intent: flags.deprecatedIntent,
    query_prefers_changelog: flags.prefersChangelog,
    query_comparison: flags.comparison,
    query_academic: flags.academic,
    query_procedural: flags.procedural,
    source_count: sources.length,
    authoritative_source_count: authoritativeSources.length,
    blocked_source_count: sources.filter((source) => source.blocked).length,
    positive_signal_sources: sources.filter((source) => source.positive).length,
    negative_signal_sources: sources.filter((source) => source.negative).length,
    official_doc_count: counts.official_doc,
    paper_count: counts.paper,
    github_readme_count: counts.github_readme,
    github_repo_count: counts.github_repo,
    forum_count: counts.forum,
    blog_count: counts.blog,
    other_count: counts.other,
    file_count: counts.file,
    version_exact_match_source_count: normalizedSources.filter((source) => source.versionSignals?.exactVersionMatch).length,
    version_partial_match_source_count: normalizedSources.filter((source) => source.versionSignals?.partialVersionMatch).length,
    version_mismatch_source_count: normalizedSources.filter((source) => source.versionSignals?.mismatch).length,
    changelog_source_count: normalizedSources.filter((source) => source.versionSignals?.pageKind === "changelog").length,
    release_notes_source_count: normalizedSources.filter((source) => source.versionSignals?.pageKind === "release_notes").length,
    breaking_changes_source_count: normalizedSources.filter((source) => source.versionSignals?.pageKind === "breaking_changes").length,
    migration_guide_source_count: normalizedSources.filter((source) => source.versionSignals?.pageKind === "migration_guide").length,
    versioned_doc_source_count: normalizedSources.filter((source) => source.versionSignals?.pageKind === "versioned_doc").length,
    ...routingContextFeatures(sources, context),
  };
}

export function extractConflictStructuredFeaturesFromSources(query = "", sources = [], candidateLabel = "", context = {}) {
  return {
    ...baseStructuredFeatures(query, sources, context),
    candidate_conflict: String(candidateLabel || "").includes("conflict") ? 1 : 0,
    has_authority_resolution_path: sources.some((source) => source.authoritative && !source.blocked) ? 1 : 0,
  };
}

export function extractConflictStructuredFeatures(row = {}) {
  const sources = parseStructuredSources(row.inputText || "");
  return extractConflictStructuredFeaturesFromSources(row.query || "", sources, row.candidateLabel || row.label || "", row.meta || {});
}

export function extractConflictStructuredFeaturesFromPages(query = "", pages = [], candidateLabel = "", context = {}) {
  return extractConflictStructuredFeaturesFromSources(query, structuredSourcesFromPages(pages), candidateLabel, context);
}

export function extractSufficiencyStructuredFeaturesFromSources(query = "", sources = [], context = {}) {
  return {
    ...baseStructuredFeatures(query, sources, context),
    has_authority: sources.some((source) => source.authoritative && !source.blocked) ? 1 : 0,
    has_only_one_good_source: sources.filter((source) => source.authoritative && !source.blocked).length === 1 ? 1 : 0,
  };
}

export function extractSufficiencyStructuredFeatures(row = {}) {
  const sources = parseStructuredSources(row.inputText || "");
  return extractSufficiencyStructuredFeaturesFromSources(row.query || "", sources, row.meta || {});
}

export function extractSufficiencyStructuredFeaturesFromPages(query = "", pages = [], context = {}) {
  return extractSufficiencyStructuredFeaturesFromSources(query, structuredSourcesFromPages(pages), context);
}

export function extractSourceAuthorityFeatures(query = "", source = {}, domainFamily = "") {
  const flags = extractQueryAspectFlags(query);
  const versionContext = extractVersionContext(query);
  const versionSignals = source.versionSignals || scoreVersionMatch(source, versionContext);

  return {
    query_temporal: flags.temporal,
    query_versioned: flags.versioned,
    query_explicit_version: flags.explicitVersion,
    query_comparison: flags.comparison,
    query_academic: flags.academic,
    query_procedural: flags.procedural,
    source_is_official: source.sourceType === "official_doc" ? 1 : 0,
    source_is_paper: source.sourceType === "paper" ? 1 : 0,
    source_is_github: (source.sourceType === "github_readme" || source.sourceType === "github_repo") ? 1 : 0,
    source_is_forum: source.sourceType === "forum" ? 1 : 0,
    source_is_news: source.sourceType === "news" ? 1 : 0,
    domain_match_security: domainFamily === "security" ? 1 : 0,
    domain_match_medical: domainFamily === "medical" ? 1 : 0,
    domain_match_legal: domainFamily === "legal" ? 1 : 0,
    domain_match_finance: domainFamily === "finance" ? 1 : 0,
    has_positive_signal: source.positive ? 1 : 0,
    has_negative_signal: source.negative ? 1 : 0,
    version_exact_match: versionSignals?.exactVersionMatch ? 1 : 0,
    version_partial_match: versionSignals?.partialVersionMatch ? 1 : 0,
    version_mismatch: versionSignals?.mismatch ? 1 : 0,
  };
}

export function extractPageQualityFeatures(query = "", page = {}) {
  const flags = extractQueryAspectFlags(query);
  const text = String(page.text || "").replace(/\s+/g, " ").trim();
  const textLen = text.length;

  return {
    query_temporal: flags.temporal,
    query_comparison: flags.comparison,
    query_academic: flags.academic,
    text_length_norm: Math.min(textLen / 5000, 1.0),
    is_very_short: textLen < 400 ? 1 : 0,
    is_thin: textLen >= 400 && textLen < 1200 ? 1 : 0,
    has_placeholder_pattern: PLACEHOLDER_PATTERNS.some((p) => p.test(text)) ? 1 : 0,
    status_403: page.fetchStatus === 403 ? 1 : 0,
    status_429: page.fetchStatus === 429 ? 1 : 0,
    status_404: page.fetchStatus === 404 ? 1 : 0,
    content_type_html: page.contentType?.includes("html") ? 1 : 0,
    content_type_pdf: page.contentType?.includes("pdf") ? 1 : 0,
    source_is_official: page.sourceType === "official_doc" ? 1 : 0,
  };
}
