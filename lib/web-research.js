import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { complete } from "@mariozechner/pi-ai";

import profiles from "./research-profiles.json" with { type: "json" };
import { createResearchResult } from "./types.js";
import { resolveDomainConfig, resolveDomainSelection } from "./domains/index.js";
import { classifyQuestionDomain } from "./research-intent.js";
import {
  buildConfidenceSummary,
  buildDeepQueries,
  buildFallbackQueries,
  buildFastQueries,
  buildFollowUpQuery,
  buildActionBasedFollowUpQuery,
  buildJinaReaderUrl,
  classifySourceType,
  compactResearchPayload,
  defaultMode,
  normalizePaperTitle,
  detectConflictSignals,
  evaluateSufficiency,
  extractCodeBlocks,
  extractDuckDuckGoLiteResults,
  extractDuckDuckGoResults,
  extractJinaSearchResults,
  extractPageSnapshot,
  extractPublishDate,
  factCheckAnswer,
  formatResearchResponse,
  normalizeUrl,
  parseDeepQueryPlan,
  prioritizeSourceEntries,
  rankFetchedPages,
  rankSearchResults,
  scoreSourceEntry,
  selectRelevantChunks,
  normalizeResearchFreshness,
  sourceMetaFromSources,
} from "./research.js";
import { pageFetchAdapter } from "./page-fetch-adapter.js";
import { extractPdfText, isPdfUrl } from "./pdf-extractor.js";
import { resolveQueryUnderstandingPlanning } from "./query-understanding.js";
import { isUsableContent, pageQualitySignals } from "./research-policy.js";
import {
  applyGuardrailsToResearchConfig,
  buildResearchGuardrails,
  resolveGuardrailedMinSources,
  snapshotGuardrails,
} from "./research-guardrails.js";
import { resolveOutputFormat, shouldRequireAuthoritativeSources } from "./research-output.js";
import { planResearch } from "./planner.js";
import {
  clearResearchMemory,
  getResearchMemory,
  hashResearchQuery,
  modeCacheKey,
  topicCacheKey,
  readCachedResult,
  setResearchMemory,
  writeCachedResult,
  writeDevCacheResult,
} from "./research-memory.js";
import { logResearchEvent } from "./local-logger.js";
import {
  extractSufficiencyStructuredFeaturesFromPages,
} from "./router-structured-features.js";
import { extractVersionContext, summarizeVersionCoverage } from "./version-context.js";
import {
  annotateVersionSignals,
  buildTraceSourceSummary,
  hashText,
  jsonSnapshot,
  snapshotPageForTrace,
  snapshotSearchResult,
} from "./research-trace.js";
import { buildEvidenceState, buildTurnEvidenceState } from "./research-evidence.js";
import {
  applyResearchPolicyControls,
  buildPolicyFollowUpQuery,
  decideResearchPolicyAction,
  summarizeResearchPolicyDecision,
} from "./research-next-action-policy.js";

const tinyRouterSetupLogged = new Set();

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
];

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const DOMAIN_TIMEOUTS = new Map([
  ["arxiv.org", 15_000],
  ["github.com", 5_000],
]);

function resolvePageTimeout(url, configTimeout) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [domain, ms] of DOMAIN_TIMEOUTS) {
      if (host === domain || host.endsWith("." + domain)) return ms;
    }
  } catch {
    // invalid URL
  }
  return configTimeout;
}

const MIN_PAGE_TEXT = 300;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const PAGE_CACHE_TTL_MS = 30 * 60 * 1000;
const EXPENSIVE_PAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SEARCH_CACHE = 200;
const MAX_PAGE_CACHE = 100;
const searchCache = new Map();
const pageCache = new Map();

function getCacheValue(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCacheValue(cache, key, value, ttlMs) {
  const limit = cache === pageCache ? MAX_PAGE_CACHE : MAX_SEARCH_CACHE;
  if (cache.size >= limit) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function pageCacheTtl(page) {
  return page?.expensive ? EXPENSIVE_PAGE_CACHE_TTL_MS : PAGE_CACHE_TTL_MS;
}

function normalizeResearchOptions(input = "fast") {
  if (typeof input === "string") return { mode: input };
  if (input && typeof input === "object") return input;
  return { mode: "fast" };
}

export function resolveResearchConfig(input = "fast") {
  const options = normalizeResearchOptions(input);
  const base = profiles[options.mode] || profiles.fast;
  const deep = options.deepResearchConfig || {};
  const domainConfig = resolveDomainConfig(options.domain || options.domainHint || options.familyHint || options.overlays || options.sourcePolicy
    ? options
    : "web");

  return {
    ...base,
    ...domainConfig,
    ...options,
    mode: base.mode,
    maxTurns: options.maxTurns ?? (deep.depth ? Math.max(base.maxTurns || 1, deep.depth) : (base.maxTurns || 1)),
    maxQueries: options.maxQueries ?? (deep.breadth ? Math.max(base.maxQueries || 2, deep.breadth * (deep.depth || 1)) : (base.maxQueries || 2)),
    maxPages: options.maxSites ?? options.maxPages ?? base.maxPages,
    allowedSourceTypes: options.allowedSourceTypes ?? (Array.isArray(domainConfig.allowedSourceTypes) && domainConfig.allowedSourceTypes.length ? domainConfig.allowedSourceTypes : base.allowedSourceTypes),
    allowedSources: options.allowedSources ?? (Array.isArray(domainConfig.allowedSources) && domainConfig.allowedSources.length ? domainConfig.allowedSources : base.allowedSources),
    searchProvider: options.searchProvider ?? base.searchProvider,
    concurrentQueries: deep.concurrency ?? options.concurrentQueries ?? 3,
    depth: deep.depth ?? 1,
    breadth: deep.breadth ?? 2,
    pageTextLimit: options.pageTextLimit ?? base.pageTextLimit,
    minPageText: options.minPageText ?? base.minPageText ?? MIN_PAGE_TEXT,
    preferRecent: options.preferRecent ?? domainConfig.preferRecent ?? base.preferRecent ?? false,
    minYear: options.minYear ?? base.minYear,
    maxYear: options.maxYear ?? base.maxYear,
    cacheTtlMs: options.cacheTtlMs ?? base.cacheTtlMs ?? 24 * 60 * 60 * 1000,
    files: Array.isArray(options.files) ? options.files : [],
    isolate: Boolean(options.isolate || process.env.RESEARCH_ISOLATE === "1"),
    force: Boolean(options.force),
    format: resolveOutputFormat(options, domainConfig.format || "markdown"),
    queryHints: Array.isArray(domainConfig.queryHints) ? domainConfig.queryHints : [],
    requireAuthoritative: Boolean(options.requireAuthoritative ?? (domainConfig.requireAuthoritative || domainConfig.domain === "github")),
    domain: domainConfig.domain,
    domainFamily: domainConfig.domainFamily,
    overlays: domainConfig.overlays,
    sourcePolicy: domainConfig.sourcePolicy,
  };
}

export function getResearchConfig(mode = "fast") {
  return resolveResearchConfig(mode);
}

export function resolveResearchModel(ctx) {
  return process.env.WEB_RESEARCH_MODEL || ctx?.model || null;
}

function textFromCompletion(response) {
  return response.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
}

function parseJsonBlock(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

async function completeWithResearchModel(ctx, signal, prompt, reasoningEffort = "low") {
  if (typeof ctx?.completeResearch === "function") {
    return ctx.completeResearch(prompt, { signal, reasoningEffort });
  }

  const model = resolveResearchModel(ctx);
  if (!model) return null;

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) return null;

  const response = await complete(model, {
    messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
  }, {
    apiKey: auth.apiKey,
    headers: auth.headers,
    signal,
    reasoningEffort,
  });

  if (response.stopReason === "aborted") return null;
  return textFromCompletion(response);
}

export async function buildQueries(query, mode = "fast", ctx, signal) {
  const config = getResearchConfig(mode);
  const hintedQueries = Array.isArray(config.queryHints) && config.queryHints.length
    ? config.queryHints.map((hint) => `${query} ${hint}`)
    : [];

  if (config.mode === "code") {
    return [...new Set([...planResearch(query, "code").subqueries, ...hintedQueries])].slice(0, config.maxQueries);
  }
  if (config.mode === "deep" || config.mode === "academic") {
    const prompt = [
      "Generate web research search queries as JSON only.",
      'Return shape: {"queries":["..."]}',
      config.mode === "academic"
        ? "Use 3-5 focused paper-search queries covering arXiv, DOI, Semantic Scholar, benchmarks, and official references."
        : "Use 3-5 focused queries covering official docs, examples, source/readme, and recent status when relevant.",
      `Question: ${query}`,
    ].join("\n");

    try {
      const text = await completeWithResearchModel(ctx, signal, prompt, "low");
      if (text) return [...new Set([...parseDeepQueryPlan(text, query, config.maxQueries), ...hintedQueries])].slice(0, config.maxQueries);
    } catch {
      // fall through
    }

    return [...new Set([...buildDeepQueries(query, config.maxQueries), ...hintedQueries])].slice(0, config.maxQueries);
  }

  return [...new Set([...buildFastQueries(query, config.maxQueries), ...hintedQueries])].slice(0, config.maxQueries);
}

function withTimeoutSignal(signal, timeoutMs) {
  if (!timeoutMs) return signal;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function isTransientStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isRetryableFetchError(error) {
  if (!error) return false;
  if (error.name === "TimeoutError") return true;
  if (error.name === "HttpFetchError") return Boolean(error.transient);
  return error.name === "TypeError" || /fetch failed|network/i.test(String(error.message || ""));
}

function fetchFailureReason(errorOrStatus, contentType = "") {
  const status = typeof errorOrStatus === "number" ? errorOrStatus : Number(errorOrStatus?.statusCode || errorOrStatus?.status || 0);
  if (status === 403) return "http_403";
  if (status === 404) return "http_404";
  if (status === 429) return "http_429";
  if (status >= 500) return "http_5xx";
  if (status >= 400) return `http_${status}`;
  if (String(contentType || "").includes("pdf")) return "pdf_extract_failed";
  const name = typeof errorOrStatus === "object" ? errorOrStatus?.name : "";
  const message = typeof errorOrStatus === "object" ? String(errorOrStatus?.message || "") : "";
  if (name === "TimeoutError" || /timeout/i.test(message)) return "timeout";
  if (name === "AbortError") return "aborted";
  if (name === "TypeError" || /fetch failed|network/i.test(message)) return "network_error";
  return "unknown";
}

function contentFailureReason(page, config = {}) {
  if (!page) return "content_too_thin";
  if (page.quality?.blocked) return "blocked_page";
  if (page.quality?.weak || (page.text?.length || 0) < (config.minPageText || MIN_PAGE_TEXT)) return "content_too_thin";
  return "success";
}

function summarizeFetchedPage(page) {
  return page ? { title: page.title, sourceType: page.sourceType, publishDate: page.publishDate, textLength: page.text?.length || 0 } : null;
}

function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
      fn(value);
    };
    const abort = () => finish(reject, Object.assign(new Error("aborted"), { name: "AbortError" }));
    const timer = setTimeout(() => finish(resolve), ms);
    timer.unref?.();
    if (signal?.aborted) abort();
    else signal?.addEventListener?.("abort", abort, { once: true });
  });
}

