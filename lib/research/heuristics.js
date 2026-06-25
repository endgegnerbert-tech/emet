// Heuristic helpers — query building, source classification, URL helpers,
// extraction (DDG, Jina), formatting, compact payload.
// Layer: base — no fetch, no filesystem, no process.env.

import { PLACEHOLDER_PATTERNS } from "../research-policy.js";
import {
  sourcePolicyFlagsFromOverlays,
} from "../router-policy-context.js";
import {
  extractVersionContext,
  scoreVersionMatch,
} from "../version-context.js";

// --- structured source parsing (rescued from router-structured-features) ---

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

// --- URL / hostname helpers ---

export function normalizeUrl(url) {
  const parsed = new URL(url);
  parsed.hash = "";
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

export function hostnameFromUrl(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isDocsLike(url = "") {
  const lower = String(url || "").toLowerCase();
  return /\/docs?\b|documentation|developer|reference|official/.test(lower);
}

export function isSecondaryDocsHost(hostname = "") {
  return /(^|\.)(deepwiki\.com|sureprompts\.com|mcpservers\.com|cursorcommunity\.com|deepwiki\.org)$/.test(hostname);
}

export function isLikelyOfficialDocsHost(hostname = "") {
  return /^(docs|developer|developers|platform|api|help|support|learn|reference)\./.test(hostname)
    || /(^|\.)(gov|edu)$/.test(hostname)
    || /\.ac\.uk$/.test(hostname);
}

// --- source type classification ---

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
  const hostname = hostnameFromUrl(url);
  if (lower.startsWith("file://")) return "file";
  if (/github\.com\/[^/]+\/[^/]+#readme|github\.com\/[^/]+\/[^/]+\/blob\//.test(lower)) return "github_readme";
  if (/github\.com\/[^/]+\/[^/]+/.test(lower)) return "github_repo";
  if (/arxiv\.org|ieee\.org|springer\.com|pubmed\.ncbi\.nlm\.nih\.gov|doi\.org|semanticscholar\.org|acm\.org|nature\.com|science\.org/.test(lower)) return "paper";
  if (/research\.ibm\.com|research\.google/.test(lower)) return "official_doc";
  if (/reddit\.com|stackoverflow\.com|forum/.test(lower)) return "forum";
  if (/blog\.|medium\.com|dev\.to|substack\.com/.test(lower)) return "blog";
  if (isNewsSourceUrl(url, title)) return "news";
  if (isSecondaryDocsHost(hostname)) return "other";
  if (isLikelyOfficialDocsHost(hostname) && isDocsLike(url)) return "official_doc";
  if ((/\.edu\/|\.ac\.uk\//.test(lower) || /(^|\.)(gov|edu)$/.test(hostname) || /\.ac\.uk$/.test(hostname)) && !isSecondaryDocsHost(hostname)) return "official_doc";
  if (isDocsLike(url) && !isSecondaryDocsHost(hostname) && !/community|forum|mirror|aggregator/.test(hostname)) return "official_doc";
  return "other";
}

export function isAuthoritativeUrl(url) {
  const lower = String(url || "").toLowerCase();
  const hostname = hostnameFromUrl(url);
  if (!lower || isSecondaryDocsHost(hostname)) return false;
  if (/github\.com\/[^/]+\/[^/]+(#readme|\/tree\/[^/]+\/docs|\/blob\/)/.test(lower)) return true;
  if (/github\.com\/[^/]+\/[^/]+$/.test(lower)) return true;
  if (/npmjs\.com\/package\/|arxiv\.org|pubmed\.ncbi\.nlm\.nih\.gov|semanticscholar\.org|doi\.org|research\.ibm\.com|research\.google/.test(lower)) return true;
  if (isLikelyOfficialDocsHost(hostname) && isDocsLike(url)) return true;
  if (/(^|\.)(gov|edu)$/.test(hostname) || /\.ac\.uk$/.test(hostname)) return true;
  return false;
}

// --- query helpers ---

export function queryTerms(query) {
  return String(query || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !["was", "ist", "the", "and", "oder", "und", "for", "von", "der", "die", "das"].includes(term));
}

export function queryBase(query) {
  return String(query || "")
    .trim()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ");
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

function splitComparisonQuery(query) {
  const parts = String(query || "").split(/\bvs\.?\b|\bversus\b|\bgegenüber\b|\bcompared to\b/i).map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 2) : null;
}

// --- freshness helpers ---

export function normalizeResearchFreshness(freshness, publishDate) {
  const value = String(freshness || "").trim().toLowerCase();
  if (["today", "this_week", "this_year", "older", "unknown"].includes(value)) return value;
  if (value === "recent" || value === "current_year") return "this_year";
  if (publishDate) return summarizeFreshness(publishDate);
  return summarizeFreshness(freshness);
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

// --- intent detection ---

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

export function defaultMode(query) {
  const intent = classifyQueryIntent(query);
  if (intent === "comparison" || intent === "comparative") return "deep";
  if (intent === "academic") return "academic";
  return "fast";
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

// --- query building ---

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

// --- DDG / Jina extraction ---

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeDuckDuckGoUrl(href) {
  const normalized = href.startsWith("//") ? `https:${href}` : href;
  const url = new URL(normalized);
  const target = url.searchParams.get("uddg");
  return target ? decodeURIComponent(target) : normalized;
}

function stripTags(html) {
  return String(html || "").replace(/<[^>]*>/g, "").trim();
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

export function extractLastModified(html, headerValue = "") {
  const metaMatch = String(html || "").match(/<meta[^>]+(?:property|name)=["'](?:article:modified_time|dateModified|last-modified)["'][^>]+content=["']([^"']+)/i);
  const candidate = metaMatch?.[1] || headerValue || "";
  const value = String(candidate).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function selectRelevantChunks(text, query, limit = 3) {
  if (typeof countTermMatches !== "function") {
    // inline version — used before full migration
    const terms = queryTerms(query);
    const countFn = (t) => terms.filter((term) => t.toLowerCase().includes(term)).length;
    return String(text || "")
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => ({ chunk, score: countFn(chunk) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.chunk);
  }
  return [];
}

// --- code extraction ---

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

// --- page snapshot (extraction) ---
// ponytail: extracted from research.js — imports extractArticle, extractBasicArticle from article-extractor

// --- compact payload ---

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
          ...(source.publishDate ? { publishDate: source.publishDate } : {}),
          ...(source.lastModified ? { lastModified: source.lastModified } : {}),
          ...(source.createdAt ? { createdAt: source.createdAt } : {}),
          ...(source.updatedAt ? { updatedAt: source.updatedAt } : {}),
          ...(source.sourceType ? { sourceType: source.sourceType } : {}),
          ...(typeof source.score === "number" ? { score: source.score } : {}),
          ...(typeof source.rankScore === "number" ? { rankScore: source.rankScore } : {}),
          ...(typeof source.authorityScore === "number" ? { authorityScore: source.authorityScore } : {}),
          ...(typeof source.qualityScore === "number" ? { qualityScore: source.qualityScore } : {}),
          ...(typeof source.versionMatchScore === "number" ? { versionMatchScore: source.versionMatchScore } : {}),
          ...(typeof source.engagementScore === "number" ? { engagementScore: source.engagementScore } : {}),
          ...(typeof source.authoritative === "boolean" ? { authoritative: source.authoritative } : {}),
          ...(source.signals ? { signals: source.signals } : {}),
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

// --- format ---

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

// --- helpers used internally ---

function isRecentResearchFreshness(freshness, publishDate) {
  return ["today", "this_week", "this_year"].includes(normalizeResearchFreshness(freshness, publishDate));
}

export function isAuthoritativeResearchSource(source = {}) {
  return Boolean(source.authoritative) || ["official_doc", "github_readme", "github_repo", "paper"].includes(source.sourceType);
}

export function buildWebResearchGuidance() {
  return "Use emet for current facts, docs, best practices, comparisons, and citations. Search if unsure.";
}
