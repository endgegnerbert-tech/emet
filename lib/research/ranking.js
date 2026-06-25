// Source ranking & scoring — scoreSearchResult, scoreFetchedPage, scoreSourceEntry,
// prioritizeSourceEntries, rankSearchResults, rankFetchedPages, freshness helpers.
// Layer: platform — imports from base (research-policy, version-context, heuristics).

import {
  buildAuthorityFollowUpQueries,
  pageQualitySignals,
  sourceAuthorityProfile
} from "../research-policy.js";
import {
  extractVersionContext,
  scoreVersionMatch,
} from "../version-context.js";
import {
  classifyQueryIntent,
  classifySourceType,
  hostnameFromUrl,
  isAuthoritativeUrl,
  isDocsLike,
  isLikelyOfficialDocsHost,
  isSecondaryDocsHost,
  normalizeResearchFreshness,
  queryTerms,
} from "./heuristics.js";

// --- freshness helpers ---

function summarizeFreshness(dateText) {
  if (!dateText) return "unknown";
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "unknown";
  const ageMs = Date.now() - date.getTime();
  if (ageMs <= 24 * 60 * 60 * 1000) return "today";
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) return "this_week";
  if (ageMs <= 365 * 24 * 60 * 60 * 1000) return "this_year";
  return "older";
}

function freshnessBonus(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return 0;
  const ageMs = Date.now() - date.getTime();
  const months = ageMs / (30 * 24 * 60 * 60 * 1000);
  if (months <= 6) return 8;
  if (months <= 18) return 4;
  if (months <= 36) return 1;
  return -4;
}

