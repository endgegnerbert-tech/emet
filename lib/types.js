import { normalizeResearchFreshness } from "./research.js";

export const SourceType = {
  OFFICIAL_DOC: "official_doc",
  GITHUB_README: "github_readme",
  GITHUB_REPO: "github_repo",
  PAPER: "paper",
  BLOG: "blog",
  NEWS: "news",
  FORUM: "forum",
  FILE: "file",
  OTHER: "other",
};

export const ResearchFreshness = {
  TODAY: "today",
  THIS_WEEK: "this_week",
  THIS_YEAR: "this_year",
  OLDER: "older",
  UNKNOWN: "unknown",
};

export function createResearchSource(source = {}) {
  return {
    title: source.title || "",
    url: source.url || "",
    snippet: source.snippet || "",
    sourceType: source.sourceType || SourceType.OTHER,
    authoritative: Boolean(source.authoritative),
    score: typeof source.score === "number" ? source.score : 0,
    freshness: normalizeResearchFreshness(source.freshness, source.publishDate) || ResearchFreshness.UNKNOWN,
    local: Boolean(source.local),
  };
}

export function createResearchResult(result = {}) {
  return {
    answer: result.answer || "",
    bullets: Array.isArray(result.bullets) ? result.bullets : [],
    citations: Array.isArray(result.citations) ? result.citations : [],
    sources: Array.isArray(result.sources) ? result.sources.map(createResearchSource) : [],
    claims: Array.isArray(result.claims) ? result.claims : [],
    evidenceSummary: result.evidenceSummary || "",
    codeBlocks: Array.isArray(result.codeBlocks) ? result.codeBlocks : [],
    sufficient: Boolean(result.sufficient),
    missingAspects: Array.isArray(result.missingAspects) ? result.missingAspects : [],
    openSubQuestions: Array.isArray(result.openSubQuestions) ? result.openSubQuestions : [],
    conflictSummary: result.conflictSummary || "",
    confidence: typeof result.confidence === "number" ? result.confidence : 0,
    sourceTypes: Array.isArray(result.sourceTypes) ? result.sourceTypes : [],
    unverifiedClaims: Array.isArray(result.unverifiedClaims) ? result.unverifiedClaims : [],
    meta: result.meta && typeof result.meta === "object" ? result.meta : {},
  };
}
