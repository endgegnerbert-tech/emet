// Main research pipeline — runWebResearch orchestrator.
// Layer: workbench — wires all layers together.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { complete } from "@mariozechner/pi-ai";
import { createResearchResult } from "../types.js";
import { resolveDomainSelection } from "../domains/index.js";
import { classifyQuestionDomain } from "../research-intent.js";
import { buildConfidenceSummary, buildFallbackQueries, buildFollowUpQuery, buildActionBasedFollowUpQuery, classifySourceType, compactResearchPayload, defaultMode, evaluateSufficiency, detectConflictSignals, extractCodeBlocks, extractPageSnapshot, factCheckAnswer, formatResearchResponse, normalizeUrl, normalizeResearchFreshness, prioritizeSourceEntries, scoreSourceEntry, selectRelevantChunks, buildJinaReaderUrl, sourceMetaFromSources } from "../research.js";
import { pageFetchAdapter } from "../page-fetch-adapter.js";
import { extractPdfText, isPdfUrl } from "../pdf-extractor.js";
import { isUsableContent, pageQualitySignals } from "../research-policy.js";
import { applyGuardrailsToResearchConfig, buildResearchGuardrails, resolveGuardrailedMinSources, snapshotGuardrails } from "../research-guardrails.js";
import { shouldRequireAuthoritativeSources } from "../research-output.js";
import { planResearch } from "../planner.js";
import { clearResearchMemory, getResearchMemory, hashResearchQuery, modeCacheKey, topicCacheKey, readCachedResult, setResearchMemory, writeCachedResult, writeDevCacheResult, readPageSnapshot, writePageSnapshot } from "../research-memory.js";
import { logResearchEvent } from "../local-logger.js";
import { extractSufficiencyStructuredFeaturesFromPages } from "../router-structured-features.js";
import { extractVersionContext, summarizeVersionCoverage } from "../version-context.js";
import { annotateVersionSignals, buildTraceSourceSummary, hashText, jsonSnapshot, snapshotPageForTrace, snapshotSearchResult } from "../research-trace.js";
import { buildEvidenceState, buildTurnEvidenceState } from "../research-evidence.js";
import { applyResearchPolicyControls, buildPolicyFollowUpQuery, decideResearchPolicyAction, summarizeResearchPolicyDecision } from "../research-next-action-policy.js";
import { resolveQueryUnderstandingPlanning } from "../query-understanding.js";
import { MIN_PAGE_TEXT, SEARCH_CACHE_TTL_MS, PAGE_CACHE_TTL_MS, EXPENSIVE_PAGE_CACHE_TTL_MS, MAX_SEARCH_CACHE, MAX_PAGE_CACHE, searchCache, pageCache, getCacheValue, setCacheValue, pageCacheTtl } from "./cache.js";
import { USER_AGENTS, randomUserAgent, resolvePageTimeout, withTimeoutSignal, isTransientStatus, isRetryableFetchError, fetchFailureReason, contentFailureReason, summarizeFetchedPage, sleep, fetchTextWithRetry } from "./helpers.js";
import { resolveResearchConfig, getResearchConfig, resolveResearchModel } from "./config.js";
import { buildQueries, planSubqueries, textFromCompletion, parseJsonBlock, completeWithResearchModel } from "./queries.js";
import { searchDuckDuckGo, searchArxiv, searchSemanticScholar, searchCrossref, filterSearchResults, filterBySourceOptions, inferAllowedSources, inferAllowedHosts, matchesAllowedHosts, sourceFromPaper } from "./search.js";
import { fetchPageSource, speculativeFetch, readLocalFiles, fetchJinaPageSource, shouldSkipUrl, shouldUseJinaFirst, pageFromText, withinTimeframe, finalizeFetchedPage } from "./fetch.js";
import { synthesizeResearch, fallbackSynthesis, webFetch } from "./synthesis.js";
import { resolveFlowPolicy } from "../research-flow.js";
import { runCommunityCheckpoint, runCommunitySearch, selectedCommunityPlatforms } from "../retrieval/community.js";
import {
  chooseTinyRouterDomain,
  classifyConflictWithTinyRouter,
  classifyDomainWithTinyRouter,
  classifyFollowupWithTinyRouter,
  classifyPreflightWithTinyRouter,
  classifyQueryUnderstandingWithTinyRouter,
  classifySufficiencyWithTinyRouter,
  resolveTinyRouterConfig,
  resolveTinyRouterSupportedDomains,
  applyConflictTinyRouterDecision,
  applySufficiencyTinyRouterDecision,
} from "../tiny-router.js";

