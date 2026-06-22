// Search functions. Layer: platform/adapter.
import { normalizeUrl, extractDuckDuckGoLiteResults, extractDuckDuckGoResults, extractJinaSearchResults, rankSearchResults, classifySourceType, extractPublishDate, normalizeResearchFreshness, buildJinaReaderUrl, defaultMode, sourceMetaFromSources, scoreSourceEntry } from "../research.js";
import { getResearchConfig } from "./config.js";
import { MIN_PAGE_TEXT, SEARCH_CACHE_TTL_MS, getCacheValue, setCacheValue, searchCache } from "./cache.js";
import { USER_AGENTS, randomUserAgent, withTimeoutSignal, isTransientStatus, isRetryableFetchError, fetchFailureReason, contentFailureReason, sleep, fetchTextWithRetry } from "./helpers.js";
import { annotateVersionSignals } from "../research-trace.js";
import { extractVersionContext } from "../version-context.js";
import { pageFetchAdapter } from "../page-fetch-adapter.js";
import { readFile } from "node:fs/promises";

import { logResearchEvent } from "../local-logger.js";
import { normalizePaperTitle } from "../research.js";

export function inferAllowedSources(config) {
  if (!Array.isArray(config.allowedSources) || config.allowedSources.length === 0) return null;
  return new Set(config.allowedSources.map((value) => String(value).toLowerCase()));
}

export function filterBySourceOptions(result, config) {
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

export function filterSearchResults(results, config = getResearchConfig()) {
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

export function sourceFromPaper(title, url, snippet, publishDate) {
  return { title: normalizePaperTitle(title), url, snippet, publishDate, sourceType: "paper" };
}

export async function searchArxiv(query, signal, config) {
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

export async function searchSemanticScholar(query, signal, config) {
  try {
    const response = await fetchTextWithRetry(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${config.resultsPerQuery}&fields=title,abstract,url,year`, signal, 2, {}, config.pageTimeoutMs);
    const data = await response.json();
    return (data?.data || []).map((item) => sourceFromPaper(item.title, item.url || `https://www.semanticscholar.org/search?q=${encodeURIComponent(item.title)}`, item.abstract || "", item.year ? `${item.year}-01-01` : null)).filter((item) => item.title);
  } catch (error) {
    await logResearchEvent("search_error", { provider: "semanticscholar", query, reason: fetchFailureReason(error), outcome: "hard_failure", statusCode: error?.statusCode || null, retryCount: error?.retryCount || 0, latencyMs: error?.latencyMs || null, error });
    return [];
  }
}

export async function searchCrossref(query, signal, config) {
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

