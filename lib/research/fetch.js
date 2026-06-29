// Page fetch functions. Layer: platform/adapter.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { normalizeUrl, scoreSourceEntry, selectRelevantChunks, classifySourceType, buildJinaReaderUrl, rankFetchedPages, prioritizeSourceEntries, normalizePaperTitle, extractCodeBlocks, extractPageSnapshot } from "../research.js";
import { getResearchConfig } from "./config.js";
import { MIN_PAGE_TEXT, SEARCH_CACHE_TTL_MS, PAGE_CACHE_TTL_MS, EXPENSIVE_PAGE_CACHE_TTL_MS, getCacheValue, setCacheValue, pageCacheTtl, searchCache, pageCache } from "./cache.js";
import { USER_AGENTS, randomUserAgent, resolvePageTimeout, withTimeoutSignal, isTransientStatus, isRetryableFetchError, fetchFailureReason, contentFailureReason, summarizeFetchedPage, sleep, fetchTextWithRetry } from "./helpers.js";
import { pageFetchAdapter } from "../page-fetch-adapter.js";
import { extractPdfText, isPdfUrl } from "../pdf-extractor.js";
import { resolveDomainSelection } from "../domains/index.js";
import { extractVersionContext } from "../version-context.js";
import { annotateVersionSignals, hashText, snapshotPageForTrace } from "../research-trace.js";
import { pageQualitySignals, isUsableContent } from "../research-policy.js";
import { isUrlAllowedBySourcePolicy } from "./search.js";

import { logResearchEvent } from "../local-logger.js";
import { readPageSnapshot, writePageSnapshot } from "../research-memory.js";
import { extractLastModified, extractPublishDate } from "../research.js";

function redactLocalPath(path = "") {
  return `[local-file:${hashText(String(path || "")).slice(0, 10)}:${basename(String(path || ""))}]`;
}

function recordFetchDiagnostic(config = {}, url, reason, extra = {}) {
  if (!Array.isArray(config.fetchDiagnostics)) return;
  config.fetchDiagnostics.push({
    url,
    reason,
    ...extra,
  });
}

export function shouldSkipUrl(url) {
  return /(\/login|\/signin|\/sign-in|\/account|\/subscribe|\/checkout)/i.test(url);
}

