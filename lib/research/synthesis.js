// Synthesis + webFetch. Layer: platform.
import { randomUUID } from "node:crypto";
import { complete } from "@mariozechner/pi-ai";
import { createResearchResult } from "../types.js";
import { buildConfidenceSummary, classifySourceType, compactResearchPayload, defaultMode, formatResearchResponse, normalizeResearchFreshness, scoreSourceEntry, buildJinaReaderUrl, detectConflictSignals, evaluateSufficiency, rankFetchedPages, prioritizeSourceEntries, normalizePaperTitle, extractCodeBlocks, extractPageSnapshot, factCheckAnswer, sourceMetaFromSources, normalizeUrl, selectRelevantChunks } from "../research.js";
import { getResearchConfig, resolveResearchModel } from "./config.js";
import { shouldRequireAuthoritativeSources } from "../research-output.js";
import { MIN_PAGE_TEXT, getCacheValue, setCacheValue, pageCacheTtl, pageCache } from "./cache.js";
import { USER_AGENTS, randomUserAgent, resolvePageTimeout, withTimeoutSignal, isRetryableFetchError, fetchFailureReason, contentFailureReason, summarizeFetchedPage, fetchTextWithRetry } from "./helpers.js";
import { pageFetchAdapter } from "../page-fetch-adapter.js";
import { extractPdfText, isPdfUrl } from "../pdf-extractor.js";
import { fetchPageSource, shouldUseJinaFirst, fetchJinaPageSource, withinTimeframe, finalizeFetchedPage, pageFromText, shouldSkipUrl, readLocalFiles } from "./fetch.js";
import { resolveDomainSelection } from "../domains/index.js";
import { extractVersionContext } from "../version-context.js";
import { annotateVersionSignals, hashText, snapshotPageForTrace } from "../research-trace.js";
import { pageQualitySignals, isUsableContent } from "../research-policy.js";

import { logResearchEvent } from "../local-logger.js";

export function fallbackSynthesis(query, pages) {
  const sources = prioritizeSourceEntries(pages.slice(0, Math.min(5, pages.length)).map((page, index) => {
    const scored = scoreSourceEntry(page, query);
    return {
      number: index + 1,
      title: page.title,
      url: page.url,
      freshness: normalizeResearchFreshness(undefined, page.publishDate),
      sourceType: page.sourceType,
      score: page.score,
      rankScore: page.score,
      authorityScore: Number(((scored.total + 10) / 45).toFixed(3)),
      qualityScore: typeof page.qualityScore === "number" ? page.qualityScore : undefined,
      versionMatchScore: typeof page.versionSignals?.score === "number" ? Number((page.versionSignals.score / 10).toFixed(3)) : undefined,
      engagementScore: page.signals?.platform ? page.score : undefined,
      authoritative: page.authoritative,
      publishDate: page.publishDate || null,
      lastModified: page.lastModified || null,
      createdAt: page.createdAt || page.signals?.createdAt || null,
      updatedAt: page.updatedAt || page.signals?.updatedAt || null,
      signals: page.signals,
      versionSignals: page.versionSignals,
    };
  }), query);

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
        const sources = prioritizeSourceEntries(sourceIds.map((id) => {
          const page = pages[id - 1];
          const scored = scoreSourceEntry(page, query);
          return {
            number: id,
            title: page.title,
            url: page.url,
            freshness: normalizeResearchFreshness(undefined, page.publishDate),
            sourceType: page.sourceType || classifySourceType(page.url, page.title),
            score: typeof page.score === "number" ? page.score : scored.total,
            rankScore: typeof page.score === "number" ? page.score : scored.total,
            authorityScore: Number(((scored.total + 10) / 45).toFixed(3)),
            qualityScore: typeof page.qualityScore === "number" ? page.qualityScore : undefined,
            versionMatchScore: typeof page.versionSignals?.score === "number" ? Number((page.versionSignals.score / 10).toFixed(3)) : undefined,
            engagementScore: page.signals?.platform ? page.score : undefined,
            authoritative: typeof page.authoritative === "boolean" ? page.authoritative : scored.authoritative,
            publishDate: page.publishDate || null,
            lastModified: page.lastModified || null,
            createdAt: page.createdAt || page.signals?.createdAt || null,
            updatedAt: page.updatedAt || page.signals?.updatedAt || null,
            signals: page.signals,
            versionSignals: page.versionSignals,
          };
        }), query);
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

