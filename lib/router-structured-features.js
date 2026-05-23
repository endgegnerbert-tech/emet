import { PLACEHOLDER_PATTERNS } from "./research-policy.js";

const AUTHORITATIVE_TYPES = new Set(["official_doc", "paper", "github_readme", "github_repo", "file"]);
const POSITIVE_PATTERN = /\b(supported|works|available|recommended|stable|benchmark|comprehensive|practical)\b/i;
const NEGATIVE_PATTERN = /\b(not supported|unsupported|does not|no support|broken|incompatible|removed|blocked|denied)\b/i;
const KNOWN_SOURCE_TYPES = new Set(["official_doc", "paper", "github_readme", "github_repo", "forum", "blog", "news", "other", "file"]);

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
  const text = `${page.title || ""} ${page.snippet || page.text || ""}`.replace(/\s+/g, " ").trim();
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
  };
}

export function structuredSourcesFromPages(pages = []) {
  return Array.isArray(pages) ? pages.map((page, index) => structuredSourceFromPage(page, index)) : [];
}

export function extractQueryAspectFlags(query = "") {
  const text = String(query || "");
  return {
    temporal: /\b(current|latest|today|status|support|supported|lts|2024|2025|2026|release)\b/i.test(text) ? 1 : 0,
    versioned: /\b(version|v\d+|migration|upgrade|compatibility|compatible|build flag)\b/i.test(text) ? 1 : 0,
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

function baseStructuredFeatures(query, sources) {
  const flags = extractQueryAspectFlags(query);
  const counts = countBySourceType(sources);
  const authoritativeSources = sources.filter((source) => source.authoritative && !source.blocked);
  return {
    query_temporal: flags.temporal,
    query_versioned: flags.versioned,
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
  };
}

export function extractConflictStructuredFeaturesFromSources(query = "", sources = [], candidateLabel = "") {
  return {
    ...baseStructuredFeatures(query, sources),
    candidate_conflict: String(candidateLabel || "").includes("conflict") ? 1 : 0,
    has_authority_resolution_path: sources.some((source) => source.authoritative && !source.blocked) ? 1 : 0,
  };
}

export function extractConflictStructuredFeatures(row = {}) {
  const sources = parseStructuredSources(row.inputText || "");
  return extractConflictStructuredFeaturesFromSources(row.query || "", sources, row.candidateLabel || row.label || "");
}

export function extractConflictStructuredFeaturesFromPages(query = "", pages = [], candidateLabel = "") {
  return extractConflictStructuredFeaturesFromSources(query, structuredSourcesFromPages(pages), candidateLabel);
}

export function extractSufficiencyStructuredFeaturesFromSources(query = "", sources = []) {
  return {
    ...baseStructuredFeatures(query, sources),
    has_authority: sources.some((source) => source.authoritative && !source.blocked) ? 1 : 0,
    has_only_one_good_source: sources.filter((source) => source.authoritative && !source.blocked).length === 1 ? 1 : 0,
  };
}

export function extractSufficiencyStructuredFeatures(row = {}) {
  const sources = parseStructuredSources(row.inputText || "");
  return extractSufficiencyStructuredFeaturesFromSources(row.query || "", sources);
}

export function extractSufficiencyStructuredFeaturesFromPages(query = "", pages = []) {
  return extractSufficiencyStructuredFeaturesFromSources(query, structuredSourcesFromPages(pages));
}