async function fetchTextWithRetry(url, signal, attempts = 2, headers = {
  "user-agent": randomUserAgent(),
  "accept-language": "en-US,en;q=0.9",
}, timeoutMs) {
  let lastError;
  const startedAt = Date.now();
  const deadline = timeoutMs ? startedAt + timeoutMs : null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const attemptStartedAt = Date.now();
    const remainingMs = deadline ? Math.max(1, deadline - Date.now()) : timeoutMs;
    try {
      const response = await fetch(url, { headers, redirect: "follow", signal: withTimeoutSignal(signal, remainingMs) });
      const status = Number(response?.status || 200);
      const ok = response?.ok !== false && status < 400;
      if (!ok) {
        const error = new Error(`HTTP ${status}`);
        error.name = "HttpFetchError";
        error.statusCode = status;
        error.transient = isTransientStatus(status);
        error.retryCount = attempt;
        throw error;
      }
      response.__emetFetchMeta = { attempt: attempt + 1, retryCount: attempt, latencyMs: Date.now() - startedAt, statusCode: status };
      return response;
    } catch (error) {
      lastError = error;
      error.attempt = attempt + 1;
      error.retryCount = attempt;
      error.latencyMs = Date.now() - startedAt;
      if (signal?.aborted || error?.name === "AbortError") throw error;
      const retryable = isRetryableFetchError(error);
      const hasAttemptLeft = attempt + 1 < attempts;
      const hasBudget = !deadline || Date.now() < deadline;
      if (!retryable || !hasAttemptLeft || !hasBudget) throw error;
      const base = 100 * (2 ** attempt);
      const jitter = Math.floor(Math.random() * 75);
      const delay = deadline ? Math.min(base + jitter, Math.max(0, deadline - Date.now())) : base + jitter;
      await sleep(delay, signal);
    } finally {
      void attemptStartedAt;
    }
  }
  throw lastError;
}

function inferAllowedSources(config) {
  if (!Array.isArray(config.allowedSources) || config.allowedSources.length === 0) return null;
  return new Set(config.allowedSources.map((value) => String(value).toLowerCase()));
}

function filterBySourceOptions(result, config) {
  const allowed = inferAllowedSources(config);
  if (!allowed) return true;
  const type = classifySourceType(result.url, result.title);
  if (allowed.has("official_docs") && type === "official_doc") return true;
  if (allowed.has("paper") && type === "paper") return true;
  if (allowed.has(type)) return true;
  try {
    const hostname = new URL(result.url).hostname.toLowerCase();
    if (allowed.has(hostname)) return true;
  } catch {
    // ignore
  }
  return false;
}

function filterSearchResults(results, config = getResearchConfig()) {
  return results.filter((result) => {
    try {
      const hostname = new URL(result.url).hostname;
      if (hostname.includes("duckduckgo.com") || !result.snippet) return false;
      const sourceType = classifySourceType(result.url, result.title);
      if (Array.isArray(config.allowedSourceTypes) && !config.allowedSourceTypes.includes(sourceType)) return false;
      return true;
    } catch {
      return false;
    }
  });
}

function sourceFromPaper(title, url, snippet, publishDate) {
  return { title: normalizePaperTitle(title), url, snippet, publishDate, sourceType: "paper" };
}

async function searchArxiv(query, signal, config) {
  try {
    const response = await fetchTextWithRetry(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${config.resultsPerQuery}`, signal, 2, {}, config.pageTimeoutMs);
    const xml = await response.text();
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => {
      const entry = match[1];
      const url = entry.match(/<id>([^<]+)<\/id>/)?.[1] || "";
      const title = normalizePaperTitle((entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").replace(/\s+/g, " ").trim());
      const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || "").replace(/\s+/g, " ").trim();
      const published = entry.match(/<published>([^<]+)<\/published>/)?.[1]?.slice(0, 10);
      return sourceFromPaper(title, url, summary, published);
    }).filter((item) => item.url && item.title);
  } catch (error) {
    await logResearchEvent("search_error", { provider: "arxiv", query, reason: fetchFailureReason(error), outcome: "hard_failure", statusCode: error?.statusCode || null, retryCount: error?.retryCount || 0, latencyMs: error?.latencyMs || null, error });
    return [];
  }
}

async function searchSemanticScholar(query, signal, config) {
  try {
    const response = await fetchTextWithRetry(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${config.resultsPerQuery}&fields=title,abstract,url,year`, signal, 2, {}, config.pageTimeoutMs);
    const data = await response.json();
    return (data?.data || []).map((item) => sourceFromPaper(item.title, item.url || `https://www.semanticscholar.org/search?q=${encodeURIComponent(item.title)}`, item.abstract || "", item.year ? `${item.year}-01-01` : null)).filter((item) => item.title);
  } catch (error) {
    await logResearchEvent("search_error", { provider: "semanticscholar", query, reason: fetchFailureReason(error), outcome: "hard_failure", statusCode: error?.statusCode || null, retryCount: error?.retryCount || 0, latencyMs: error?.latencyMs || null, error });
    return [];
  }
}

async function searchCrossref(query, signal, config) {
  try {
    const response = await fetchTextWithRetry(`https://api.crossref.org/works?query.title=${encodeURIComponent(query)}&rows=${config.resultsPerQuery}`, signal, 2, { "user-agent": randomUserAgent() }, config.pageTimeoutMs);
    const data = await response.json();
    return (data?.message?.items || []).map((item) => {
      const doi = item.DOI ? `https://doi.org/${item.DOI}` : "";
      const dateParts = item.published?.["date-parts"]?.[0] || [];
      const publishDate = dateParts.length ? `${String(dateParts[0]).padStart(4, "0")}-${String(dateParts[1] || 1).padStart(2, "0")}-${String(dateParts[2] || 1).padStart(2, "0")}` : null;
      return sourceFromPaper(item.title?.[0] || "", doi, String(item.abstract || "").replace(/<[^>]+>/g, " "), publishDate);
    }).filter((item) => item.url && item.title);
  } catch (error) {
    await logResearchEvent("search_error", { provider: "crossref", query, reason: fetchFailureReason(error), outcome: "hard_failure", statusCode: error?.statusCode || null, retryCount: error?.retryCount || 0, latencyMs: error?.latencyMs || null, error });
    return [];
  }
}

