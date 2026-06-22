// Community retrieval orchestration — collector-backed interactive mode.
// Calls collectors, normalizes output, manages sessions.
// I/O adapter: imports collectors, session state, and web-research internals.
// ponytail: flat functions, no pipeline framework.

import { getCollector } from "../collectors/index.js";
import { getOrCreateSession, COLLECTOR_MAX_TURNS_DEFAULT } from "../research-session.js";
import { inferQueryPlatforms } from "../research-flow.js";
import { normalizeCollectorResults, buildCollectorGap } from "./normalize.js";

// ---------------------------------------------------------------------------
// Public: shouldRunCollectorInteractive
// ---------------------------------------------------------------------------

export function shouldRunCollectorInteractive(query, config) {
  if (config.platforms && config.platforms.length > 0) return true;
  if (config.interactive) return true;
  return !!inferQueryPlatforms(query);
}

// ---------------------------------------------------------------------------
// Public: runCollectorInteractive — main entry
// ---------------------------------------------------------------------------

/**
 * Run collector-backed interactive research.
 * Delegates to handleCollectorSearch/handleCollectorFetch/handleCollectorSynthesize.
 * Re-exports for backward compat: collectorSessions (via research-session).
 */
export async function runCollectorInteractive(query, ctx, signal, onUpdate, config) {
  // defer to handler so web-research.js doesn't need the internals
  return handleCollectorEntry(query, ctx, signal, onUpdate, config);
}

// ---------------------------------------------------------------------------
// Pure: result summary builders (no I/O)
// ---------------------------------------------------------------------------

function buildCollectorNextActions(session, collectorResults, maxTurns, currentQuery) {
  const actions = [];
  const hasResults = collectorResults.some(r => r.available && r.resultCount > 0);
  if (hasResults) {
    if (session.turn < maxTurns) {
      actions.push({ action: "refine", reason: "Narrow query for better results", options: { queryOverride: currentQuery + " specifics" } });
    }
    actions.push({ action: "fetch", reason: "Fetch recommended results for analysis", options: { selectedResultIds: [] } });
  }
  if (session.fetchedPages.length > 0) {
    actions.push({ action: "synthesize", reason: session.fetchedPages.length + " pages ready" });
  }
  return actions;
}

function buildObservedGaps(collectorResults) {
  const gaps = [];
  const total = collectorResults.reduce((s, r) => s + (r.resultCount || 0), 0);
  if (total < 3) gaps.push("too few results");
  if (collectorResults.some(r => !r.available)) gaps.push("some collectors unavailable");
  return gaps;
}