export function shouldUseJinaFirst(url) {
  try {
    return /(^|\.)medium\.com$|(^|\.)dev\.to$|(^|\.)substack\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function pageFromText(title, url, text, config, extra = {}) {
  const full = String(text || "");
  const trimmed = full.slice(0, config.pageTextLimit).trim();
  if (trimmed.length < config.minPageText) return null;
  return { title, url, text: trimmed, fullText: full, codeBlocks: extractCodeBlocks(text), ...extra };
}

export async function fetchJinaPageSource(url, signal, config) {
  if (!config.useJinaFallback || shouldSkipUrl(url)) return null;
  const readerUrl = buildJinaReaderUrl(url);
  if (!isUrlAllowedBySourcePolicy(url, config) || !isUrlAllowedBySourcePolicy(readerUrl, config)) {
    await logResearchEvent("fetch_skip", { url, readerUrl, outcome: "skipped", reason: "source_policy_jina" });
    return null;
  }
  try {
    const response = await fetchTextWithRetry(readerUrl, signal, 2, {}, config.pageTimeoutMs);
    if (!isUrlAllowedBySourcePolicy(response.url || readerUrl, config)) return null;
    const body = await response.text();
    const firstLine = body.split("\n").find((line) => line.trim().replace(/^#+\s*/, ""));
    const title = firstLine ? firstLine.trim().replace(/^#+\s*/, "") : url;
    return pageFromText(title, url, body, config, { sourceType: classifySourceType(url, title), fetchStatus: 200, contentType: "text/plain" });
  } catch {
    return null;
  }
}

export function withinTimeframe(page, config) {
  if (!config.minYear && !config.maxYear && !config.preferRecent) return true;
  const year = page.publishDate ? Number(String(page.publishDate).slice(0, 4)) : null;
  if (config.minYear && year && year < config.minYear) return false;
  if (config.maxYear && year && year > config.maxYear) return false;
  return true;
}

export function finalizeFetchedPage(page, config, meta = {}) {
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
  if (!isUrlAllowedBySourcePolicy(url, config)) {
    recordFetchDiagnostic(config, url, "source_policy");
    await logResearchEvent("fetch_skip", { url, outcome: "skipped", reason: "source_policy" });
    return null;
  }
  if (shouldSkipUrl(url)) {
    recordFetchDiagnostic(config, url, "blocked_url");
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
  const cached = config.isolate ? null : (getCacheValue(pageCache, cacheKey) || readPageSnapshot(url));
  if (cached) {
    if (!isUrlAllowedBySourcePolicy(cached.url || url, config, cached.title || "")) {
      recordFetchDiagnostic(config, url, "source_policy_cache", { finalUrl: cached.url || url });
      await logResearchEvent("fetch_skip", { url, cacheKey, outcome: "skipped", reason: "source_policy_cache" });
      return null;
    }
    const validated = finalizeFetchedPage(cached, config, { url: cached.url || url, contentType: "text/html" });
    if (!validated) {
      recordFetchDiagnostic(config, url, "blocked_or_placeholder_cache");
      await logResearchEvent("fetch_skip", { url, cacheKey, outcome: "skipped", reason: "blocked_page" });
      return null;
    }
    if (!withinTimeframe(validated, config)) {
      recordFetchDiagnostic(config, url, "timeframe_cache");
      await logResearchEvent("fetch_skip", { url, cacheKey, outcome: "skipped", reason: "timeframe_cache" });
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
      const page = config.isolate ? first : writePageSnapshot(setCacheValue(pageCache, cacheKey, first, pageCacheTtl(first)), pageCacheTtl(first));
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

    if (!isUrlAllowedBySourcePolicy(response.url || url, config)) {
      recordFetchDiagnostic(config, url, "source_policy_redirect", { finalUrl: response.url || url });
      await logResearchEvent("fetch_end", { url, finalUrl: response.url || url, outcome: "hard_failure", reason: "source_policy_redirect", success: false, statusCode: response.status ?? 200, latencyMs: Date.now() - fetchStartedAt });
      return null;
    }

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
          lastModified: extractLastModified(pdfResult.text.slice(0, 2000), response.headers.get("last-modified") || ""),
          fetchStatus: 200,
          contentType: "application/pdf",
        });
        const final = finalizeFetchedPage(page, config, { url: response.url || url, status: 200, contentType: "application/pdf" });
        if (final && !isUrlAllowedBySourcePolicy(final.url || response.url || url, config, final.title || "")) {
          recordFetchDiagnostic(config, url, "source_policy_redirect", { finalUrl: final.url || response.url || url, contentType: "application/pdf" });
          await logResearchEvent("fetch_end", { url, finalUrl: final.url || response.url || url, via: "pdf_extraction", outcome: "hard_failure", reason: "source_policy_redirect", success: false, statusCode: response.status ?? 200, contentType: "application/pdf", latencyMs: Date.now() - fetchStartedAt });
          return null;
        }
        const stored = final && withinTimeframe(final, config)
          ? (config.isolate ? final : writePageSnapshot(setCacheValue(pageCache, cacheKey, final, pageCacheTtl(final)), pageCacheTtl(final)))
          : null;
        await logResearchEvent("fetch_end", { url, via: "pdf_extraction", outcome: stored ? "success" : "hard_failure", reason: stored ? "success" : contentFailureReason(final, config), success: Boolean(stored), statusCode: response.status ?? 200, contentType: "application/pdf", retryCount: response.__emetFetchMeta?.retryCount || 0, latencyMs: Date.now() - fetchStartedAt, page: summarizeFetchedPage(stored) });
        if (!stored) recordFetchDiagnostic(config, url, contentFailureReason(final, config), { contentType: "application/pdf" });
        return stored;
      }
      recordFetchDiagnostic(config, url, "pdf_extract_failed", { contentType: "application/pdf" });
      await logResearchEvent("fetch_end", { url, via: "pdf_extraction", outcome: "hard_failure", reason: "pdf_extract_failed", success: false, statusCode: response.status ?? 200, contentType: "application/pdf", retryCount: response.__emetFetchMeta?.retryCount || 0, latencyMs: Date.now() - fetchStartedAt });
    }

    if (contentType.includes("application/json") || contentType.includes("+json")) {
      const body = await response.text();
      const page = pageFromText(response.url || url, response.url || url, body, config, {
        publishDate: extractPublishDate(body),
        lastModified: extractLastModified(body, response.headers.get("last-modified") || ""),
        sourceType: classifySourceType(response.url || url, response.url || url),
        fetchStatus: response.status ?? 200,
        contentType,
      });
      const finalPage = finalizeFetchedPage(page, config, { url: response.url || url, status: response.status ?? 200, contentType });
      const stored = finalPage && withinTimeframe(finalPage, config)
        ? (config.isolate ? finalPage : writePageSnapshot(setCacheValue(pageCache, cacheKey, finalPage, pageCacheTtl(finalPage)), pageCacheTtl(finalPage)))
        : null;
      await logResearchEvent("fetch_end", { url, via: "json", outcome: stored ? "success" : "hard_failure", reason: stored ? "success" : contentFailureReason(finalPage, config), success: Boolean(stored), statusCode: response.status ?? 200, contentType, retryCount: response.__emetFetchMeta?.retryCount || 0, latencyMs: Date.now() - fetchStartedAt, page: summarizeFetchedPage(stored) });
      if (!stored) recordFetchDiagnostic(config, url, contentFailureReason(finalPage, config), { contentType, statusCode: response.status ?? 200 });
      return stored;
    }

    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      const fallback = finalizeFetchedPage(await fetchJinaPageSource(url, signal, config), config, { url, contentType });
      if (fallback && withinTimeframe(fallback, config)) {
        const page = config.isolate ? fallback : writePageSnapshot(setCacheValue(pageCache, cacheKey, fallback, pageCacheTtl(fallback)), pageCacheTtl(fallback));
        await logResearchEvent("fetch_end", { url, via: "unsupported_content_type_fallback", outcome: "fallback_success", reason: "success", success: Boolean(page), contentType, fallbackUsed: true, latencyMs: Date.now() - fetchStartedAt, page: summarizeFetchedPage(page) });
        return page;
      }
      recordFetchDiagnostic(config, url, "unsupported_content_type", { contentType });
      await logResearchEvent("fetch_end", { url, outcome: "hard_failure", success: false, reason: "unsupported_content_type", contentType, fallbackUsed: true, latencyMs: Date.now() - fetchStartedAt });
      return null;
    }

    const body = await response.text();
    const snapshot = await extractPageSnapshot(body, response.url || url);
    let page = pageFromText(snapshot.title, snapshot.url, snapshot.text, config, {
      publishDate: extractPublishDate(body),
      lastModified: extractLastModified(body, response.headers.get("last-modified") || ""),
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
    if (finalPage && !isUrlAllowedBySourcePolicy(finalPage.url || response.url || url, config, finalPage.title || "")) {
      recordFetchDiagnostic(config, url, "source_policy_redirect", { finalUrl: finalPage.url || response.url || url, contentType });
      await logResearchEvent("fetch_end", { url, finalUrl: finalPage.url || response.url || url, outcome: "hard_failure", reason: "source_policy_redirect", success: false, statusCode: response.status ?? 200, contentType, latencyMs: Date.now() - fetchStartedAt, assessment });
      return null;
    }
    const stored = finalPage && withinTimeframe(finalPage, config)
      ? (config.isolate ? finalPage : writePageSnapshot(setCacheValue(pageCache, cacheKey, finalPage, pageCacheTtl(finalPage)), pageCacheTtl(finalPage)))
      : null;
    await logResearchEvent("fetch_end", { url, outcome: stored ? (page ? "success" : "fallback_success") : "hard_failure", reason: stored ? "success" : contentFailureReason(finalPage || (assessment ? { quality: assessment } : null), config), success: Boolean(stored), statusCode: response.status ?? 200, contentType, fallbackUsed: !page, retryCount: response.__emetFetchMeta?.retryCount || 0, latencyMs: Date.now() - fetchStartedAt, page: summarizeFetchedPage(stored), assessment });
    if (!stored) recordFetchDiagnostic(config, url, contentFailureReason(finalPage || (assessment ? { quality: assessment } : null), config), { contentType, statusCode: response.status ?? 200 });
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
      ? (config.isolate ? fallback : writePageSnapshot(setCacheValue(pageCache, cacheKey, fallback, pageCacheTtl(fallback)), pageCacheTtl(fallback)))
      : null;
    await logResearchEvent("fetch_error", { url, outcome: stored ? "fallback_success" : "hard_failure", reason: stored ? "success" : fetchFailureReason(error), statusCode: error?.statusCode || null, retryCount: error?.retryCount || 0, latencyMs: Date.now() - fetchStartedAt, fallbackUsed: true, fallback: summarizeFetchedPage(stored), error });
    if (!stored) recordFetchDiagnostic(config, url, fetchFailureReason(error), { statusCode: error?.statusCode || null });
    return stored;
  }
}

export async function speculativeFetch(results, signal, config, query) {
  const target = Math.max(1, config.minSources || 1);
  const controllers = results.map(() => new AbortController());
  const abortAll = () => controllers.forEach((controller) => controller.abort());
  if (signal) signal.addEventListener("abort", abortAll, { once: true });

  let usableCount = 0;
  const pages = await Promise.all(results.map(async (result, index) => {
    const scopedSignal = signal ? AbortSignal.any([signal, controllers[index].signal]) : controllers[index].signal;
    const page = await fetchPageSource(result.url, scopedSignal, {
      ...config,
      query,
      minPageText: result.directOfficialTarget ? 1 : config.minPageText,
    });
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

export async function readLocalFiles(paths, config) {
  const pages = [];
  for (const path of paths) {
    const redactedPath = redactLocalPath(path);
    try {
      const text = await readFile(path, "utf8");
      const page = pageFromText(path.split("/").pop() || path, `file://${path}`, text, config, {
        sourceType: "file",
        publishDate: null,
        local: true,
      });
      await logResearchEvent("local_file_read", { path: redactedPath, success: Boolean(page), textLength: text.length, page: page ? { title: page.title, textLength: page.text.length } : null });
      if (page) pages.push(page);
    } catch (error) {
      await logResearchEvent("local_file_error", { path: redactedPath, error });
    }
  }
  return pages;
}