export async function searchDuckDuckGo(query, signal, config = getResearchConfig()) {
  const cacheKey = `${query}::${config.resultsPerQuery}::${config.searchProvider || "ddg_html"}::${JSON.stringify({
    allowedSourceTypes: config.allowedSourceTypes || [],
    allowedSources: config.allowedSources || [],
    preferRecent: config.preferRecent || false,
    minYear: config.minYear || "",
    maxYear: config.maxYear || "",
  })}`;
  const cached = config.isolate ? null : getCacheValue(searchCache, cacheKey);
  if (cached) {
    await logResearchEvent("search_results_summary", { query, outcome: "cache_hit", reason: "cache_hit", sourceCount: cached.length, provider: "memory" });
    return cached;
  }

  let results = [];
  let selectedProvider = null;
  const providerOrder = config.searchProvider === "lite"
    ? ["lite", "ddg_html", "jina"]
    : config.searchProvider === "jina"
      ? ["jina", "ddg_html", "lite"]
      : ["ddg_html", "lite", "jina"];

  for (const provider of providerOrder) {
    const providerStartedAt = Date.now();
    const attempt = providerOrder.indexOf(provider) + 1;
    try {
      let rawResults = [];
      let responseMeta = {};
      if (provider === "ddg_html") {
        const htmlResponse = await fetchTextWithRetry(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, signal, 1, undefined, config.searchTimeoutMs || config.pageTimeoutMs);
        responseMeta = htmlResponse.__emetFetchMeta || {};
        rawResults = extractDuckDuckGoResults(await htmlResponse.text());
      } else if (provider === "lite") {
        const liteResponse = await fetchTextWithRetry(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, signal, 2, undefined, config.searchTimeoutMs || config.pageTimeoutMs);
        responseMeta = liteResponse.__emetFetchMeta || {};
        rawResults = extractDuckDuckGoLiteResults(await liteResponse.text());
      } else {
        const jinaResponse = await fetchTextWithRetry(`https://r.jina.ai/http://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, signal, 2, {}, config.searchTimeoutMs || config.pageTimeoutMs);
        responseMeta = jinaResponse.__emetFetchMeta || {};
        rawResults = extractJinaSearchResults(await jinaResponse.text());
      }
      results = filterSearchResults(rawResults, config);
      const outcome = results.length > 0 ? "success" : "empty";
      await logResearchEvent("search_provider_result", {
        query,
        provider,
        providerOrder,
        attempt,
        outcome,
        reason: results.length > 0 ? "success" : "search_empty",
        rawResultCount: rawResults.length,
        postFilterResultCount: results.length,
        statusCode: responseMeta.statusCode || 200,
        retryCount: responseMeta.retryCount || 0,
        latencyMs: Date.now() - providerStartedAt,
      });
      if (results.length > 0) {
        selectedProvider = provider;
        break;
      }
    } catch (error) {
      results = [];
      await logResearchEvent("search_error", {
        query,
        provider,
        providerOrder,
        attempt,
        outcome: "hard_failure",
        reason: fetchFailureReason(error),
        statusCode: error?.statusCode || null,
        retryCount: error?.retryCount || 0,
        latencyMs: Date.now() - providerStartedAt,
        error,
      });
    }
  }

  if (config.mode === "academic") {
    const academic = [
      ...(await searchArxiv(query, signal, config)),
      ...(await searchSemanticScholar(query, signal, config)),
      ...(await searchCrossref(query, signal, config)),
    ];
    results = [...results, ...academic];
  }

  const candidatesBeforeDedup = results.length;
  const ranked = rankSearchResults(results, query, config.resultsPerQuery, config);
  await logResearchEvent("search_results_summary", {
    query,
    provider: selectedProvider || providerOrder.at(-1),
    providerOrder,
    outcome: ranked.length > 0 ? "success" : "empty",
    reason: ranked.length > 0 ? "success" : "search_empty",
    rawResultCount: candidatesBeforeDedup,
    candidatesBeforeDedup,
    finalRankedSetSize: ranked.length,
    sourceCount: ranked.length,
  });
  return config.isolate ? ranked : setCacheValue(searchCache, cacheKey, ranked, SEARCH_CACHE_TTL_MS);
}

function shouldSkipUrl(url) {
  return /(\/login|\/signin|\/sign-in|\/account|\/subscribe|\/checkout)/i.test(url);
}

function shouldUseJinaFirst(url) {
  try {
    return /(^|\.)medium\.com$|(^|\.)dev\.to$|(^|\.)substack\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function pageFromText(title, url, text, config, extra = {}) {
  const full = String(text || "");
  const trimmed = full.slice(0, config.pageTextLimit).trim();
  if (trimmed.length < config.minPageText) return null;
  return { title, url, text: trimmed, fullText: full, codeBlocks: extractCodeBlocks(text), ...extra };
}

async function fetchJinaPageSource(url, signal, config) {
  if (!config.useJinaFallback || shouldSkipUrl(url)) return null;
  try {
    const response = await fetchTextWithRetry(buildJinaReaderUrl(url), signal, 2, {}, config.pageTimeoutMs);
    const body = await response.text();
    const firstLine = body.split("\n").find((line) => line.trim().replace(/^#+\s*/, ""));
    const title = firstLine ? firstLine.trim().replace(/^#+\s*/, "") : url;
    return pageFromText(title, url, body, config, { sourceType: classifySourceType(url, title), fetchStatus: 200, contentType: "text/plain" });
  } catch {
    return null;
  }
}

function withinTimeframe(page, config) {
  if (!config.minYear && !config.maxYear && !config.preferRecent) return true;
  const year = page.publishDate ? Number(String(page.publishDate).slice(0, 4)) : null;
  if (config.minYear && year && year < config.minYear) return false;
  if (config.maxYear && year && year > config.maxYear) return false;
  return true;
}

function finalizeFetchedPage(page, config, meta = {}) {
  if (!page) return null;
  const quality = page.quality || pageQualitySignals({
    title: page.title,
    text: page.text,
    url: page.url || meta.url || "",
    query: config.query || "",
    status: page.fetchStatus ?? meta.status,
    contentType: page.contentType || meta.contentType || "text/html",
  });
  if (quality.blocked) return null;
  return { ...page, quality };
}

export async function fetchPageSource(url, signal, config = getResearchConfig()) {
  if (shouldSkipUrl(url)) {
    await logResearchEvent("fetch_skip", { url, outcome: "skipped", reason: "blocked_page" });
    return null;
  }
  const adapter = config.fetchAdapter || pageFetchAdapter;
  const cacheKey = `${normalizeUrl(url)}::${config.pageTextLimit}::${JSON.stringify({
    preferRecent: config.preferRecent || false,
    minYear: config.minYear || "",
    maxYear: config.maxYear || "",
    useJinaFallback: Boolean(config.useJinaFallback),
  })}`;
  const cached = config.isolate ? null : getCacheValue(pageCache, cacheKey);
  if (cached) {
    const validated = finalizeFetchedPage(cached, config, { url: cached.url || url, contentType: "text/html" });
    if (!validated) {
      await logResearchEvent("fetch_skip", { url, cacheKey, outcome: "skipped", reason: "blocked_page" });
      return null;
    }
    await logResearchEvent("fetch_cache_hit", { url, cacheKey, outcome: "cache_hit", reason: "cache_hit", title: validated.title, textLength: validated.text?.length || 0 });
    return validated;
  }

  const fetchStartedAt = Date.now();
  await logResearchEvent("fetch_start", { url, cacheKey, outcome: "started", config: { isolate: config.isolate, useJinaFallback: Boolean(config.useJinaFallback), pageTextLimit: config.pageTextLimit } });

  if (shouldUseJinaFirst(url)) {
    const first = finalizeFetchedPage(await fetchJinaPageSource(url, signal, config), config, { url, contentType: "text/plain" });
    if (first && withinTimeframe(first, config)) {
      const page = config.isolate ? first : setCacheValue(pageCache, cacheKey, first, pageCacheTtl(first));
      await logResearchEvent("fetch_end", { url, via: "jina_first", outcome: "success", reason: "success", success: Boolean(page), fallbackUsed: false, latencyMs: Date.now() - fetchStartedAt, page: summarizeFetchedPage(page) });
      return page;
    }
  }

  try {
    const pageTimeout = resolvePageTimeout(url, config.pageTimeoutMs);
    const response = await fetchTextWithRetry(url, signal, 2, {
      "user-agent": randomUserAgent(),
      "accept-language": "en-US,en;q=0.9",
    }, pageTimeout);

    const contentType = response.headers.get("content-type") || "";

    // PDF extraction (academic, code, deep modes)
    if (isPdfUrl(url, contentType) || contentType.includes("pdf")) {
      const pdfBuffer = Buffer.from(await response.arrayBuffer());
      const pdfResult = await extractPdfText(pdfBuffer);
      if (pdfResult && pdfResult.text) {
        const sourceType = classifySourceType(url, pdfResult.title || url);
        const page = pageFromText(pdfResult.title || url, url, pdfResult.text, config, {
          sourceType: sourceType === "webpage" ? "paper" : sourceType,
          publishDate: extractPublishDate(pdfResult.text.slice(0, 2000)),
          fetchStatus: 200,
          contentType: "application/pdf",
        });
        const final = finalizeFetchedPage(page, config, { url, status: 200, contentType: "application/pdf" });
        const stored = final && withinTimeframe(final, config)
          ? (config.isolate ? final : setCacheValue(pageCache, cacheKey, final, pageCacheTtl(final)))
          : null;
        await logResearchEvent("fetch_end", { url, via: "pdf_extraction", outcome: stored ? "success" : "hard_failure", reason: stored ? "success" : contentFailureReason(final, config), success: Boolean(stored), statusCode: response.status ?? 200, contentType: "application/pdf", retryCount: response.__emetFetchMeta?.retryCount || 0, latencyMs: Date.now() - fetchStartedAt, page: summarizeFetchedPage(stored) });
        return stored;
      }
      await logResearchEvent("fetch_end", { url, via: "pdf_extraction", outcome: "hard_failure", reason: "pdf_extract_failed", success: false, statusCode: response.status ?? 200, contentType: "application/pdf", retryCount: response.__emetFetchMeta?.retryCount || 0, latencyMs: Date.now() - fetchStartedAt });
    }

    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      const fallback = finalizeFetchedPage(await fetchJinaPageSource(url, signal, config), config, { url, contentType });
      if (fallback && withinTimeframe(fallback, config)) {
        const page = config.isolate ? fallback : setCacheValue(pageCache, cacheKey, fallback, pageCacheTtl(fallback));
        await logResearchEvent("fetch_end", { url, via: "unsupported_content_type_fallback", outcome: "fallback_success", reason: "success", success: Boolean(page), contentType, fallbackUsed: true, latencyMs: Date.now() - fetchStartedAt, page: summarizeFetchedPage(page) });
        return page;
      }
      await logResearchEvent("fetch_end", { url, outcome: "hard_failure", success: false, reason: "unsupported_content_type", contentType, fallbackUsed: true, latencyMs: Date.now() - fetchStartedAt });
      return null;
    }

    const body = await response.text();
    const snapshot = await extractPageSnapshot(body, response.url || url);
    let page = pageFromText(snapshot.title, snapshot.url, snapshot.text, config, {
      publishDate: extractPublishDate(body),
      sourceType: classifySourceType(snapshot.url, snapshot.title),
      codeBlocks: snapshot.codeBlocks,
      fetchStatus: response.status ?? 200,
      contentType,
    });

    const assessment = adapter.assessPageAttempt?.({
      status: response.status ?? 200,
      body,
      contentType,
      url: response.url || url,
    });

    // Blocked / dynamic / weak pages fall through to Jina fallback below
    const resolved = page || await fetchJinaPageSource(url, signal, config);
    const finalPage = finalizeFetchedPage(resolved, config, { url: response.url || url, status: response.status ?? 200, contentType });
    const stored = finalPage && withinTimeframe(finalPage, config)
      ? (config.isolate ? finalPage : setCacheValue(pageCache, cacheKey, finalPage, pageCacheTtl(finalPage)))
      : null;
    await logResearchEvent("fetch_end", { url, outcome: stored ? (page ? "success" : "fallback_success") : "hard_failure", reason: stored ? "success" : contentFailureReason(finalPage || (assessment ? { quality: assessment } : null), config), success: Boolean(stored), statusCode: response.status ?? 200, contentType, fallbackUsed: !page, retryCount: response.__emetFetchMeta?.retryCount || 0, latencyMs: Date.now() - fetchStartedAt, page: summarizeFetchedPage(stored), assessment });
    return stored;
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") {
      await logResearchEvent("fetch_abort", { url, reason: error?.name });
      return null;
    }
    const fallbackConfig = error?.name === "TimeoutError"
      ? { ...config, pageTimeoutMs: Math.min(Number(config.pageTimeoutMs || 10_000), 3_000) }
      : config;
    const fallback = finalizeFetchedPage(await fetchJinaPageSource(url, signal, fallbackConfig), config, { url, contentType: "text/plain" });
    const stored = fallback && withinTimeframe(fallback, config)
      ? (config.isolate ? fallback : setCacheValue(pageCache, cacheKey, fallback, pageCacheTtl(fallback)))
      : null;
    await logResearchEvent("fetch_error", { url, outcome: stored ? "fallback_success" : "hard_failure", reason: stored ? "success" : fetchFailureReason(error), statusCode: error?.statusCode || null, retryCount: error?.retryCount || 0, latencyMs: Date.now() - fetchStartedAt, fallbackUsed: true, fallback: summarizeFetchedPage(stored), error });
    return stored;
  }
}

async function speculativeFetch(results, signal, config, query) {
  const target = Math.max(1, config.minSources || 1);
  const controllers = results.map(() => new AbortController());
  const abortAll = () => controllers.forEach((controller) => controller.abort());
  if (signal) signal.addEventListener("abort", abortAll, { once: true });

  let usableCount = 0;
  const pages = await Promise.all(results.map(async (result, index) => {
    const scopedSignal = signal ? AbortSignal.any([signal, controllers[index].signal]) : controllers[index].signal;
    const page = await fetchPageSource(result.url, scopedSignal, { ...config, query });
    if (scopedSignal.aborted || !page) return null;
    if (isUsableContent(page, { ...config, query })) {
      usableCount += 1;
      if (usableCount >= target) {
        controllers.forEach((controller, controllerIndex) => {
          if (controllerIndex !== index && !controller.signal.aborted) controller.abort();
        });
      }
    }
    return page;
  }));

  if (signal) signal.removeEventListener("abort", abortAll);
  return pages.filter(Boolean);
}

async function readLocalFiles(paths, config) {
  const pages = [];
  for (const path of paths) {
    try {
      const text = await readFile(path, "utf8");
      const page = pageFromText(path.split("/").pop() || path, `file://${path}`, text, config, {
        sourceType: "file",
        publishDate: null,
        local: true,
      });
      await logResearchEvent("local_file_read", { path, success: Boolean(page), textLength: text.length, page: page ? { title: page.title, textLength: page.text.length } : null });
      if (page) pages.push(page);
    } catch (error) {
      await logResearchEvent("local_file_error", { path, error });
    }
  }
  return pages;
}

