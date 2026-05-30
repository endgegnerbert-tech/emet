import {
  buildAuthorityFollowUpQueries,
  buildConflictFollowUpQueries,
  pageQualitySignals,
  sourceAuthorityProfile,
} from "./research-policy.js";
import { sourcePolicyFlagsFromOverlays } from "./router-policy-context.js";
import {
  extractVersionContext,
  scoreVersionMatch,
} from "./version-context.js";

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(text) {
  return decodeHtmlEntities(String(text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeDuckDuckGoUrl(href) {
  const normalized = href.startsWith("//") ? `https:${href}` : href;
  const url = new URL(normalized);
  const target = url.searchParams.get("uddg");
  return target ? decodeURIComponent(target) : normalized;
}

export function normalizeUrl(url) {
  const parsed = new URL(url);
  parsed.hash = "";
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

function queryTerms(query) {
  return String(query || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !["was", "ist", "the", "and", "oder", "und", "for", "von", "der", "die", "das"].includes(term));
}

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

function cleanDefinitionQuery(query) {
  return String(query || "")
    .replace(/^\s*(was ist|what is|wer ist|who is)\s+/i, "")
    .replace(/[?!.]+$/g, "")
    .trim();
}

export function normalizePaperTitle(title) {
  return String(title || "")
    .replace(/^\s*(?:title|paper|article|preprint)\s*[:\-–—]\s*/i, "")
    .replace(/^\s*(?:title|paper|article|preprint)\s+of\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function queryBase(query) {
  return String(query || "")
    .trim()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ");
}

function splitComparisonQuery(query) {
  const parts = String(query || "").split(/\bvs\.?\b|\bversus\b|\bgegenüber\b|\bcompared to\b/i).map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 2) : null;
}

function monthsSince(dateText) {
  if (!dateText) return null;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

export function summarizeFreshness(dateText) {
  if (!dateText) return "unknown";
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "unknown";
  const ageMs = Date.now() - date.getTime();
  if (ageMs <= 24 * 60 * 60 * 1000) return "today";
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) return "this_week";
  if (ageMs <= 365 * 24 * 60 * 60 * 1000) return "this_year";
  return "older";
}

export function normalizeResearchFreshness(freshness, publishDate) {
  const value = String(freshness || "").trim().toLowerCase();
  if (["today", "this_week", "this_year", "older", "unknown"].includes(value)) return value;
  if (value === "recent" || value === "current_year") return "this_year";
  if (publishDate) return summarizeFreshness(publishDate);
  return summarizeFreshness(freshness);
}

export function isRecentResearchFreshness(freshness, publishDate) {
  return ["today", "this_week", "this_year"].includes(normalizeResearchFreshness(freshness, publishDate));
}

export function buildWebResearchGuidance() {
  return "Use emet for current facts, docs, best practices, comparisons, and citations. Search if unsure.";
}

export function defaultMode(query) {
  const intent = classifyQueryIntent(query);
  if (intent === "comparison" || intent === "comparative") return "deep";
  if (intent === "academic") return "academic";
  return "fast";
}

export function classifyQueryIntent(query) {
  const text = String(query || "").toLowerCase();
  const versionContext = extractVersionContext(query);
  if (/\b(vs\.?|versus|gegenüber|compared to)\b/i.test(query)) return "comparison";
  if (versionContext.explicitVersion || versionContext.deprecatedIntent || versionContext.removedIntent || versionContext.migrationIntent || versionContext.breakingChangeIntent) return "versioned";
  if (/\b(aktuell|aktueller|current|status|latest|neueste|heute|202\d)\b/i.test(query)) return "temporal";
  if (/\b(best practices?|bester weg|beste methode|recommended|empfohlen|guide)\b/i.test(query)) return "best_practice";
  if (/\b(best|besser|beste|compare|vergleich|alternative|alternativen)\b/i.test(query)) return "comparative";
  if (/^\s*(was ist|what is|wer ist|who is)\b/i.test(query)) return "definition";
  if (/\b(paper|papers|study|studies|arxiv|doi|publication|research)\b/i.test(text)) return "academic";
  return "general";
}

export function inferOfficialDocsSite(query) {
  const lower = String(query || "").toLowerCase();
  if (lower.includes("playwright")) return "playwright.dev/docs";
  if (lower.includes("react")) return "react.dev";
  if (lower.includes("node")) return "nodejs.org/api";
  if (lower.includes("selenium")) return "selenium.dev/documentation";
  if (lower.includes("pandas")) return "pandas.pydata.org";
  if (lower.includes("polars")) return "docs.pola.rs";
  return null;
}

function academicHints(query) {
  const lower = String(query || "").toLowerCase();
  const hints = [];
  if (lower.includes("transformer") || lower.includes("attention")) hints.push("Attention is All You Need arxiv", "transformer self-attention original paper arxiv");
  if (lower.includes("rag") || lower.includes("retrieval augmented")) hints.push("retrieval augmented generation arxiv", "rag paper arxiv");
  return [...new Set(hints)];
}

export function buildFastQueries(query, limit = 2) {
  const trimmed = String(query || "").trim();
  const year = new Date().getFullYear();
  const intent = classifyQueryIntent(trimmed);
  const versionContext = extractVersionContext(trimmed);
  let queries;

  if (intent === "definition") {
    queries = [cleanDefinitionQuery(trimmed) || trimmed];
  } else if (intent === "comparison") {
    const compact = trimmed.replace(/\bvs\.?\b/i, "vs").replace(/[?!.]+$/g, "").trim();
    const entities = compact.replace(/\bvs\b/i, " ").replace(/\s+/g, " ").trim();
    queries = [`${compact} comparison`, entities];
  } else if (intent === "versioned") {
    const withoutPunctuation = trimmed.replace(/[?!.]+$/g, "");
    queries = [
      withoutPunctuation,
      versionContext.prefersBreakingChanges ? `${withoutPunctuation} breaking changes` : null,
      versionContext.prefersChangelog ? `${withoutPunctuation} changelog` : null,
      versionContext.prefersChangelog ? `${withoutPunctuation} release notes` : null,
      versionContext.prefersMigrationGuide ? `${withoutPunctuation} migration guide` : null,
      `${withoutPunctuation} official docs`,
    ];
  } else if (intent === "temporal") {
    const withoutPunctuation = trimmed.replace(/[?!.]+$/g, "");
    queries = [`${withoutPunctuation} ${year}`, `${withoutPunctuation} official ${year}`];
  } else if (intent === "academic") {
    queries = [`${trimmed} site:arxiv.org`, `${trimmed} site:semanticscholar.org`, ...academicHints(trimmed)];
  } else if (intent === "best_practice" || intent === "comparative") {
    queries = [trimmed, `${trimmed} official docs`];
  } else {
    queries = [trimmed, `${trimmed} overview`];
  }

  return [...new Set(queries.map((item) => item?.trim()).filter(Boolean))].slice(0, limit);
}

export function buildDeepQueries(query, limit = 4) {
  const base = queryBase(query);
  const intent = classifyQueryIntent(base);
  const docsSite = inferOfficialDocsSite(base);
  const versionContext = extractVersionContext(base);
  const queries = [base];

  if (intent === "comparison") {
    const parts = splitComparisonQuery(base);
    if (parts) {
      queries.push(`${parts[0]} ${parts[1]} official docs`);
      queries.push(`${parts[0]} ${parts[1]} benchmark`);
      queries.push(`${parts[0]} ${parts[1]} GitHub README filetype:md`);
    }
  } else if (intent === "academic") {
    queries.push(...academicHints(base));
    queries.push(`${base} site:arxiv.org`);
    queries.push(`${base} site:semanticscholar.org`);
    queries.push(`${base} site:doi.org`);
  } else if (intent === "versioned") {
    queries.push(`${base} official docs`);
    queries.push(`${base} api versions`);
    queries.push(versionContext.prefersBreakingChanges ? `${base} breaking changes` : null);
    queries.push(versionContext.prefersChangelog ? `${base} changelog` : null);
    queries.push(versionContext.prefersChangelog ? `${base} release notes` : null);
    queries.push(versionContext.prefersMigrationGuide ? `${base} migration guide` : null);
    queries.push(docsSite ? `${base} site:${docsSite}` : `${base} documentation`);
  } else if (intent === "temporal") {
    const year = new Date().getFullYear();
    queries.push(`${base} official ${year}`);
    queries.push(`${base} docs ${year}`);
    queries.push(`${base} GitHub README filetype:md`);
  } else {
    queries.push(`${base} official docs`);
    queries.push(docsSite ? `${base} site:${docsSite}` : `${base} documentation`);
    queries.push(`${base} GitHub README filetype:md`);
  }

  return [...new Set(queries.filter(Boolean))].slice(0, limit);
}

export function parseDeepQueryPlan(text, query, limit = 4) {
  try {
    const trimmed = String(text || "").trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    const parsed = JSON.parse(candidate);
    if (parsed && Array.isArray(parsed.queries)) {
      const queries = parsed.queries.map((item) => String(item).trim()).filter(Boolean);
      if (queries.length) return [...new Set(queries)].slice(0, limit);
    }
  } catch {
    // fall through
  }
  return buildDeepQueries(query, limit);
}

export function buildJinaReaderUrl(url) {
  return `https://r.jina.ai/${url}`;
}

export function buildFallbackQueries(query) {
  const variants = [query, `${query} overview`];
  if (/best practices/i.test(query)) variants.push(`${query} guide`);
  else variants.push(`${query} best practices`);
  return [...new Set(variants)];
}

export function extractDuckDuckGoResults(html) {
  const matches = String(html || "").matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g);
  const results = [];

  for (const match of matches) {
    const nearby = String(html || "").slice(match.index, match.index + 3000);
    const snippetMatch = nearby.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    results.push({
      title: stripTags(match[2]),
      url: decodeDuckDuckGoUrl(decodeHtmlEntities(match[1])),
      snippet: snippetMatch ? stripTags(snippetMatch[1]) : "",
    });
  }

  return results;
}

export function extractDuckDuckGoLiteResults(html) {
  const matches = String(html || "").matchAll(/<a\b([^>]*class=["']result-link["'][^>]*)>([\s\S]*?)<\/a>|<a\b([^>]*class=[^>]*result-link[^>]*)>([\s\S]*?)<\/a>/g);
  const results = [];

  for (const match of matches) {
    const attrs = match[1] || match[3] || "";
    const titleHtml = match[2] || match[4] || "";
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const nearby = String(html || "").slice(match.index, match.index + 1200);
    const snippetMatch = nearby.match(/class=["']result-snippet["'][^>]*>([\s\S]*?)<\/td>/);
    results.push({
      title: stripTags(titleHtml),
      url: decodeDuckDuckGoUrl(decodeHtmlEntities(hrefMatch[1])),
      snippet: snippetMatch ? stripTags(snippetMatch[1]) : "",
    });
  }

  return results;
}

export function extractJinaSearchResults(markdown) {
  const matches = String(markdown || "").matchAll(/^## \[([^\]]+)\]\(([^)]+)\)\s*\n([^#\n][^\n]*)?/gm);
  const results = [];

  for (const match of matches) {
    const url = decodeDuckDuckGoUrl(decodeHtmlEntities(match[2]));
    results.push({
      title: decodeHtmlEntities(match[1]).trim(),
      url,
      snippet: decodeHtmlEntities(match[3] || "").trim(),
    });
  }

  return results;
}

export function extractPublishDate(html) {
  const match = String(html || "").match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished|publish-date)["'][^>]+content=["']([^"']+)/i);
  if (!match) return null;
  const value = match[1].slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function selectRelevantChunks(text, query, limit = 3) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => ({ chunk, score: countTermMatches(chunk, queryTerms(query)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
}

export function isNewsSourceUrl(url = "", title = "") {
  const lower = String(url || "").toLowerCase();
  const lowerTitle = String(title || "").toLowerCase();
  if (!lower) return false;
  if (/blog\.|medium\.com|dev\.to|substack\.com/.test(lower)) return false;
  if (/\/docs?\b|documentation|developer|reference|official/.test(lower) || /official|documentation|reference|guide/i.test(lowerTitle)) return false;
  if (/reuters\.com|apnews\.com|bloomberg\.com|wsj\.com|nytimes\.com|ft\.com|theverge\.com|techcrunch\.com|wired\.com|axios\.com|404media\.co/.test(lower)) return true;
  return /(^|\.)news\./.test(lower) || /\/news(?:\/|$)|\/article(?:s)?(?:\/|$)|press-release|\/press(?:\/|$)/.test(lower) || /\bnews\b|press release/.test(lowerTitle);
}

export function classifySourceType(url, title = "") {
  const lower = String(url || "").toLowerCase();
  if (lower.startsWith("file://")) return "file";
  if (/github\.com\/[^/]+\/[^/]+#readme|github\.com\/[^/]+\/[^/]+\/blob\//.test(lower)) return "github_readme";
  if (/github\.com\/[^/]+\/[^/]+/.test(lower)) return "github_repo";
  if (/arxiv\.org|ieee\.org|springer\.com|pubmed\.ncbi\.nlm\.nih\.gov|doi\.org|semanticscholar\.org|acm\.org|nature\.com|science\.org/.test(lower)) return "paper";
  if (/research\.ibm\.com|research\.google/.test(lower)) return "official_doc";
  if (/reddit\.com|stackoverflow\.com|forum/.test(lower)) return "forum";
  if (/blog\.|medium\.com|dev\.to|substack\.com/.test(lower)) return "blog";
  if (isNewsSourceUrl(url, title)) return "news";
  if (/\/docs?\b|documentation|developer|reference|official/.test(lower) || /official|documentation|reference|guide/i.test(title) || /\.edu\/|\.ac\.uk\//.test(lower)) return "official_doc";
  return "other";
}

export function isAuthoritativeUrl(url) {
  const lower = String(url || "").toLowerCase();
  return /\/docs?\b|documentation|developer|reference|official|github\.com\/[^/]+\/[^/]+(#readme|\/tree\/[^/]+\/docs)?|npmjs\.com\/package\/|arxiv\.org|pubmed\.ncbi\.nlm\.nih\.gov|semanticscholar\.org|doi\.org|research\.ibm\.com|research\.google|\.edu\/|\.ac\.uk\//.test(lower);
}

export function isAuthoritativeResearchSource(source = {}) {
  return Boolean(source.authoritative) || ["official_doc", "github_readme", "github_repo", "paper"].includes(source.sourceType);
}

export function sourceMetaFromSources(sources = []) {
  const normalizedSources = Array.isArray(sources) ? sources : [];
  const firstSource = normalizedSources.find(Boolean) || {};
  const overlays = [...new Set(normalizedSources.flatMap((source) => Array.isArray(source?.overlays) ? source.overlays : []))];
  const sourcePolicyFlags = [...new Set(normalizedSources.flatMap((source) => {
    if (Array.isArray(source?.source_policy_flags)) return source.source_policy_flags;
    if (Array.isArray(source?.sourcePolicyFlags)) return source.sourcePolicyFlags;
    return [];
  }))];
  const authoritativeCount = normalizedSources.filter(isAuthoritativeResearchSource).length;
  const recentCount = normalizedSources.filter((source) => isRecentResearchFreshness(source.freshness, source.publishDate)).length;
  const overlayPolicyFlags = sourcePolicyFlagsFromOverlays(overlays);
  return {
    has_authority: authoritativeCount > 0,
    has_forum: normalizedSources.some((source) => source.sourceType === "forum" || /forum|reddit|stack/i.test(source.url || "")),
    has_news: normalizedSources.some((source) => source.sourceType === "news" || isNewsSourceUrl(source.url, source.title)),
    has_recent: recentCount > 0,
    has_version_match: normalizedSources.some((source) => source?.versionSignals?.exactVersionMatch || source?.versionSignals?.partialVersionMatch),
    has_changelog: normalizedSources.some((source) => ["changelog", "release_notes", "breaking_changes"].includes(source?.versionSignals?.pageKind)),
    has_migration: normalizedSources.some((source) => source?.versionSignals?.pageKind === "migration_guide"),
    domain_family: firstSource.domain_family || firstSource.domainFamily || "web",
    overlays,
    source_policy_flags: sourcePolicyFlags,
    has_official_only: sourcePolicyFlags.includes("official-only") || overlayPolicyFlags.includes("official-only"),
    has_primary_source_required: sourcePolicyFlags.includes("primary-source-required") || overlayPolicyFlags.includes("primary-source-required"),
    has_recency_required: sourcePolicyFlags.includes("recency-required") || overlayPolicyFlags.includes("recency-required"),
    has_version_sensitive: sourcePolicyFlags.includes("version-sensitive") || overlayPolicyFlags.includes("version-sensitive"),
    authoritative_source_count: authoritativeCount,
    recent_source_count: recentCount,
    source_count: normalizedSources.length,
  };
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

function isVolatileQuery(query) {
  return /\b(npm|package|deprecated|deprecation|support|supported|status|latest|current|compatibility|compatible|version|release)\b/i.test(query);
}

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

export function detectClaimConflicts(claims = []) {
  const texts = claims.map((claim) => String(claim?.text || claim || "").toLowerCase());
  const hasPositive = texts.some((text) => /\b(supported|works|available|recommended|yes|stable|compatible)\b/.test(text));
  const hasNegative = texts.some((text) => /\b(not supported|unsupported|does not|no support|broken|incompatible|removed)\b/.test(text));
  return {
    detected: hasPositive && hasNegative,
    conflictSummary: hasPositive && hasNegative ? "Claims conflict." : "",
  };
}

export function detectCoverageGaps(input = {}) {
  const claims = Array.isArray(input.claims) ? input.claims : [];
  const authoritativeSourcesFound = claims.some((claim) => Array.isArray(claim?.evidence) && claim.evidence.length > 0);
  return {
    detected: !authoritativeSourcesFound,
    missingAspects: authoritativeSourcesFound ? [] : ["authoritative sources"],
  };
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
  const domains = new Set(entries.map((item) => item.domain).filter(Boolean));
  if (domains.size < 2) return { detected: false, reason: null, conflictSummary: "", conflictingSourcePairs: [] };

  const positivePages = entries.filter(({ page }) => positivePattern.test(page.text || ""));
  const negativePages = entries.filter(({ page }) => negativePattern.test(page.text || ""));
  const pair = positivePages.find((pos) => negativePages.some((neg) => neg.domain !== pos.domain || neg.index !== pos.index));
  const opposite = pair && negativePages.find((neg) => neg.domain !== pair.domain || neg.index !== pair.index);

  if (pair && opposite) {
    return {
      detected: true,
      reason: "Some retrieved pages contain opposing support or recommendation claims.",
      conflictSummary: `Sources disagree on ${pages[0]?.title || "the topic"}.`,
      conflictingSourcePairs: [[pair.index, opposite.index]],
    };
  }

  return { detected: false, reason: null, conflictSummary: "", conflictingSourcePairs: [] };
}

export function detectResearchGaps(query, pages, options = {}) {
  const hasAuthoritativeSource = pages.some((page) => {
    const scored = scoreSourceEntry(page, query || "");
    return Boolean(page.authoritative || scored.authoritative);
  });
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
    pages.some((page) => {
      const scored = scoreSourceEntry(page, "");
      return Boolean(page.authoritative || scored.authoritative);
    })
      ? "Authoritative docs, papers, or README sources were found."
      : "No authoritative docs, papers, or README source was found.",
  ];

  if (meta.followupRounds > 0) lines.push(`One follow-up round was used to resolve uncertainty.`);
  lines.push(meta.conflictDetected ? "Conflict scan found opposing claims in the retrieved pages." : "No clear source conflicts detected in the retrieved pages.");
  return lines.join("\n");
}

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

function trimCodeBlock(block, maxLines = 20) {
  const lines = String(block || "").split("\n").slice(0, maxLines);
  return lines.join("\n").trim();
}

export function extractCodeBlocks(text) {
  const value = String(text || "");
  const blocks = [];
  for (const match of value.matchAll(/```[a-z0-9_-]*\n([\s\S]*?)```/gi)) blocks.push(match[1].trim());
  for (const match of value.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)) blocks.push(stripTags(match[1]));
  for (const match of value.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/gi)) blocks.push(stripTags(match[1]));
  return [...new Set(blocks.map((block) => trimCodeBlock(block)).filter(Boolean))];
}

export function evaluateSufficiency(input, legacyPages, legacyConflictDetected = false) {
  const payload = typeof input === "string"
    ? { query: input, sources: legacyPages || [], conflictDetected: legacyConflictDetected }
    : { query: input?.query || "", sources: input?.sources || [], claims: input?.claims || [], conflictDetected: Boolean(input?.conflictDetected), confidence: input?.confidence, minSources: input?.minSources };

  const scoredSources = payload.sources.map((page) => scoreSourceEntry(page, payload.query || ""));
  const authoritativeCount = scoredSources.filter((scored) => Boolean(scored.authoritative)).length;
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

export function compactResearchPayload(payload) {
  return {
    answer: payload.answer,
    bullets: Array.isArray(payload.bullets) ? payload.bullets.slice(0, 5) : [],
    confidence: typeof payload.confidence === "number" ? payload.confidence : "",
    citations: Array.isArray(payload.citations) ? payload.citations.slice(0, 8) : [],
    codeBlocks: Array.isArray(payload.codeBlocks) ? payload.codeBlocks.slice(0, 3).map((block) => trimCodeBlock(block)) : [],
    sources: Array.isArray(payload.sources)
      ? payload.sources.slice(0, 5).map((source) => ({
          title: source.title,
          url: source.url,
          ...(source.freshness ? { freshness: source.freshness } : {}),
          ...(source.sourceType ? { sourceType: source.sourceType } : {}),
          ...(typeof source.score === "number" ? { score: source.score } : {}),
          ...(typeof source.authoritative === "boolean" ? { authoritative: source.authoritative } : {}),
          ...(typeof source.local === "boolean" ? { local: source.local } : {}),
        }))
      : [],
    claims: Array.isArray(payload.claims) ? payload.claims.slice(0, 8).map((claim) => ({
      text: claim.text,
      confidence: claim.confidence,
      evidence: Array.isArray(claim.evidence) ? claim.evidence.slice(0, 5).map((evidence) => ({
        type: evidence.type,
        source: evidence.source,
        snippet: evidence.snippet,
      })) : [],
    })) : [],
    evidenceSummary: payload.evidenceSummary || "",
    sourceTypes: Array.isArray(payload.sourceTypes) ? payload.sourceTypes.slice(0, 8) : [],
    unverifiedClaims: Array.isArray(payload.unverifiedClaims) ? payload.unverifiedClaims.slice(0, 8) : [],
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : undefined,
    sufficient: Boolean(payload.sufficient),
    authoritativeSourcesFound: Boolean(payload.authoritativeSourcesFound),
    openSubQuestions: Array.isArray(payload.openSubQuestions) ? payload.openSubQuestions.slice(0, 5) : [],
    missingAspects: Array.isArray(payload.missingAspects) ? payload.missingAspects.slice(0, 5) : [],
    conflictSummary: payload.conflictSummary || "",
  };
}

export function extractPageSnapshot(html, url) {
  const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : url;
  const body = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  return { title, url, text: stripTags(body), codeBlocks: extractCodeBlocks(html) };
}

export function formatResearchResponse({ answer, bullets, sources, confidence, format = "markdown" }) {
  const list = Array.isArray(sources) ? sources : [];
  if (format === "json") {
    return JSON.stringify({ answer: String(answer || "").trim(), bullets: bullets || [], confidence: confidence || "", sources: list });
  }
  if (format === "table") {
    const rows = list.map((source, index) => `| ${index + 1} | ${source.title} | ${source.url} |`).join("\n");
    return ["| # | Title | URL |", "|---|---|---|", rows].filter(Boolean).join("\n").trim();
  }
  const parts = ["## Answer", "", String(answer || "").trim(), "", "## Key points"];
  for (const bullet of bullets || []) parts.push(`- ${bullet}`);
  if (confidence) parts.push("", "## Confidence", "", confidence);
  parts.push("", "## Sources");
  list.forEach((source, index) => {
    const freshness = source.freshness ? ` (${source.freshness})` : "";
    const meta = [];
    if (source.sourceType) meta.push(source.sourceType);
    if (typeof source.score === "number") meta.push(`score:${source.score}`);
    if (typeof source.authoritative === "boolean") meta.push(source.authoritative ? "authoritative" : "non-authoritative");
    const metaText = meta.length ? ` [${meta.join(", ")}]` : "";
    parts.push(`${index + 1}. ${source.title} — ${source.url}${metaText}${freshness}`);
  });
  return parts.join("\n").trim();
}