import { rankFetchedPages, rankSearchResults } from "../research.js";

function normalizeResultUrl(value) {
  try { return normalizeUrl(value); } catch { return String(value || ""); }
}

async function mapWithConcurrency(items, limit, mapper) {
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, items.length || 1));
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

const tinyRouterSetupLogged = new Set();

export async function resolveQuestionDomain(query, mode, signal, guardrails = null, preflightPrediction = null) {
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


export function missingAspectFromStructuredDecision(decision) {
  if (decision === "need_authority") return "authoritative sources";
  if (decision === "need_more_sources") return "readable sources";
  if (decision === "need_primary_source") return "primary sources";
  if (decision === "need_recency") return "recent sources";
  if (decision === "need_version_context") return "version context";
  if (decision === "need_conflict_resolution") return "conflict resolution";
  if (decision === "ask_clarifying_question") return "clarifying context";
  return null;
}


export function withStructuredSufficiencyDecision(sufficiency, decision, query, seenUrls = []) {
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


export function formatResultText(result, format) {
  return formatResearchResponse({ answer: result.answer, bullets: result.bullets, sources: result.sources, confidence: result.confidence, format });
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
  let config = applyGuardrailsToResearchConfig(queryUnderstandingPlanning.config, guardrails);
  const flowPolicy = resolveFlowPolicy(query, config, guardrails, queryUnderstandingDecision.final || queryUnderstandingDecision);
  const communityPlatforms = selectedCommunityPlatforms(query, config, flowPolicy);
  const hasCommunityRetrieval = communityPlatforms.length > 0;
  if (flowPolicy.authorityRequired) config = { ...config, requireAuthoritative: true };
  if (Object.hasOwn(modeOptions, "maxTurns")) config = { ...config, _checkpointMaxTurns: modeOptions.maxTurns };
  const cacheKey = modeCacheKey(query, config);

  await logResearchEvent("query_understanding_decision", { query, mode: config.mode, domain, queryUnderstandingDecision });
  await logResearchEvent("research_flow_decision", { query, flowPolicy, platforms: communityPlatforms });
  await logResearchEvent("research_start", { query, mode: config.mode, domain, config, versionContext, queryUnderstandingDecision });

  if (flowPolicy.runMode === "checkpoint" && hasCommunityRetrieval && (!config.action || config.sessionId || config.action === "search" || config.action === "refine")) {
    return runCommunityCheckpoint(query, ctx, signal, onUpdate, config, flowPolicy);
  }

  if (!config.isolate && !config.force && !config.interactive && !hasCommunityRetrieval) {
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

    const [searchGroups, communitySearch] = await Promise.all([
      mapWithConcurrency(queriesThisTurn, activeConfig.concurrentQueries || 3, (subquery) => searchDuckDuckGo(subquery, signal, activeConfig)),
      hasCommunityRetrieval ? runCommunitySearch(queriesThisTurn[0] || query, communityPlatforms, activeConfig) : Promise.resolve({ results: [], gaps: [], raw: [] }),
    ]);
    const webResults = searchGroups.flat();
    const communityResults = communitySearch.results.map((result) => ({ ...result, community: true }));
    const flatResults = [...webResults, ...communityResults].map((result) => annotateVersionSignals(result, versionContext));
    turnTrace.searchResults = flatResults.map(snapshotSearchResult);
    turnTrace.community = hasCommunityRetrieval ? {
      platforms: communityPlatforms,
      resultCount: communitySearch.results.length,
      gaps: communitySearch.gaps,
    } : null;
    await logResearchEvent("search_results", {
      query,
      versionContext,
      queries: queriesThisTurn,
      communityPlatforms: hasCommunityRetrieval ? communityPlatforms : [],
      outcome: flatResults.length > 0 ? "success" : "empty",
      reason: flatResults.length > 0 ? "success" : "search_empty",
      rawResultCount: searchGroups.reduce((sum, group) => sum + group.length, 0) + communitySearch.results.length,
      postFilterResultCount: flatResults.length,
      sourceCount: flatResults.length,
      results: flatResults.map((result) => ({ title: result.title, url: result.url, snippet: result.snippet, sourceType: result.sourceType, publishDate: result.publishDate, versionSignals: result.versionSignals || null, signals: result.signals || null })),
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
    const resultByUrl = new Map(results.map((result) => [normalizeResultUrl(result.url), result]));
    const fetchedCandidates = activeConfig.mode === "fast"
      ? await speculativeFetch(results, signal, { ...activeConfig, minSources: activeConfig.minSources || 3 }, query)
      : await mapWithConcurrency(results, activeConfig.concurrentQueries || 3, (result) => fetchPageSource(result.url, signal, { ...activeConfig, query }));
    const strictHostFiltering = Boolean(inferAllowedHosts(activeConfig)?.length);
    const pageCandidates = fetchedCandidates.map((page) => {
      if (!page) return page;
      if (!filterBySourceOptions(page, activeConfig)) return null;
      const source = resultByUrl.get(normalizeResultUrl(page.url));
      const hostAllowlistMatched = strictHostFiltering && matchesAllowedHosts(page.url, activeConfig);
      if (!source?.community) {
        return {
          ...page,
          authoritative: hostAllowlistMatched ? true : page.authoritative,
          hostAllowlistMatched,
        };
      }
      return {
        ...page,
        sourceType: source.sourceType || page.sourceType,
        score: typeof source.score === "number" ? source.score : page.score,
        authoritative: hostAllowlistMatched ? true : false,
        hostAllowlistMatched,
        signals: source.signals,
        publishDate: page.publishDate || source.publishDate || source.signals?.createdAt || null,
        lastModified: page.lastModified || source.lastModified || source.signals?.updatedAt || null,
        createdAt: page.createdAt || source.signals?.createdAt || null,
        updatedAt: page.updatedAt || source.signals?.updatedAt || null,
      };
    });
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
    }).filter((page) => filterBySourceOptions(page, activeConfig) && withinTimeframe(page, activeConfig) && !page.quality?.blocked), query, activeConfig.maxPages, activeConfig);
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
    if (!sufficiency.sufficient && activeConfig.mode !== "fast" && mergedPages.length >= minSources && sufficiency.authoritativeSourcesFound && !conflictDetected && sufficiency.confidenceScore >= 0.75) {
      sufficiency = { ...sufficiency, sufficient: true, missingAspects: (sufficiency.missingAspects || []).filter((aspect) => aspect !== "authoritative sources") };
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

    const communitySourceCount = mergedPages.filter((page) => page.signals?.platform).length;
    if (flowPolicy.communityOnlyAllowed && communitySourceCount >= minSources && !conflictDetected) {
      sufficiency = {
        ...sufficiency,
        sufficient: true,
        missingAspects: (sufficiency.missingAspects || []).filter((aspect) => aspect !== "authoritative sources"),
      };
    }
    if (flowPolicy.authorityRequired && !sufficiency.authoritativeSourcesFound) {
      sufficiency = {
        ...sufficiency,
        sufficient: false,
        missingAspects: [...new Set([...(sufficiency.missingAspects || []), "authoritative sources"])],
      };
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
      action: "final",
      legacyAction: "web_research",
      retrievalClass: flowPolicy.retrievalBias,
      schemaVersion: 1,
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
    action: "final",
    legacyAction: "web_research",
    retrievalClass: flowPolicy.retrievalBias,
    schemaVersion: 1,
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
        lastModified: page.lastModified || null,
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


