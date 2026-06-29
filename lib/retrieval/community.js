// Community retrieval orchestration.
// Calls collectors and normalizes output; pipeline owns policy/sufficiency.
// I/O adapter: imports collectors, session state, and lower-layer research helpers.
// ponytail: flat functions, no pipeline framework.

import { getCollector } from "../collectors/index.js";
import { getOrCreateSession, DEFAULT_MAX_TURNS } from "../research-session.js";
import { inferQueryPlatforms } from "../research-flow.js";
import { shouldRequireAuthoritativeSources } from "../research-output.js";
import { normalizeCollectorResult, normalizeCollectorResults, buildCollectorGap } from "./normalize.js";
import { SEARCH_CACHE_TTL_MS, getCacheValue, setCacheValue, searchCache } from "../research/cache.js";
import { fetchPageSource } from "../research/fetch.js";
import { fetchTextWithRetry } from "../research/helpers.js";
import { synthesizeResearch } from "../research/synthesis.js";


const DEFAULT_COMMUNITY_PLATFORMS = ["hn", "github"];
const URL_SEEDED_PLATFORMS = new Set(["rss", "youtube"]);
const PLATFORM_ALIASES = new Map([
  ["hackernews", "hn"],
  ["hacker-news", "hn"],
  ["hacker news", "hn"],
  ["news.ycombinator", "hn"],
  ["news.ycombinator.com", "hn"],
  ["reddit.com", "reddit"],
  ["github.com", "github"],
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
]);

function normalizePlatformName(platform = "") {
  const value = String(platform || "").trim().toLowerCase();
  return PLATFORM_ALIASES.get(value) || value;
}

function normalizePlatforms(platforms = []) {
  return [...new Set((Array.isArray(platforms) ? platforms : [])
    .map(normalizePlatformName)
    .filter(Boolean))];
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isUrlSeededPlatform(platform) {
  return URL_SEEDED_PLATFORMS.has(String(platform || "").toLowerCase());
}

function platformSeedGap(platform) {
  return buildCollectorGap(platform, `${platform} requires an explicit URL seed`);
}

export function selectedCommunityPlatforms(query, config = {}, flowPolicy = {}) {
  if (Array.isArray(config.platforms) && config.platforms.length > 0) return normalizePlatforms(config.platforms);
  const inferred = inferQueryPlatforms(query);
  if (inferred?.length) return normalizePlatforms(inferred);
  return flowPolicy.retrievalBias === "community" || flowPolicy.retrievalBias === "mixed" ? DEFAULT_COMMUNITY_PLATFORMS : [];
}

function buildCommunityCollectorResults(sources, gaps = []) {
  const byPlatform = new Map();
  for (const source of sources) {
    const platform = source.signals?.platform || "community";
    if (!byPlatform.has(platform)) byPlatform.set(platform, { platform, available: true, resultCount: 0, results: [] });
    byPlatform.get(platform).results.push({
      id: source.id,
      title: source.title,
      url: source.url,
      snippet: source.snippet,
      score: source.score,
      signals: source.signals,
      sourceType: source.sourceType,
      fetchRecommended: Boolean(source.url),
    });
  }
  for (const entry of byPlatform.values()) entry.resultCount = entry.results.length;
  return [
    ...byPlatform.values(),
    ...gaps.map((gap) => ({ platform: gap.platform, available: false, resultCount: 0, reason: gap.reason, results: [] })),
  ];
}

function communityNextActions(session, sources, maxTurns, currentQuery, flowPolicy = {}) {
  const actions = [];
  if (sources.length) {
    actions.push({ action: "fetch", reason: "Fetch selected community/media results", options: { selectedResultIds: [] } });
    if (session.turn < maxTurns) actions.push({ action: "refine", reason: "Narrow community query", options: { queryOverride: `${currentQuery} specifics` } });
  } else {
    actions.push({ action: "refine", reason: "No community hits yet; broaden or restate the query", options: { queryOverride: `${currentQuery} discussion` } });
    if (flowPolicy.authorityRequired) actions.push({ action: "refine", reason: "Need authoritative follow-up if community stays thin", options: { queryOverride: `${currentQuery} official docs`, interactive: false } });
  }
  return actions;
}

function formatCommunityCheckpoint(query, collectorResults, gaps, nextActions) {
  const lines = [`## Community checkpoint: ${query}`];
  for (const group of collectorResults) {
    if (!group.available) {
      lines.push(`\n### ${group.platform} - unavailable (${group.reason || "unknown"})`);
      continue;
    }
    lines.push(`\n### ${group.platform} (${group.resultCount} results)`);
    for (const result of group.results.slice(0, 3)) lines.push(`- [${result.id}] ${result.title}`);
  }
  if (gaps.length) lines.push(`\n**Gaps:** ${gaps.map((gap) => gap.reason || gap.platform).join(", ")}`);
  if (nextActions.length) {
    lines.push("\n**Next actions:**");
    for (const action of nextActions) lines.push(`- **${action.action}:** ${action.reason}`);
  }
  return lines.join("\n");
}

function hnItemId(url = "", signals = {}) {
  if (signals?.objectID) return String(signals.objectID);
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "news.ycombinator.com") return parsed.searchParams.get("id");
  } catch {
    // ignore
  }
  return null;
}