function buildCompactCollectorSummary(query, collectorResults, observedGaps, nextActions) {
  const lines = ["## Collector Search: " + query];
  for (const cr of collectorResults) {
    if (cr.available && cr.results) {
      lines.push("\n### " + cr.platform + " (" + cr.resultCount + " results)");
      for (const r of cr.results.slice(0, 3)) {
        lines.push("- [" + r.id + "] " + r.title + " (score: " + r.score + ")");
      }
      if (cr.resultCount > 3) lines.push("  ... and " + (cr.resultCount - 3) + " more");
    } else {
      lines.push("\n### " + cr.platform + " - unavailable (" + (cr.reason || "unknown") + ")");
    }
  }
  if (observedGaps.length) lines.push("\n**Gaps:** " + observedGaps.join(", "));
  if (nextActions.length) {
    lines.push("\n**Next actions:**");
    for (const na of nextActions) lines.push("- **" + na.action + ":** " + na.reason);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal: collector entry point
// ---------------------------------------------------------------------------

async function handleCollectorEntry(query, _ctx, _signal, _onUpdate, config) {
  const platforms = (config.platforms && config.platforms.length > 0) ? config.platforms : (inferQueryPlatforms(query) || []);
  const session = getOrCreateSession(config.sessionId, query, config.maxTurns || COLLECTOR_MAX_TURNS_DEFAULT);
  const maxTurns = session.maxTurns;
  const maxResults = config.maxResultsPerPlatform || 5;
  const action = config.action || "search";
  const currentQuery = config.queryOverride || query;

  session.turn += 1;
  if (session.turn > maxTurns) {
    return {
      ok: false, action: "collector_interactive", sessionId: session.id,
      query: session.query, currentQuery, turn: session.turn,
      error: "Max turns (" + maxTurns + ") exceeded",
      limits: { maxTurns, remainingTurns: 0, maxResultsPerPlatform: maxResults },
      contentText: "Session expired: max turns reached.",
    };
  }

  if (action === "fetch") return handleCollectorFetch(session, config, currentQuery);
  if (action === "synthesize") return handleCollectorSynthesize(session, config, currentQuery, _ctx, _signal);

  const collectorResults = [];
  for (const platform of platforms) {
    const collector = getCollector(platform);
    if (!collector) {
      collectorResults.push({ platform, available: false, reason: "Collector not in registry", resultCount: 0, results: [] });
      continue;
    }
    const avail = collector.checkAvailability();
    if (!avail.available) {
      collectorResults.push({ platform, available: false, reason: avail.reason || "Unavailable", resultCount: 0, results: [] });
      continue;
    }
    try {
      const result = await collector.search(currentQuery, { limit: maxResults });
      const withIds = (result.results || []).map((r, i) => ({
        id: platform + ":" + i,
        title: r.title,
        url: r.url,
        author: r.author,
        score: r.score,
        signals: r.signals || {},
        fetchRecommended: Boolean(r.url && !r.url.startsWith("https://news.ycombinator.com/item")),
      }));
      collectorResults.push({ platform, available: true, resultCount: withIds.length, results: withIds, meta: result.meta });
    } catch (error) {
      collectorResults.push({ platform, available: false, reason: error.message || "Search error", resultCount: 0, results: [] });
    }
  }

  if (action === "refine") {
    session.collectorResults = session.collectorResults.concat(collectorResults);
  } else {
    session.collectorResults = collectorResults;
  }

  const observedGaps = buildObservedGaps(collectorResults, currentQuery);
  const nextActions = buildCollectorNextActions(session, collectorResults, maxTurns, currentQuery);
  const contentText = buildCompactCollectorSummary(currentQuery, collectorResults, observedGaps, nextActions);

  return {
    ok: true, action: "collector_search", sessionId: session.id,
    query: session.query, currentQuery, turn: session.turn,
    limits: { maxTurns, remainingTurns: Math.max(0, maxTurns - session.turn), maxResultsPerPlatform: maxResults },
    collectorResults: collectorResults.map(r => ({
      platform: r.platform, available: r.available, resultCount: r.resultCount, reason: r.reason,
      results: (r.results || []).map(res => ({
        id: res.id, title: res.title, url: res.url, author: res.author,
        score: res.score, signals: res.signals, fetchRecommended: res.fetchRecommended,
      })),
    })),
    observedGaps, nextActions, contentText,
  };
}

async function handleCollectorFetch(session, config, currentQuery) {
  const maxUrls = Math.min(config.maxSites || 5, 10);
  const urls = [];
  if (config.selectedResultIds && config.selectedResultIds.length > 0) {
    for (const id of config.selectedResultIds) {
      for (const cr of session.collectorResults) {
        if (!cr.results) continue;
        const found = cr.results.find(r => r.id === id);
        if (found && found.url) urls.push(found.url);
      }
    }
  }
  if (urls.length === 0 && config.selectedUrls) {
    for (const u of config.selectedUrls) {
      try { new URL(u); urls.push(u); } catch { /* skip invalid */ }
    }
  }
  // ponytail: lazy-require fetchPageSource to avoid circular
  const { fetchPageSource } = await import("../web-research.js");
  const pages = [];
  const fetchCfg = { mode: config.mode || "fast", isolate: true, query: currentQuery };
  for (const url of urls.slice(0, maxUrls)) {
    try {
      const page = await fetchPageSource(url, undefined, fetchCfg);
      if (page && page.text) {
        pages.push({ url: page.url, title: page.title, text: page.text.slice(0, 1000), sourceType: page.sourceType || "web" });
      }
    } catch { /* skip unreadable */ }
  }
  session.fetchedPages = session.fetchedPages.concat(pages);
  const nextActions = [
    { action: "synthesize", reason: pages.length + " pages fetched; ready for synthesis" },
    { action: "refine", reason: "Refine based on what was learned", options: { queryOverride: currentQuery + " context" } },
  ];
  const contentText = "Fetched " + pages.length + "/" + urls.length + " pages.\n\n" +
    pages.map(p => "- **" + p.title + "** (" + p.url + "): " + (p.text ? p.text.slice(0, 200) : "") + "...").join("\n") +
    "\n\n**Next:** synthesize or refine.";
  return {
    ok: true, action: "collector_fetch", sessionId: session.id,
    query: session.query, currentQuery, turn: session.turn,
    pages: pages.map(p => ({ url: p.url, title: p.title, sourceType: p.sourceType, previewLength: p.text ? p.text.length : 0 })),
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
    // ponytail: lazy-require to avoid circular
    const { fetchPageSource } = await import("../web-research.js");
    const fetchCfg = { mode: config.mode || "fast", isolate: true, query: currentQuery };
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
      ok: false, action: "collector_synthesize", sessionId: session.id,
      query: session.query, currentQuery, turn: session.turn,
      error: "No pages to synthesize", contentText: "No pages available. Run search and fetch first.",
    };
  }
  // ponytail: lazy-require to avoid circular with web-research
  const { synthesizeResearch, shouldRequireAuthoritativeSources } = await import("../web-research.js");
  const synthesis = await synthesizeResearch(currentQuery || session.query,
    session.fetchedPages.map(p => ({ ...p, score: 10, authoritative: false })), ctx, signal);
  const requireAuth = shouldRequireAuthoritativeSources(config) &&
    session.fetchedPages.every(p => p.sourceType !== "official_doc");
  const result = {
    ok: true, action: "collector_synthesize", sessionId: session.id,
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
  const maxResults = options.maxResultsPerPlatform || 5;
  const results = [];
  const gaps = [];
  const raw = [];

  for (const platform of platforms) {
    const collector = getCollector(platform);

    if (!collector) {
      const gap = buildCollectorGap(platform, "Collector not in registry");
      gaps.push(gap);
      continue;
    }

    const avail = collector.checkAvailability();
    if (!avail.available) {
      const gap = buildCollectorGap(platform, avail.reason || "Unavailable");
      gaps.push(gap);
      continue;
    }

    try {
      const collectorResult = await collector.search(query, { limit: maxResults });
      const normalized = normalizeCollectorResults(platform, collectorResult);
      results.push(...normalized.normalized);
      raw.push({
        platform,
        available: true,
        resultCount: normalized.resultCount,
        results: collectorResult.results || [],
        meta: collectorResult.meta || {},
      });
    } catch (error) {
      const gap = buildCollectorGap(platform, error.message || "Search error");
      gaps.push(gap);
    }
  }

  return { results, gaps, raw };
}
