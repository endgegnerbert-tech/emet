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
import { inferOfficialTargets, matchesOfficialTarget } from "./official-targets.js";

export function inferAllowedSources(config) {
  if (!Array.isArray(config.allowedSources) || config.allowedSources.length === 0) return null;
  return new Set(config.allowedSources.map((value) => String(value).toLowerCase()));
}

function normalizeHostname(value = "") {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function looksLikeHostConstraint(value = "") {
  const normalized = normalizeHostname(value);
  return normalized === "localhost" || /^[a-z0-9.-]+(?::\d+)?$/.test(normalized) && (normalized.includes(".") || normalized.includes(":"));
}

function parseSourceConstraint(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) {
    try {
      const parsed = new URL(raw);
      return {
        host: normalizeHostname(parsed.hostname),
        pathPrefix: parsed.pathname && parsed.pathname !== "/" ? parsed.pathname.replace(/\/+$/, "") : "",
      };
    } catch {
      return null;
    }
  }

  const normalized = raw.replace(/^www\./, "").replace(/\/$/, "");
  if (normalized.includes("/")) {
    const [host, ...parts] = normalized.split("/");
    if (!looksLikeHostConstraint(host)) return null;
    return {
      host: normalizeHostname(host),
      pathPrefix: parts.length ? `/${parts.join("/")}`.replace(/\/+$/, "") : "",
    };
  }

  if (!looksLikeHostConstraint(normalized)) return null;
  return { host: normalizeHostname(normalized), pathPrefix: "" };
}

function matchesSourceConstraint(url, constraint) {
  try {
    const parsed = new URL(url);
    const hostname = normalizeHostname(parsed.hostname);
    if (!(hostname === constraint.host || hostname.endsWith(`.${constraint.host}`))) return false;
    if (!constraint.pathPrefix) return true;
    const pathname = parsed.pathname.toLowerCase();
    const pathPrefix = constraint.pathPrefix.toLowerCase();
    return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`);
  } catch {
    return false;
  }
}

export function matchesAllowedHosts(url, config = {}) {
  const allowedHosts = inferAllowedHosts(config);
  return !allowedHosts || allowedHosts.some((constraint) => matchesSourceConstraint(url, constraint));
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a === 0;
}

function isPrivateOrInternalHost(hostname = "") {
  const host = String(hostname || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  return isPrivateIpv4(host);
}

export function inferAllowedHosts(config = {}) {
  const explicit = Array.isArray(config.hostAllowlist) ? config.hostAllowlist : [];
  const allowedSources = Array.isArray(config.allowedSources) ? config.allowedSources : [];
  const sourceConstraints = allowedSources.map(parseSourceConstraint).filter(Boolean);

  if (explicit.length > 0) return explicit.map(parseSourceConstraint).filter(Boolean);
  if (allowedSources.length > 0 && sourceConstraints.length === allowedSources.length) return sourceConstraints;
  return null;
}

export function filterBySourceOptions(result, config) {
  const allowedHosts = inferAllowedHosts(config);
  if (allowedHosts && !matchesAllowedHosts(result.url, config)) return false;
  if (allowedHosts) return true;

  const allowed = inferAllowedSources(config);
  if (!allowed) return true;
  const type = classifySourceType(result.url, result.title);
  if (allowed.has("official_docs") && type === "official_doc") return true;
  if (allowed.has("paper") && type === "paper") return true;
  if (allowed.has(type)) return true;
  try {
    const hostname = new URL(result.url).hostname.toLowerCase().replace(/^www\./, "");
    if (allowed.has(hostname)) return true;
  } catch {
    // ignore
  }
  return !allowedHosts;
}

export function isUrlAllowedBySourcePolicy(url, config = {}, title = "") {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (!config.allowPrivateNetwork && isPrivateOrInternalHost(parsed.hostname)) return false;
  } catch {
    return false;
  }
  if (!matchesAllowedHosts(url, config)) return false;
  if (Array.isArray(config.allowedSourceTypes) && config.allowedSourceTypes.length > 0) {
    const sourceType = classifySourceType(url, title);
    if (!config.allowedSourceTypes.includes(sourceType)) return false;
  }
  return true;
}

export function filterSearchResults(results, config = getResearchConfig()) {
  return results.filter((result) => {
    try {
      const hostname = new URL(result.url).hostname;
      if (hostname.includes("duckduckgo.com") || !result.snippet) return false;
      const sourceType = classifySourceType(result.url, result.title);
      if (Array.isArray(config.allowedSourceTypes) && config.allowedSourceTypes.length > 0 && !config.allowedSourceTypes.includes(sourceType)) return false;
      if (!filterBySourceOptions(result, config)) return false;
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
  const officialTargets = config.officialTargets || inferOfficialTargets(query);
  const cacheKey = `${query}::${config.resultsPerQuery}::${config.searchProvider || "ddg_html"}::${JSON.stringify({
    mode: config.mode || "",
    academicProviders: config.mode === "academic",
    allowedSourceTypes: config.allowedSourceTypes || [],
    allowedSources: config.allowedSources || [],
    hostAllowlist: config.hostAllowlist || [],
    preferRecent: config.preferRecent || false,
    minYear: config.minYear || "",
    maxYear: config.maxYear || "",
  })}`;
  const cached = config.isolate ? null : getCacheValue(searchCache, cacheKey);
  if (cached) {
    await logResearchEvent("search_results_summary", { query, outcome: "cache_hit", reason: "cache_hit", sourceCount: cached.length, provider: "memory" });
    return cached;
  }

  const directResults = filterSearchResults(officialTargets.directResults || [], config)
    .filter((result) => !officialTargets.failClosed || matchesOfficialTarget(result.url, officialTargets));
  if (officialTargets.failClosed && directResults.length > 0) {
    const rankedDirect = rankSearchResults(directResults, query, config.resultsPerQuery, config);
    await logResearchEvent("search_results_summary", {
      query,
      provider: "official_targets",
      providerOrder: ["official_targets"],
      outcome: "success",
      reason: "direct_official_target",
      rawResultCount: directResults.length,
      candidatesBeforeDedup: directResults.length,
      finalRankedSetSize: rankedDirect.length,
      sourceCount: rankedDirect.length,
    });
    return config.isolate ? rankedDirect : setCacheValue(searchCache, cacheKey, rankedDirect, SEARCH_CACHE_TTL_MS);
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
      if (officialTargets.failClosed) {
        results = results.filter((result) => matchesOfficialTarget(result.url, officialTargets));
      }
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
    results = [...results, ...filterSearchResults(academic, config)];
  }

  const mergedResults = [...directResults, ...results];
  const candidatesBeforeDedup = mergedResults.length;
  const ranked = rankSearchResults(mergedResults, query, config.resultsPerQuery, config);
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