function stripTags(text = "") {
  return String(text || "")
    .replace(/<p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function collectHnComments(item, lines = [], depth = 0) {
  if (!item || depth > 2) return lines;
  const text = stripTags(item.text || "");
  if (text) lines.push(`${item.author || "comment"}: ${text}`);
  for (const child of item.children || []) collectHnComments(child, lines, depth + 1);
  return lines;
}

async function fetchHnItemFromAlgolia(id, signal, config) {
  const response = await fetchTextWithRetry(`https://hn.algolia.com/api/v1/items/${encodeURIComponent(id)}`, signal, 2, {}, config.pageTimeoutMs || 8000);
  const item = await response.json();
  const title = item.title || `Hacker News item ${id}`;
  const comments = collectHnComments(item).slice(0, 40);
  const parts = [
    title,
    item.url ? `Linked URL: ${item.url}` : "",
    item.points != null ? `Points: ${item.points}` : "",
    item.author ? `Author: ${item.author}` : "",
    stripTags(item.text || ""),
    comments.length ? `Comments:\n${comments.join("\n")}` : "",
  ].filter(Boolean);
  return {
    url: `https://news.ycombinator.com/item?id=${id}`,
    title,
    text: parts.join("\n\n"),
    sourceType: "forum",
  };
}

function communityFetchConfig(config, currentQuery, fetchDiagnostics) {
  const strictHostPolicy = Array.isArray(config.hostAllowlist) && config.hostAllowlist.length > 0;
  return {
    ...config,
    mode: config.mode || "fast",
    isolate: true,
    query: currentQuery,
    fetchDiagnostics,
    ...(strictHostPolicy ? {} : {
      allowedSources: [],
      allowedSourceTypes: ["official_doc", "github_readme", "github_repo", "paper", "blog", "news", "forum", "other", "file"],
    }),
  };
}

export async function runCommunityCheckpoint(query, ctx, signal, onUpdate, config, flowPolicy) {
  const action = config.action || "search";
  const session = getOrCreateSession(config.sessionId, query, config._checkpointMaxTurns || DEFAULT_MAX_TURNS);
  const maxTurns = session.maxTurns;
  session.turn += 1;
  const currentQuery = config.queryOverride || query;
  if (session.turn > maxTurns) {
    return {
      ok: false,
      schemaVersion: 1,
      action: "search",
      retrievalClass: "community",
      sessionId: session.id,
      query: session.query,
      currentQuery,
      turn: session.turn,
      sufficient: false,
      missingAspects: ["turn budget"],
      error: `Max turns (${maxTurns}) exceeded`,
      contentText: "Session expired: max turns reached.",
    };
  }

  if (action === "fetch") return handleCollectorFetch(session, config, currentQuery);
  if (action === "synthesize") {
    const result = await handleCollectorSynthesize(session, config, currentQuery, ctx, signal);
    return result.ok ? { ...result, action: "final" } : result;
  }

  const platforms = Array.isArray(config.platforms) && config.platforms.length > 0
    ? normalizePlatforms(config.platforms)
    : (session.platforms || selectedCommunityPlatforms(query, config, flowPolicy));
  session.platforms = platforms;
  const community = await runCommunitySearch(currentQuery, platforms, config);
  const collectorResults = buildCommunityCollectorResults(community.results, community.gaps);
  session.collectorResults = action === "refine" ? session.collectorResults.concat(collectorResults) : collectorResults;
  session.sources = action === "refine" ? [...(session.sources || []), ...community.results] : community.results;
  const nextActions = communityNextActions(session, community.results, maxTurns, currentQuery, flowPolicy);
  const observedGaps = community.gaps.map((gap) => gap.reason || `${gap.platform} unavailable`);
  if (community.results.length < 3) observedGaps.push("too few results");

  return {
    ok: true,
    schemaVersion: 1,
    action: "search",
    retrievalClass: flowPolicy.retrievalBias === "mixed" ? "mixed" : "community",
    sessionId: session.id,
    turn: session.turn,
    query: session.query,
    currentQuery,
    sufficient: false,
    authoritativeSourcesFound: false,
    followupRecommended: flowPolicy.authorityRequired,
    missingAspects: flowPolicy.authorityRequired ? ["authoritative sources"] : [],
    observedGaps: [...new Set(observedGaps)],
    nextActions,
    sources: community.results,
    collectorResults,
    limits: { maxTurns, remainingTurns: Math.max(0, maxTurns - session.turn), maxResultsPerPlatform: config.maxResultsPerPlatform || 5 },
    contentText: formatCommunityCheckpoint(currentQuery, collectorResults, community.gaps, nextActions),
  };
}

async function handleCollectorFetch(session, config, currentQuery) {
  const maxUrls = Math.min(config.maxSites || 5, 10);
  const selections = [];
  if (config.selectedResultIds && config.selectedResultIds.length > 0) {
    for (const id of config.selectedResultIds) {
      for (const cr of session.collectorResults) {
        if (!cr.results) continue;
        const found = cr.results.find(r => r.id === id);
        if (found && found.url) selections.push(found);
      }
    }
  }
  if (selections.length === 0 && config.selectedUrls) {
    for (const u of config.selectedUrls) {
      try { new URL(u); selections.push({ url: u, title: u, signals: {} }); } catch { /* skip invalid */ }
    }
  }
  const pages = [];
  const fetchDiagnostics = [];
  const fetchCfg = communityFetchConfig(config, currentQuery, fetchDiagnostics);
  for (const selection of selections.slice(0, maxUrls)) {
    const url = selection.url;
    try {
      const hnId = hnItemId(url, selection.signals);
      const page = hnId
        ? await fetchHnItemFromAlgolia(hnId, undefined, fetchCfg)
        : await fetchPageSource(url, undefined, fetchCfg);
      if (page && page.text) {
        pages.push({ url: page.url, title: page.title, text: page.text.slice(0, 1000), sourceType: page.sourceType || "web" });
      }
    } catch { /* skip unreadable */ }
  }
  session.fetchedPages = session.fetchedPages.concat(pages);
  const nextActions = pages.length > 0
    ? [
        { action: "synthesize", reason: pages.length + " pages fetched; ready for synthesis" },
        { action: "refine", reason: "Refine based on what was learned", options: { queryOverride: currentQuery + " context" } },
      ]
    : [
        { action: "refine", reason: "No selected pages were readable; broaden the query or choose different results", options: { queryOverride: currentQuery + " context" } },
      ];
  const contentText = "Fetched " + pages.length + "/" + selections.length + " pages.\n\n" +
    pages.map(p => "- **" + p.title + "** (" + p.url + "): " + (p.text ? p.text.slice(0, 200) : "") + "...").join("\n") +
    (pages.length > 0 ? "\n\n**Next:** synthesize or refine." : "\n\n**Next:** refine or select different results.");
  return {
    ok: true, action: "fetch", retrievalClass: "community", schemaVersion: 1, sessionId: session.id,
    query: session.query, currentQuery, turn: session.turn,
    pages: pages.map(p => ({ url: p.url, title: p.title, sourceType: p.sourceType, previewLength: p.text ? p.text.length : 0 })),
    fetchDiagnostics,
    nextActions, contentText,
  };
}

async function handleCollectorSynthesize(session, config, currentQuery, ctx, signal) {
  if (session.fetchedPages.length === 0) {
    const maxSites = config.maxSites || 5;
    const recommended = [];
    for (const cr of session.collectorResults) {
      if (!cr.results) continue;
      for (const r of cr.results) if (r.fetchRecommended && r.url) recommended.push(r.url);
    }
    const fetchCfg = communityFetchConfig(config, currentQuery);
    for (const url of recommended.slice(0, maxSites)) {
      try {
        const page = await fetchPageSource(url, undefined, fetchCfg);
        if (page && page.text) {
          session.fetchedPages.push({ url: page.url, title: page.title, text: page.text, sourceType: page.sourceType || "web" });
        }
      } catch { /* skip */ }
    }
  }
  if (session.fetchedPages.length === 0) {
    return {
      ok: false, action: "synthesize", retrievalClass: "community", schemaVersion: 1, sessionId: session.id,
      query: session.query, currentQuery, turn: session.turn,
      error: "No pages to synthesize", contentText: "No pages available. Run search and fetch first.",
    };
  }
  const synthesis = await synthesizeResearch(currentQuery || session.query,
    session.fetchedPages.map(p => ({ ...p, score: 10, authoritative: false })), ctx, signal);
  const requireAuth = shouldRequireAuthoritativeSources(config) &&
    session.fetchedPages.every(p => p.sourceType !== "official_doc");
  const result = {
    ok: true, action: "synthesize", retrievalClass: "community", schemaVersion: 1, sessionId: session.id,
    query: session.query, currentQuery, turn: session.turn,
    answer: synthesis.answer, bullets: synthesis.bullets || [],
    citations: synthesis.citations || [],
    sources: synthesis.sources || session.fetchedPages.map(p => ({ title: p.title, url: p.url, sourceType: p.sourceType })),
    sufficient: synthesis.sufficient !== false && !requireAuth,
    authoritativeSourcesFound: !requireAuth,
    followupRecommended: requireAuth || synthesis.sufficient === false,
    contentText: synthesis.answer || "Synthesis complete.",
    missingAspects: requireAuth ? ["authoritative sources"] : [],
    nextActions: requireAuth ? [{ action: "refine", reason: "Need authoritative sources", options: { queryOverride: (currentQuery || session.query) + " official docs" } }] : [],
  };
  return result;
}

// ---------------------------------------------------------------------------
// Public: runCommunitySearch (used by retrieval layer)
// ---------------------------------------------------------------------------

export async function runCommunitySearch(query, platforms, options = {}) {
  platforms = normalizePlatforms(platforms);
  const maxResults = options.maxResultsPerPlatform || 5;
  const cacheKey = `${query}::${platforms.join(",")}::${maxResults}`;
  const cached = options.isolate ? null : getCacheValue(searchCache, `community:${cacheKey}`);
  if (cached) return cached;

  const settled = await Promise.all(platforms.map(async (platform) => {
    if (isUrlSeededPlatform(platform) && !isHttpUrl(query)) {
      return { gap: platformSeedGap(platform) };
    }

    const collector = getCollector(platform);

    if (!collector) {
      return { gap: buildCollectorGap(platform, "Collector not in registry") };
    }

    const avail = collector.checkAvailability();
    if (!avail.available) {
      return { gap: buildCollectorGap(platform, avail.reason || "Unavailable") };
    }

    try {
      const collectorResult = await collector.search(query, { limit: maxResults });
      const normalized = normalizeCollectorResults(platform, collectorResult);
      return {
        normalized: normalized.normalized,
        raw: {
          platform,
          available: true,
          resultCount: normalized.resultCount,
          results: collectorResult.results || [],
          meta: collectorResult.meta || {},
        },
      };
    } catch (error) {
      return { gap: buildCollectorGap(platform, error.message || "Search error") };
    }
  }));

  const result = {
    results: settled.flatMap((entry) => entry.normalized || []),
    gaps: settled.flatMap((entry) => entry.gap ? [entry.gap] : []),
    raw: settled.flatMap((entry) => entry.raw ? [entry.raw] : []),
  };
  return options.isolate ? result : setCacheValue(searchCache, `community:${cacheKey}`, result, SEARCH_CACHE_TTL_MS);
}