function fallbackSynthesis(query, pages) {
  const sources = prioritizeSourceEntries(pages.slice(0, Math.min(5, pages.length)).map((page, index) => ({
    number: index + 1,
    title: page.title,
    url: page.url,
    freshness: normalizeResearchFreshness(undefined, page.publishDate),
    sourceType: page.sourceType,
    score: page.score,
    authoritative: page.authoritative,
    versionSignals: page.versionSignals,
  })), query);

  const topPages = pages.slice(0, Math.min(5, pages.length));
  const bullets = topPages.map((page, index) => `${page.text.replace(/\s+/g, " ").slice(0, 180).trim()} [${index + 1}]`);
  const answer = pages.length
    ? topPages.map((page, index) => {
        const excerpt = page.text.replace(/\s+/g, " ").slice(0, 400).trim();
        return `${excerpt} [${index + 1}]`;
      }).join("\n\n")
    : `I could not find enough reliable sources for "${query}".`;

  return { answer, bullets, sources, citations: sources.map((source) => ({ text: source.title, sourceIndex: source.number || 0 })) };
}

export async function synthesizeResearch(query, pages, ctx, signal) {
  const synthesisStartedAt = Date.now();
  const versionContext = extractVersionContext(query);
  await logResearchEvent("synthesis_start", { query, versionContext, outcome: "started", pages: pages.map((page) => ({ title: page.title, url: page.url, sourceType: page.sourceType, textLength: page.text?.length || 0 })) });
  const prompt = [
    "You are a concise research synthesizer.",
    "Answer only from the provided sources.",
    "Return only JSON with this exact shape:",
    '{"answer":"...","bullets":["..."],"sourceIds":[1,2],"citations":[{"text":"...","sourceIndex":1}]}',
    "Rules:",
    "- answer: one short paragraph with inline citations like [1] [2]",
    "- bullets: 3-5 short bullet strings, each with inline citations",
    ...(versionContext.versionSensitive ? [
      "- anchor the answer to the referenced version context explicitly",
      "- if the sources mix versions, say that explicitly instead of generalizing to latest",
      "- for deprecated, removed, or breaking behavior, prefer release notes, changelogs, migration guides, or breaking-changes pages when available",
    ] : []),
    `Question: ${query}`,
    "Sources:",
    ...pages.map((page, index) => [
      `[${index + 1}] ${page.title}`,
      `URL: ${page.url}`,
      `Type: ${page.sourceType || classifySourceType(page.url, page.title)}`,
      `Score: ${typeof page.score === "number" ? page.score : scoreSourceEntry(page, query).total}`,
      `Text: ${page.text}`,
    ].join("\n")),
  ].join("\n\n");

  try {
    const text = await completeWithResearchModel(ctx, signal, prompt, "medium");
    const parsed = text ? parseJsonBlock(text) : null;
    if (parsed && typeof parsed.answer === "string" && Array.isArray(parsed.bullets) && Array.isArray(parsed.sourceIds)) {
      const sourceIds = [...new Set(parsed.sourceIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id >= 1 && id <= pages.length))];
      if (sourceIds.length > 0) {
        const sources = prioritizeSourceEntries(sourceIds.map((id) => ({
          number: id,
          title: pages[id - 1].title,
          url: pages[id - 1].url,
          freshness: normalizeResearchFreshness(undefined, pages[id - 1].publishDate),
          sourceType: pages[id - 1].sourceType || classifySourceType(pages[id - 1].url, pages[id - 1].title),
          score: typeof pages[id - 1].score === "number" ? pages[id - 1].score : scoreSourceEntry(pages[id - 1], query).total,
          authoritative: typeof pages[id - 1].authoritative === "boolean" ? pages[id - 1].authoritative : scoreSourceEntry(pages[id - 1], query).authoritative,
          versionSignals: pages[id - 1].versionSignals,
        })), query);
        const result = {
          answer: parsed.answer.trim(),
          bullets: parsed.bullets.map((item) => String(item).trim()).filter(Boolean).slice(0, 5),
          sources,
          citations: Array.isArray(parsed.citations) ? parsed.citations.slice(0, 8) : sources.map((source) => ({ text: source.title, sourceIndex: source.number || 0 })),
        };
        await logResearchEvent("synthesis_end", { query, outcome: "success", reason: "success", latencyMs: Date.now() - synthesisStartedAt, result });
        return result;
      }
    }
  } catch {
    // fall through
  }

  const fallback = fallbackSynthesis(query, pages);
  await logResearchEvent("synthesis_end", { query, outcome: "fallback_success", reason: "success", fallbackUsed: true, latencyMs: Date.now() - synthesisStartedAt, result: fallback });
  return fallback;
}

