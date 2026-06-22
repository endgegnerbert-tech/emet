// Normalize collector results into platform-agnostic source candidates.
// Pure module: no I/O, no network, no collector calls.
// ponytail: flat normalization functions, no class hierarchy.

// ---------------------------------------------------------------------------
// Source type mapping per platform
// ---------------------------------------------------------------------------

const PLATFORM_SOURCE_TYPES = {
  hn: "forum",
  v2ex: "forum",
  github: "github_repo",
  rss: "blog",
  youtube: "video",
  reddit: "forum",
  bilibili: "video",
  weibo: "social",
};

function sourceTypeForPlatform(platform) {
  return PLATFORM_SOURCE_TYPES[platform] || "other";
}

// ---------------------------------------------------------------------------
// Score normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a platform-specific score to a 0-10 scale.
 *
 * - HN: points are on ~0-500+ scale → log-scale map
 * - V2EX: replies are on ~0-100 scale → linear map, max at 50
 * - GitHub: stars are on ~0-100k scale → log-scale map
 * - RSS/YouTube: no native score → default 5
 */
function normalizeScore(platform, rawScore) {
  if (rawScore == null || typeof rawScore !== "number" || !Number.isFinite(rawScore)) {
    return 5; // neutral default
  }

  switch (platform) {
    case "hn": {
      // HN points: log10(points+1) * 2, max 10
      const s = Math.log10(rawScore + 1) * 2;
      return Math.min(10, Math.max(0, Math.round(s * 10) / 10));
    }
    case "v2ex": {
      // V2EX replies: replies / 5, max 10
      const s = rawScore / 5;
      return Math.min(10, Math.max(0, Math.round(s * 10) / 10));
    }
    case "github": {
      // GitHub stars: log10(stars+1) * 1.5, max 10
      const s = Math.log10(rawScore + 1) * 1.5;
      return Math.min(10, Math.max(0, Math.round(s * 10) / 10));
    }
    case "rss":
    case "youtube":
    default:
      return 5;
  }
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a stable ID from platform + platform-native identifier.
 * Falls back to index if no native ID is available.
 */
function generateId(platform, item, index) {
  // Try to extract a native platform ID
  const nativeId = item.id || item.objectID || item.number || item.guid;
  if (nativeId) return `${platform}:${nativeId}`;
  // Fallback: index-based (not stable across refine turns)
  return `${platform}:${index}`;
}

// ---------------------------------------------------------------------------
// Signal extraction
// ---------------------------------------------------------------------------

function extractSignals(platform, item) {
  switch (platform) {
    case "hn":
      return {
        platform,
        kind: "story",
        author: item.author || item.by || "",
        comments: item.num_comments || item.comments || 0,
        points: item.points || item.score || 0,
      };
    case "v2ex":
      return {
        platform,
        kind: "topic",
        author: item.author || item.member?.username || "",
        comments: item.replies || 0,
        points: 0,
      };
    case "github":
      return {
        platform,
        kind: item.kind || "repo",
        author: item.author || item.owner?.login || "",
        comments: item.open_issues_count || 0,
        points: item.stargazers_count || item.stars || 0,
      };
    case "rss":
      return {
        platform,
        kind: "article",
        author: item.author || item.creator || "",
        comments: 0,
        points: 0,
      };
    case "youtube":
      return {
        platform,
        kind: "video",
        author: item.author || item.channelTitle || item.channel || "",
        comments: item.commentCount || 0,
        points: item.viewCount || item.views || 0,
      };
    default:
      return {
        platform,
        kind: "unknown",
        author: item.author || "",
        comments: 0,
        points: 0,
      };
  }
}

// ---------------------------------------------------------------------------
// Main normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a single collector result item into a platform-agnostic source candidate.
 *
 * @param {string} platform - collector platform name (hn, v2ex, github, rss, youtube)
 * @param {Object} item - raw collector result item
 * @param {number} [index] - fallback index for ID generation
 * @returns {Object} normalized candidate
 */
export function normalizeCollectorResult(platform, item, index = 0) {
  const id = generateId(platform, item, index);
  const sourceType = sourceTypeForPlatform(platform);
  const score = normalizeScore(platform, item.score ?? item.points ?? item.stargazers_count);
  const signals = extractSignals(platform, item);

  return {
    id,
    title: item.title || "",
    url: item.url || "",
    snippet: item.snippet || item.description || item.text || "",
    sourceType,
    authoritative: false, // community sources are never authoritative
    score,
    signals,
  };
}

/**
 * Build a structured gap result for an unavailable collector.
 */
export function buildCollectorGap(platform, reason = "Unavailable") {
  return {
    platform,
    available: false,
    reason,
    resultCount: 0,
    results: [],
    normalized: [],
  };
}

/**
 * Normalize all results from a collector run into candidates + metadata.
 *
 * @param {string} platform
 * @param {Object} collectorResult - output from collector.search()
 * @returns {Object} { normalized: [], resultCount, meta }
 */
export function normalizeCollectorResults(platform, collectorResult) {
  if (!collectorResult || collectorResult.resultCount === 0) {
    return { normalized: [], resultCount: 0, meta: collectorResult?.meta || {} };
  }

  const results = collectorResult.results || [];
  const normalized = results.map((item, i) => normalizeCollectorResult(platform, item, i));

  return {
    normalized,
    resultCount: normalized.length,
    meta: collectorResult.meta || {},
  };
}