function monthsSince(dateText) {
  if (!dateText) return null;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

function isRecentResearchFreshness(freshness, publishDate) {
  return ["today", "this_week", "this_year"].includes(normalizeResearchFreshness(freshness, publishDate));
}

function isVolatileQuery(query) {
  return /\b(npm|package|deprecated|deprecation|support|supported|status|latest|current|compatibility|compatible|version|release)\b/i.test(query);
}

// --- search result scoring ---

function countTermMatches(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.filter((term) => lower.includes(term)).length;
}

function allowedSourceBoost(result, allowedSources = []) {
  if (!Array.isArray(allowedSources) || allowedSources.length === 0) return 0;
  const url = String(result?.url || "").toLowerCase();
  const title = String(result?.title || "").toLowerCase();
  const sourceType = classifySourceType(url, title);
  let hostname = "";
  let boost = 0;

  try {
    hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    // ignore invalid urls
  }

  for (const hint of allowedSources.map((value) => String(value).toLowerCase())) {
    if (!hint) continue;
    if (hint === sourceType || hint === url || title.includes(hint)) boost += 8;
    if (hostname && (hostname === hint || hostname.endsWith(`.${hint}`) || hint.includes(hostname) || url.includes(hint))) boost += 8;
    if (hint === "docs" && (sourceType === "official_doc" || /\/docs?\b|documentation|developer|reference|official/.test(url))) boost += 6;
    if (hint === "github" && (/github\.com/.test(url) || sourceType.startsWith("github_"))) boost += 6;
    if (hint === "paper" && sourceType === "paper") boost += 6;
  }

  return boost;
}

export function scoreSearchResult(result, query, config = {}) {
  const terms = queryTerms(query);
  const url = String(result.url || "").toLowerCase();
  const versionSignals = scoreVersionMatch(result, extractVersionContext(query));
  let score = 0;
  score += countTermMatches(result.title, terms) * 3;
  score += countTermMatches(result.snippet, terms) * 2;
  if (/\/docs?\b|documentation|developer|reference|official/.test(url)) score += 5;
  if (/github\.com/.test(url) && /(readme|\/docs?\/|#readme)/.test(url)) score += 4;
  if (/github\.com/.test(url) && /\/(issues|pull|pulls)\//.test(url)) score -= 4;
  if (/\/login|\/signin|\/sign-in|\/account|\/subscribe|\/checkout/.test(url)) score -= 8;
  if (!result.snippet) score -= 2;
  score += allowedSourceBoost(result, config.allowedSources);
  if (config.preferRecent) score += freshnessBonus(result.publishDate || result.freshness);
  score += versionSignals.score;
  return score;
}

function normalizeUrl(url) {
  const parsed = new URL(url);
  parsed.hash = "";
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

export function rankAndDeduplicateResults(results, limit = 5) {
  const seen = new Set();
  const deduped = [];

  for (const result of results) {
    const key = normalizeUrl(result.url);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

export function rankSearchResults(results, query, limit = 5, config = {}) {
  return rankAndDeduplicateResults([...results].sort((a, b) => scoreSearchResult(b, query, config) - scoreSearchResult(a, query, config)), limit);
}

// --- page scoring ---

export function scoreFetchedPage(page, query, config = {}) {
  const terms = queryTerms(query);
  const text = String(page?.text || "");
  const firstChunk = text.slice(0, 500);
  const url = String(page?.url || "").toLowerCase();
  const versionSignals = scoreVersionMatch(page, extractVersionContext(query));
  let score = countTermMatches(text, terms) + countTermMatches(firstChunk, terms) * 3;

  if (/\/docs?\b|documentation|developer|reference|official/.test(url)) score += 6;
  if (/github\.com/.test(url) && /(readme|\/docs?\/|#readme)/.test(url)) score += 4;
  if (/stackoverflow\.com|reddit\.com|quora\.com/.test(url)) score -= 2;
  if (countTermMatches(firstChunk, terms) > 0) score += 5;

  const quality = page?.quality || pageQualitySignals({
    title: page?.title || "",
    text,
    url: page?.url || "",
    query,
  });
  if (quality.blocked) score -= 20;
  if (quality.negativeSignals?.includes("placeholder")) score -= 10;
  if (quality.negativeSignals?.includes("weak_text")) score -= 8;
  if (quality.negativeSignals?.includes("thin_text")) score -= 4;
  if (quality.negativeSignals?.includes("query_overlap_low")) score -= 6;

  const ageInMonths = monthsSince(page?.publishDate);
  const versionContext = extractVersionContext(query);
  if (config.preferRecent && ageInMonths !== null && !versionContext.explicitVersion) {
    if (ageInMonths <= 6) score += 8;
    else if (ageInMonths <= 18) score += 4;
    else if (ageInMonths > 36) score -= 4;
  } else if (isVolatileQuery(query) && ageInMonths !== null && ageInMonths > 18) {
    score -= 3;
  }

  score += allowedSourceBoost(page, config.allowedSources);
  score += versionSignals.score;
  return score;
}

export function rankFetchedPages(pages, query, limit = pages.length, config = {}) {
  return [...pages].sort((a, b) => scoreFetchedPage(b, query, config) - scoreFetchedPage(a, query, config)).slice(0, limit);
}

// --- source entry scoring (used by coverage, confidence) ---

export function scoreSourceEntry(source, query = "") {
  const url = String(source?.url || "");
  const title = String(source?.title || "");

  const authorityProfile = sourceAuthorityProfile({
    url,
    title,
    text: source?.text || source?.snippet || "",
    query,
  });
  const sourceType = authorityProfile.sourceType || classifySourceType(url, title);
  const freshness = normalizeResearchFreshness(source?.freshness, source?.publishDate);
  const versionSignals = source?.versionSignals || scoreVersionMatch(source, extractVersionContext(query));
  let typeScore = 0;
  let freshnessScore = 0;
  let domainScore = authorityProfile.domainBoost || 0;
  let authoritative = authorityProfile.authoritative || isAuthoritativeUrl(url) || sourceType === "official_doc" || sourceType === "paper" || sourceType === "file";

  if (authoritative) typeScore += 10;
  if (sourceType === "official_doc") typeScore += 8;
  if (sourceType === "github_readme") typeScore += 7;
  if (sourceType === "paper") typeScore += 8;
  if (sourceType === "github_repo") typeScore += 4;
  if (sourceType === "file") typeScore += 6;
  if (sourceType === "forum") typeScore -= 1;
  if (sourceType === "blog") typeScore -= 2;

  if (freshness === "today") freshnessScore += 4;
  else if (freshness === "this_week") freshnessScore += 3;
  else if (freshness === "this_year") freshnessScore += 2;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const terms = queryTerms(query);
    const hostMatches = terms.filter((term) => hostname.includes(term)).length;
    if (path === "/" || path === "") {
      if (hostMatches > 0) domainScore += 6 + hostMatches;
    } else if (hostMatches > 0) {
      domainScore += 3 + hostMatches;
    }
    if (/arxiv\.org|semanticscholar\.org|doi\.org|pubmed\.ncbi\.nlm\.nih\.gov|\.edu$|\.ac\.uk$/.test(hostname)) domainScore += 5;
    if (/linkedin\.com|newreleases\.io|releasealert\.|pacgie\.|versio\./.test(hostname)) domainScore -= 6;
    if (/blog\./.test(hostname) && sourceType !== "official_doc") domainScore -= 2;
  } catch {
    // ignore
  }

  const total = typeScore + freshnessScore + domainScore + versionSignals.score;
  authoritative = authoritative || total >= 10;
  return { sourceType, authoritative, freshness, typeScore, freshnessScore, domainScore, versionScore: versionSignals.score, versionSignals, total, score: total };
}

export function prioritizeSourceEntries(sources, query = "") {
  return [...sources]
    .map((source) => {
      const scored = scoreSourceEntry(source, query);
      return {
        ...source,
        sourceType: source.sourceType || scored.sourceType,
        authoritative: typeof source.authoritative === "boolean" ? source.authoritative : scored.authoritative,
        freshness: source.freshness || scored.freshness,
        versionSignals: source.versionSignals || scored.versionSignals,
        score: typeof source.score === "number" ? source.score : scored.total,
      };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

export { summarizeFreshness, normalizeResearchFreshness, isRecentResearchFreshness, freshnessBonus };