function planSubqueries(rootQuery, currentQuery, config, sufficiency) {
  const queries = [];
  if (sufficiency?.openSubQuestions?.length) queries.push(...sufficiency.openSubQuestions);
  if (queries.length === 0) queries.push(buildFollowUpQuery(currentQuery || rootQuery, []));
  return [...new Set(queries.filter(Boolean))].slice(0, Math.max(1, config.breadth || 2));
}

function formatResultText(result, format) {
  return formatResearchResponse({ answer: result.answer, bullets: result.bullets, sources: result.sources, confidence: result.confidence, format });
}

/**
 * Fetch a single URL and return raw page content without any synthesis.
 * This is the core primitive for the web_fetch tool — agents get full
 * page text directly, no LLM summarization, no query-based chunking.
 *
 * Returns the full page text (pageTextLimit = Infinity) so the agent
 * never needs to fall back to browser_harness or curl for page content.
 */
export async function webFetch(url, signal, config = {}) {
  const fetchConfig = {
    ...(config.mode ? getResearchConfig(config) : getResearchConfig("fast")),
    ...config,
    pageTextLimit: 1_000_000,  // effectively unlimited
    minPageText: 1,
  };
  const page = await fetchPageSource(url, signal, fetchConfig);
  if (!page) {
    const reason = shouldSkipUrl(url) ? "blocked_url" : "unreachable";
    await logResearchEvent("web_fetch_fail", { url, reason });
    return { ok: false, url, error: `Could not fetch ${url}: ${reason}` };
  }
  await logResearchEvent("web_fetch_ok", { url, title: page.title, textLength: page.fullText?.length || page.text?.length || 0 });
  return {
    ok: true,
    url: page.url || url,
    title: page.title || "",
    text: page.fullText || page.text || "",
    contentType: page.contentType || "text/html",
    codeBlocks: Array.isArray(page.codeBlocks) ? page.codeBlocks : extractCodeBlocks(page.fullText || page.text || ""),
    sourceType: page.sourceType || classifySourceType(url, page.title || ""),
    publishDate: page.publishDate || null,
  };
}

// modeCacheKey is imported from research-memory.js

import {
  applyConflictTinyRouterDecision,
  applySufficiencyTinyRouterDecision,
  chooseTinyRouterDomain,
  classifyConflictWithTinyRouter,
  classifyDomainWithTinyRouter,
  classifyFollowupWithTinyRouter,
  classifyPreflightWithTinyRouter,
  classifyQueryUnderstandingWithTinyRouter,
  classifySufficiencyWithTinyRouter,
  resolveTinyRouterConfig,
  resolveTinyRouterSupportedDomains,
} from "./tiny-router.js";

function missingAspectFromStructuredDecision(decision) {
  if (decision === "need_authority") return "authoritative sources";
  if (decision === "need_more_sources") return "readable sources";
  if (decision === "need_primary_source") return "primary sources";
  if (decision === "need_recency") return "recent sources";
  if (decision === "need_version_context") return "version context";
  if (decision === "need_conflict_resolution") return "conflict resolution";
  if (decision === "ask_clarifying_question") return "clarifying context";
  return null;
}

function withStructuredSufficiencyDecision(sufficiency, decision, query, seenUrls = []) {
  if (!decision) return sufficiency;
  if (decision === "sufficient") return sufficiency;

  const missingAspect = missingAspectFromStructuredDecision(decision);
  const followupQuery = buildActionBasedFollowUpQuery(query, decision, { seenUrls });

  return {
    ...sufficiency,
    sufficient: false,
    missingAspects: missingAspect
      ? [...new Set([...(sufficiency.missingAspects || []), missingAspect])]
      : sufficiency.missingAspects,
    openSubQuestions: followupQuery
      ? [...new Set([...(sufficiency.openSubQuestions || []), followupQuery])]
      : sufficiency.openSubQuestions,
  };
}

async function resolveQuestionDomain(query, mode, signal, guardrails = null, preflightPrediction = null) {
  const modeOptions = typeof mode === "object" ? mode : {};
  const normalizedMode = modeOptions.mode || (typeof mode === "string" ? mode : "fast");
  const heuristicDomain = classifyQuestionDomain(query);
  const selection = resolveDomainSelection({ query, ...modeOptions });
  const fallback = selection.explicitDomainRequested ? selection.primaryDomain : heuristicDomain;

  if (selection.shouldBypassLearnedRouter) {
    return {
      heuristicDomain,
      predictedDomain: null,
      finalDomain: selection.primaryDomain,
      decisionSource: selection.decisionSource,
      decisionReason: selection.decisionSource === "forced" ? "forced_domain" : "explicit_domain",
      latencyMs: null,
    };
  }

  const tinyConfigBeforeCall = resolveTinyRouterConfig();
  const hasPreflightDomain = preflightPrediction && Object.hasOwn(preflightPrediction, "domain") && preflightPrediction.domain;
  if (!hasPreflightDomain && !tinyConfigBeforeCall.tasks.domain) {
    const reason = tinyConfigBeforeCall.enabled ? "domain_task_disabled_or_model_missing" : tinyConfigBeforeCall.setupReason;
    const setupKey = `domain:${reason}:${tinyConfigBeforeCall.pythonPath}:${tinyConfigBeforeCall.modelDir}`;
    if (!tinyRouterSetupLogged.has(setupKey)) {
      tinyRouterSetupLogged.add(setupKey);
      await logResearchEvent("tiny_router_setup", { task: "domain", outcome: "unavailable", reason, modelDir: tinyConfigBeforeCall.modelDir, pythonPath: tinyConfigBeforeCall.pythonPath });
    }
    return {
      heuristicDomain: fallback,
      predictedDomain: null,
      finalDomain: fallback,
      decisionSource: "heuristic",
      decisionReason: reason,
      latencyMs: null,
    };
  }

  try {
    const tinyStartedAt = Date.now();
    const preflightDomain = preflightPrediction && Object.hasOwn(preflightPrediction, "domain") ? preflightPrediction.domain : undefined;
    const tinyDomain = preflightDomain || await classifyDomainWithTinyRouter(query, normalizedMode, signal);
    const tinyLatencyMs = Date.now() - tinyStartedAt;
    const tinyConfig = resolveTinyRouterConfig();
    const supportedDomains = resolveTinyRouterSupportedDomains(tinyConfig.modelDir);
    const domain = chooseTinyRouterDomain(fallback, tinyDomain, { guardrails, supportedDomains });
    const unsupportedHeuristicDomain = Boolean(supportedDomains && fallback && !supportedDomains.has(fallback));
    await logResearchEvent("tiny_router_latency", { task: "domain", latencyMs: tinyLatencyMs, accepted: Boolean(tinyDomain) });

    if (tinyDomain && domain !== fallback) {
      await logResearchEvent("tiny_router_domain", { query, mode: normalizedMode, heuristicDomain: fallback, predictedDomain: tinyDomain, acceptedDomain: domain });
      return {
        heuristicDomain: fallback,
        predictedDomain: tinyDomain,
        finalDomain: domain,
        decisionSource: "tiny_router",
        decisionReason: "tiny_router_override",
        latencyMs: tinyLatencyMs,
      };
    }
    if (tinyDomain && domain === fallback && tinyDomain !== fallback) {
      const reason = unsupportedHeuristicDomain ? "heuristic_domain_not_supported_by_model" : "guardrail_not_downgraded";
      await logResearchEvent("tiny_router_fallback", { task: "domain", query, mode: normalizedMode, heuristicDomain: fallback, predictedDomain: tinyDomain, reason, guardrails: snapshotGuardrails(guardrails) });
      return {
        heuristicDomain: fallback,
        predictedDomain: tinyDomain,
        finalDomain: fallback,
        decisionSource: "heuristic",
        decisionReason: reason,
        latencyMs: tinyLatencyMs,
      };
    }

    await logResearchEvent("tiny_router_fallback", { task: "domain", query, mode: normalizedMode, heuristicDomain: fallback, reason: tinyDomain ? "heuristic_kept" : "tiny_router_unavailable_or_low_confidence" });
    return {
      heuristicDomain: fallback,
      predictedDomain: tinyDomain || null,
      finalDomain: fallback,
      decisionSource: "heuristic",
      decisionReason: tinyDomain ? "heuristic_kept" : "tiny_router_unavailable_or_low_confidence",
      latencyMs: tinyLatencyMs,
    };
  } catch (error) {
    await logResearchEvent("tiny_router_fallback", { task: "domain", query, mode: normalizedMode, heuristicDomain: fallback, reason: "error", error });
    return {
      heuristicDomain: fallback,
      predictedDomain: null,
      finalDomain: fallback,
      decisionSource: "heuristic",
      decisionReason: "error",
      latencyMs: null,
    };
  }
}

export async function runWebResearch(query, ctx, signal, onUpdate, mode = "fast") {
  const versionContext = extractVersionContext(query);
  const modeOptions = typeof mode === "object" ? mode : { mode };
  // Override caller mode with intent-based mode when caller defaults to "fast"
  // but query is clearly academic, comparison, or versioned.
  const detectedMode = defaultMode(query);
  const callerMode = modeOptions.mode || mode;
  const effectiveMode = callerMode === "fast" && detectedMode !== "fast" ? detectedMode : callerMode;
  modeOptions.mode = effectiveMode;
  const guardrails = buildResearchGuardrails(query, modeOptions);
  const guardrailSnapshot = snapshotGuardrails(guardrails);
  await logResearchEvent("guardrail_decision", { query, guardrail_flags: guardrailSnapshot.guardrail_flags, guardrails: guardrailSnapshot });
  const preflightStartedAt = Date.now();
  const preflightPrediction = await classifyPreflightWithTinyRouter(query, effectiveMode, signal);
  if (preflightPrediction) {
    await logResearchEvent("tiny_router_latency", { task: "preflight", latencyMs: Date.now() - preflightStartedAt, accepted: true });
  }
  const domainDecision = await resolveQuestionDomain(query, { ...modeOptions, mode: effectiveMode }, signal, guardrails, preflightPrediction);
  const domain = domainDecision.finalDomain;
  const queryUnderstandingPrediction = preflightPrediction?.queryUnderstanding || await classifyQueryUnderstandingWithTinyRouter(query, effectiveMode, signal);
  const queryUnderstandingPlanning = resolveQueryUnderstandingPlanning(
    getResearchConfig({ ...modeOptions, query, domain }),
    query,
    queryUnderstandingPrediction,
    { domain, mode: effectiveMode },
  );
  const queryUnderstandingDecision = queryUnderstandingPlanning.decision;
  const config = applyGuardrailsToResearchConfig(queryUnderstandingPlanning.config, guardrails);
  const cacheKey = modeCacheKey(query, config);

  await logResearchEvent("query_understanding_decision", { query, mode: config.mode, domain, queryUnderstandingDecision });
  await logResearchEvent("research_start", { query, mode: config.mode, domain, config, versionContext, queryUnderstandingDecision });

  if (!config.isolate && !config.force) {
    const memoryHit = getResearchMemory(cacheKey);
    if (memoryHit) {
      await logResearchEvent("research_cache_hit", { query, cacheKey, source: "memory", outcome: "cache_hit", reason: "cache_hit" });
      await logResearchEvent("research_end", { ...memoryHit, outcome: "cache_hit", reason: "cache_hit", cacheHit: true, cacheSource: "memory" });
      return memoryHit;
    }
    let persistentHit = readCachedResult(cacheKey);
    if (!persistentHit) {
      // Fallback: try topic-based key (strips years, versions, site:, GitHub paths)
      const topicKey = topicCacheKey(query, config);
      if (topicKey !== cacheKey) {
        persistentHit = readCachedResult(topicKey);
        if (persistentHit) {
          await logResearchEvent("research_cache_hit", { query, cacheKey: topicKey, source: "disk", outcome: "cache_hit", reason: "topic_fallback" });
        }
      }
    }
    if (persistentHit) {
      setResearchMemory(cacheKey, persistentHit);
      await logResearchEvent("research_cache_hit", { query, cacheKey, source: "disk", outcome: "cache_hit", reason: "cache_hit" });
      await logResearchEvent("research_end", { ...persistentHit, outcome: "cache_hit", reason: "cache_hit", cacheHit: true, cacheSource: "disk" });
      return persistentHit;
    }
  }

  const emit = (stage, text) => {
    void logResearchEvent("pipeline_stage", { query, stage, text });
    return onUpdate?.({ content: [{ type: "text", text: `[pipeline:${stage}] ${text}` }] });
  };
  const startedAt = Date.now();
  const runId = randomUUID();
  const createdAt = new Date(startedAt).toISOString();
  const seenUrls = new Set();
  const seenContentHashes = new Set();
  const mergedPages = [];
  const allCodeBlocks = [];
  const traceTurns = [];
  const localPageTrace = [];
  let subqueries = [];
  let followupRounds = 0;
  let followupQuery = null;
  let conflictDetected = false;
  let conflictSummary = "";
  let conflictingSourcePairs = [];
  let sufficiency = { sufficient: false, confidenceScore: 0.1, missingAspects: [], openSubQuestions: [] };
  let lastEmptySearchSignature = null;
  let activeConfig = config;
  let currentQueries = await buildQueries(query, activeConfig, ctx, signal);
  subqueries = [...currentQueries];

  const localPages = await readLocalFiles(config.files || [], config);
  for (const page of localPages) {
    const scored = scoreSourceEntry(page, query);
    const contentHash = hashText(page.text);
    if (seenContentHashes.has(contentHash)) continue;
    seenContentHashes.add(contentHash);
    const mergedPage = {
      ...page,
      score: scored.total,
      authoritative: scored.authoritative,
      freshness: scored.freshness,
      sourceType: page.sourceType || scored.sourceType,
      versionSignals: scored.versionSignals,
      local: true,
    };
    mergedPages.push(mergedPage);
    localPageTrace.push(snapshotPageForTrace(mergedPage));
    if (Array.isArray(page.codeBlocks)) allCodeBlocks.push(...page.codeBlocks);
  }

  for (let turn = 0; turn < Math.max(1, activeConfig.maxTurns || 1); turn++) {
    emit(turn === 0 ? "plan" : "followup", `Planning ${activeConfig.mode} research... turn=${turn + 1}/${activeConfig.maxTurns}`);
    const queriesThisTurn = currentQueries.slice(0, activeConfig.maxQueries);
    const turnTrace = {
      turn: turn + 1,
      queries: [...queriesThisTurn],
    };
    emit("search", `Searching ${queriesThisTurn.length} queries...`);

    const searchGroups = await Promise.all(queriesThisTurn.map((subquery) => searchDuckDuckGo(subquery, signal, activeConfig)));
    const flatResults = searchGroups.flat().map((result) => annotateVersionSignals(result, versionContext));
    turnTrace.searchResults = flatResults.map(snapshotSearchResult);
    await logResearchEvent("search_results", {
      query,
      versionContext,
      queries: queriesThisTurn,
      outcome: flatResults.length > 0 ? "success" : "empty",
      reason: flatResults.length > 0 ? "success" : "search_empty",
      rawResultCount: searchGroups.reduce((sum, group) => sum + group.length, 0),
      postFilterResultCount: flatResults.length,
      sourceCount: flatResults.length,
      results: flatResults.map((result) => ({ title: result.title, url: result.url, snippet: result.snippet, sourceType: result.sourceType, publishDate: result.publishDate, versionSignals: result.versionSignals || null })),
    });
    const searchSignature = queriesThisTurn.join(" || ");
    turnTrace.searchSignature = searchSignature;
    if (flatResults.length === 0) {
      if (lastEmptySearchSignature === searchSignature) break;
      lastEmptySearchSignature = searchSignature;
    } else {
      lastEmptySearchSignature = null;
    }
    const fetchWindow = activeConfig.mode === "fast"
      ? Math.max(activeConfig.maxPages, Math.min(activeConfig.maxPages * 2, (activeConfig.minSources || 3) + 2))
      : activeConfig.maxPages;
    const results = rankSearchResults(flatResults, query, activeConfig.maxPages * 2, activeConfig)
      .map((result) => ({ ...result }))
      .filter((result) => {
        const key = normalizeUrl(result.url);
        if (seenUrls.has(key)) return false;
        seenUrls.add(key);
        return true;
      })
      .slice(0, fetchWindow);
    turnTrace.rankedSearchResults = results.map(snapshotSearchResult);
    await logResearchEvent("search_rerank", {
      query,
      turn: turn + 1,
      candidatesBeforeDedup: flatResults.length,
      afterDedup: results.length,
      afterFilter: results.length,
      finalRankedSetSize: results.length,
    });

    emit("fetch", `Reading ${results.length} sources...`);
    const pageCandidates = activeConfig.mode === "fast"
      ? await speculativeFetch(results, signal, { ...activeConfig, minSources: activeConfig.minSources || 3 }, query)
      : await Promise.all(results.map((result) => fetchPageSource(result.url, signal, { ...activeConfig, query })));
    turnTrace.pageCandidates = pageCandidates.map((page) => page ? snapshotPageForTrace(page) : null);
    await logResearchEvent("page_fetch_results", {
      query,
      versionContext,
      urls: results.map((result) => result.url),
      outcome: pageCandidates.filter(Boolean).length > 0 ? "success" : "empty",
      reason: pageCandidates.filter(Boolean).length > 0 ? "success" : "no_readable_sources",
      sourceCount: pageCandidates.filter(Boolean).length,
      readablePageRate: results.length ? pageCandidates.filter(Boolean).length / results.length : 0,
      authoritativeSourceCount: pageCandidates.filter(Boolean).filter((page) => scoreSourceEntry(page, query).authoritative).length,
      pages: pageCandidates.filter(Boolean).map((page) => ({ title: page.title, url: page.url, sourceType: page.sourceType, publishDate: page.publishDate, textLength: page.text?.length || 0, versionSignals: page.versionSignals || null })),
    });
    const rankedPages = rankFetchedPages(pageCandidates.filter(Boolean).map((page) => {
      const scored = scoreSourceEntry(page, query);
      return {
        ...page,
        score: typeof page.score === "number" ? page.score : scored.total,
        authoritative: typeof page.authoritative === "boolean" ? page.authoritative : scored.authoritative,
        freshness: page.freshness || scored.freshness,
        sourceType: page.sourceType || scored.sourceType,
        versionSignals: page.versionSignals || scored.versionSignals,
        text: selectRelevantChunks(page.text, query, activeConfig.maxChunksPerPage).join("\n\n") || page.text,
      };
    }).filter((page) => withinTimeframe(page, activeConfig) && !page.quality?.blocked), query, activeConfig.maxPages, activeConfig);
    turnTrace.rankedPages = rankedPages.map(snapshotPageForTrace);

    for (const page of prioritizeSourceEntries(rankedPages, query)) {
      const key = normalizeUrl(page.url);
      const contentHash = hashText(page.text);
      if (mergedPages.some((existing) => normalizeUrl(existing.url) === key)) continue;
      if (seenContentHashes.has(contentHash)) continue;
      seenContentHashes.add(contentHash);
      mergedPages.push(page);
      if (Array.isArray(page.codeBlocks)) allCodeBlocks.push(...page.codeBlocks);
    }

    const conflict = detectConflictSignals(mergedPages);
    conflictDetected = conflict.detected;
    conflictSummary = conflict.conflictSummary || "";
    conflictingSourcePairs = conflict.conflictingSourcePairs || [];
    turnTrace.mergedPages = mergedPages.map(snapshotPageForTrace);
    const turnEvidenceState = buildTurnEvidenceState({ query, sources: mergedPages, config: activeConfig, turn: turn + 1 });

    const structuredConflictStartedAt = Date.now();
    const structuredConflictDecision = await classifyConflictWithTinyRouter(query, turnEvidenceState.sources, signal);
    const heuristicConflictDetected = conflictDetected;
    if (structuredConflictDecision) {
      await logResearchEvent("tiny_router_latency", { task: "conflict", latencyMs: Date.now() - structuredConflictStartedAt, accepted: true });
      const nextConflictDetected = applyConflictTinyRouterDecision(
        conflictDetected,
        structuredConflictDecision,
        { allowClear: process.env.EMET_TINY_ROUTER_CONFLICT_ALLOW_CLEAR === "1" || process.env.EMET_TINY_ROUTER_CONFLICT_ALLOW_CLEAR === "true" },
      );
      if (nextConflictDetected !== conflictDetected) {
        conflictDetected = nextConflictDetected;
        if (conflictDetected && !conflictSummary) conflictSummary = `Structured router flagged ${query} for conflict review.`;
      }
      await logResearchEvent("tiny_router_structured_decision", { task: "conflict", query, decision: structuredConflictDecision, heuristicConflictDetected: conflict.detected, finalConflictDetected: conflictDetected });
    }
    turnTrace.conflict = {
      heuristicDetected: heuristicConflictDetected,
      structuredDecision: structuredConflictDecision || null,
      finalDetected: conflictDetected,
      summary: conflictSummary || "",
      conflictingSourcePairs: [...conflictingSourcePairs],
    };

    const minSources = resolveGuardrailedMinSources(activeConfig, mergedPages);

    sufficiency = evaluateSufficiency({
      query,
      sources: mergedPages,
      conflictDetected,
      minSources,
    });

    if (mergedPages.length >= minSources && sufficiency.confidenceScore >= 0.85 && (!conflictDetected || mergedPages.some((page) => page.authoritative))) {
      sufficiency = { ...sufficiency, sufficient: true };
    }

    const heuristicSufficient = sufficiency.sufficient;
    const structuredSufficiencyStartedAt = Date.now();
    const structuredSufficiencyDecision = await classifySufficiencyWithTinyRouter(query, turnEvidenceState.sources, signal);
    if (structuredSufficiencyDecision) {
      await logResearchEvent("tiny_router_latency", { task: "sufficiency", latencyMs: Date.now() - structuredSufficiencyStartedAt, accepted: true });
      const finalSufficient = applySufficiencyTinyRouterDecision(heuristicSufficient, structuredSufficiencyDecision);
      if (finalSufficient !== heuristicSufficient) {
        sufficiency = withStructuredSufficiencyDecision(sufficiency, structuredSufficiencyDecision, query, mergedPages.map((page) => page.url));
      }
      await logResearchEvent("tiny_router_structured_decision", { task: "sufficiency", query, decision: structuredSufficiencyDecision, heuristicSufficient, finalSufficient });
      sufficiency = { ...sufficiency, sufficient: finalSufficient };
    }
    turnTrace.sufficiency = {
      minSources,
      heuristicSufficient,
      structuredDecision: structuredSufficiencyDecision || null,
      finalSufficient: sufficiency.sufficient,
      confidenceScore: sufficiency.confidenceScore,
      missingAspects: [...(sufficiency.missingAspects || [])],
      openSubQuestions: [...(sufficiency.openSubQuestions || [])],
      authoritativeSourcesFound: Boolean(sufficiency.authoritativeSourcesFound),
    };

    const conflictState = conflictDetected ? (mergedPages.some((p) => p.authoritative) ? "minor" : "severe") : "none";
    const sourcesMeta = sourceMetaFromSources(turnEvidenceState.sources);
    const legacyAction = await classifyFollowupWithTinyRouter(query, activeConfig.mode, conflictState, sourcesMeta, signal);
    const policyDecision = decideResearchPolicyAction({
      query,
      mode: activeConfig.mode,
      config: activeConfig,
      evidenceState: turnEvidenceState,
      sufficiency,
      conflict: turnTrace.conflict,
      guardrails,
      queryUnderstandingDecision: queryUnderstandingDecision.final || queryUnderstandingDecision,
      minSources,
      turnIndex: turn + 1,
      maxTurns: activeConfig.maxTurns,
      previousActions: traceTurns.map((entry) => entry.policy?.action || entry.followup?.action).filter(Boolean),
    });
    turnTrace.policy = summarizeResearchPolicyDecision(policyDecision);
    turnTrace.followup = {
      conflictState,
      sourcesMeta,
      legacyAction: legacyAction || null,
      action: policyDecision.action,
    };

    if (policyDecision.action === "stop" || policyDecision.action === "ask_clarifying_question" || turn === (activeConfig.maxTurns - 1)) {
      turnTrace.stopReason = policyDecision.action === "stop"
        ? "policy_stop"
        : (policyDecision.action === "ask_clarifying_question" ? "policy_ask_clarifying_question" : "max_turns_reached");
      turnTrace.evidenceState = buildTurnEvidenceState({ query, sources: mergedPages, config: activeConfig, turn: turn + 1, turnTrace });
      traceTurns.push(turnTrace);
      break;
    }

    followupRounds += 1;
    activeConfig = applyResearchPolicyControls(activeConfig, policyDecision);
    followupQuery = buildPolicyFollowUpQuery(query, policyDecision, { seenUrls: mergedPages.map((page) => page.url) })
      || buildFollowUpQuery(query, mergedPages, { seenUrls: mergedPages.map((page) => page.url) });
    turnTrace.followup = {
      ...turnTrace.followup,
      followupQuery,
      nextConfigControls: policyDecision.controls,
    };

    currentQueries = planSubqueries(query, followupQuery, activeConfig, sufficiency);
    turnTrace.followup.nextQueries = [...currentQueries];
    subqueries = [...new Set([...subqueries, ...currentQueries])];
    turnTrace.evidenceState = buildTurnEvidenceState({
      query,
      sources: mergedPages,
      config: activeConfig,
      turn: turn + 1,
      turnTrace,
      stopReason: turnTrace.stopReason || "needs_followup",
    });
    traceTurns.push(turnTrace);
  }

  const versionCoverage = summarizeVersionCoverage(versionContext, mergedPages);
  const finalEvidenceState = buildEvidenceState({
    query,
    sources: mergedPages,
    config: activeConfig,
    turn: traceTurns.length,
    action: "finalize_research",
    conflict: {
      finalDetected: conflictDetected,
      summary: conflictSummary || "",
      conflictingSourcePairs: [...conflictingSourcePairs],
    },
    sufficiency,
    followup: followupQuery ? { followupQuery } : null,
    stopReason: traceTurns.at(-1)?.stopReason || null,
  });

  if (mergedPages.length === 0) {
    const emptyResult = {
      ok: false,
      action: "web_research",
      query,
      mode: config.mode,
      subqueries,
      outcome: "hard_failure",
      reason: "no_readable_sources",
      message: "No readable web sources were retrieved.",
      openSubQuestions: buildFallbackQueries(query),
      guardrail_flags: guardrailSnapshot.guardrail_flags,
      error: "No readable web sources were retrieved.",
      runtimeTrace: {
        schemaVersion: 2,
        runId,
        createdAt,
        cacheKey,
        domainDecision,
        queryUnderstandingDecision,
        guardrails: guardrailSnapshot,
        config: jsonSnapshot(config),
        activeConfig: jsonSnapshot(activeConfig),
        localPages: localPageTrace,
        turns: traceTurns,
        final: {
          outcome: "no_readable_sources",
          queryHash: hashResearchQuery(query),
          versionSummary: versionCoverage,
          evidenceState: finalEvidenceState,
        },
      },
    };
    await logResearchEvent("research_end", emptyResult);
    return emptyResult;
  }

  emit("synthesis", `Synthesizing ${mergedPages.length} sources...`);
  const synthesis = await synthesizeResearch(query, mergedPages, ctx, signal);
  const sources = prioritizeSourceEntries(synthesis.sources.map((source) => ({
    ...source,
    ...(source.number ? {} : { number: undefined }),
  })), query);
  const confidence = buildConfidenceSummary(mergedPages, { conflictDetected, followupRounds });
  const codeBlocks = [...new Set(allCodeBlocks)].slice(0, 5);
  const sourceTypes = [...new Set(sources.map((source) => source.sourceType).filter(Boolean))];
  const openSubQuestions = sufficiency.openSubQuestions.length ? sufficiency.openSubQuestions : (sufficiency.sufficient ? subqueries.slice(0, Math.min(3, subqueries.length)) : []);

  const factCheck = factCheckAnswer(synthesis.answer, mergedPages);
  const unverifiedRatio = synthesis.answer ? factCheck.unverifiedClaims.length / Math.max(1, factCheck.verifiedClaims.length + factCheck.unverifiedClaims.length) : 0;
  const normalizedResult = createResearchResult({
    answer: synthesis.answer,
    bullets: synthesis.bullets,
    citations: synthesis.citations || [],
    sources,
    codeBlocks,
    sufficient: sufficiency.sufficient && unverifiedRatio <= 0.2 && (!shouldRequireAuthoritativeSources(activeConfig) || sufficiency.authoritativeSourcesFound),
    missingAspects: sufficiency.missingAspects,
    openSubQuestions,
    conflictSummary: conflictSummary || sufficiency.conflictSummary || "",
    confidence: sufficiency.confidenceScore,
    sourceTypes,
    unverifiedClaims: factCheck.unverifiedClaims,
    meta: {
      turns: followupRounds + 1,
      sitesVisited: mergedPages.length,
      totalFetchTimeMs: Date.now() - startedAt,
      cacheHit: false,
      versionContext,
      versionCoverage,
      queryUnderstanding: queryUnderstandingDecision.final,
    },
  });

  const conflictState = conflictDetected ? (mergedPages.some((page) => page.authoritative) ? "minor" : "severe") : "none";
  const followupSourcesMeta = sourceMetaFromSources(finalEvidenceState.sources);
  const result = {
    ok: true,
    action: "web_research",
    outcome: normalizedResult.sufficient ? "sufficient" : "partial_success",
    reason: "success",
    query,
    mode: config.mode,
    subqueries,
    followupRounds,
    followupQuery,
    conflictDetected,
    conflictSummary: normalizedResult.conflictSummary,
    conflictingSourcePairs,
    pagesRead: mergedPages.length,
    answer: normalizedResult.answer,
    bullets: normalizedResult.bullets,
    citations: normalizedResult.citations,
    sources: normalizedResult.sources,
    sourceTypes,
    guardrail_flags: guardrailSnapshot.guardrail_flags,
    codeBlocks: normalizedResult.codeBlocks,
    format: config.format,
    confidence,
    meta: normalizedResult.meta,
    confidenceScore: sufficiency.confidenceScore,
    authoritativeSourcesFound: sufficiency.authoritativeSourcesFound,
    sufficient: normalizedResult.sufficient,
    followupRecommended: !normalizedResult.sufficient,
    openSubQuestions: normalizedResult.openSubQuestions,
    missingAspects: normalizedResult.missingAspects,
    unverifiedClaims: normalizedResult.unverifiedClaims,
    contentText: formatResultText({ answer: normalizedResult.answer, bullets: normalizedResult.bullets, sources: normalizedResult.sources, confidence }, config.format),
    ...(config.rawPages ? {
      pageTexts: mergedPages.map((page) => ({
        url: page.url,
        title: page.title,
        text: page.fullText || page.text || "",
        sourceType: page.sourceType || classifySourceType(page.url, page.title || ""),
        codeBlocks: Array.isArray(page.codeBlocks) ? page.codeBlocks.slice(0, 5) : [],
        publishDate: page.publishDate || null,
      })),
    } : {}),
    runtimeTrace: {
      schemaVersion: 2,
      runId,
      createdAt,
      cacheKey,
      queryHash: hashResearchQuery(query),
      domainDecision,
      queryUnderstandingDecision,
      guardrails: guardrailSnapshot,
      config: jsonSnapshot(config),
      activeConfig: jsonSnapshot(activeConfig),
      localPages: localPageTrace,
      turns: traceTurns,
      final: {
        subqueries: [...subqueries],
        followupRounds,
        followupQuery,
        followupRecommended: !normalizedResult.sufficient,
        followupAction: traceTurns.at(-1)?.followup?.action || null,
        conflictState,
        followupInput: followupSourcesMeta,
        versionSummary: versionCoverage,
        sourceSummary: buildTraceSourceSummary(query, mergedPages),
        evidenceState: finalEvidenceState,
        mergedPages: mergedPages.map(snapshotPageForTrace),
        outputSources: normalizedResult.sources.map((source) => ({ ...source })),
        synthesis: {
          answer: normalizedResult.answer,
          bullets: [...normalizedResult.bullets],
          citations: [...normalizedResult.citations],
          confidence,
          confidenceScore: sufficiency.confidenceScore,
          sufficient: normalizedResult.sufficient,
          authoritativeSourcesFound: Boolean(sufficiency.authoritativeSourcesFound),
          conflictDetected,
          conflictSummary: normalizedResult.conflictSummary,
          missingAspects: [...normalizedResult.missingAspects],
          openSubQuestions: [...normalizedResult.openSubQuestions],
          unverifiedClaims: [...normalizedResult.unverifiedClaims],
        },
      },
    },
  };

  setResearchMemory(cacheKey, result);

  // Slim cache entry: strip runtimeTrace, contentText, pageTexts (bloat)
  const { runtimeTrace: _rt, contentText: _ct, pageTexts: _pt, ...slimResult } = result;
  slimResult.sources = (slimResult.sources || []).map(({ title, url, sourceType }) => ({ title, url, sourceType }));
  writeCachedResult(cacheKey, slimResult, config.cacheTtlMs);
  // Also write under topic key (strips years, versions, site:, GitHub paths)
  // so similar future queries get a cache hit even without exact match.
  const topicKey = topicCacheKey(query, config);
  if (topicKey !== cacheKey) {
    writeCachedResult(topicKey, slimResult, config.cacheTtlMs);
  }
  writeDevCacheResult(cacheKey, result);  // full result for training
  await logResearchEvent("research_end", result);
  return result;
}

export { compactResearchPayload, clearResearchMemory };
