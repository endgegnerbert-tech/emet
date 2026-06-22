// Pure flow policy — determines run mode, retrieval bias, and authority requirements.
// No I/O, no network, no session state. Inputs are snapshots only.
// ponytail: interactive→checkpoint (not collector) once unified plan lands.
// During prep, interactive+platforms still → community bias to match existing behavior.

// ---------------------------------------------------------------------------
// Flow policy result
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FlowPolicy
 * @property {"auto"|"checkpoint"} runMode
 * @property {"web"|"community"|"mixed"} retrievalBias
 * @property {boolean} authorityRequired
 * @property {boolean} communityOnlyAllowed
 */

// ---------------------------------------------------------------------------
// Helper: detect query characteristics
// ---------------------------------------------------------------------------

// ponytail: only clear social-intent queries, not passing mentions
function inferQueryPlatforms(query) {
  if (/\bhn\b|hacker\s?news/i.test(query) && !/rack news/i.test(query)) return ["hn"];
  if (/\bv2ex\b/i.test(query)) return ["v2ex"];
  if (/\bgithub\s+(issues|discussions?|repos?|trending|stars?)/i.test(query)) return ["github"];
  return null;
}

const SENTIMENT_PATTERNS = [
  /\b(best|favorite|favourite|recommend|prefer)\b/i,
  /\bwhat('s| is) (your|everyone'?s?|people'?s?)\b/i,
  /\b(annoying|frustrating|love|hate)\b/i,
  /\b(experience|opinion|review|thoughts?)\b/i,
  /\b(worth it|worth the|bang for buck)\b/i,
  /\bvs\b.*\bvs\b/i,
];

const FACTUAL_HIGH_RISK_PATTERNS = [
  /\bCVE-\d{4}-\d+\b/i,
  /\b(vulnerability|exploit|zero.day|RCE|remote code execution)\b/i,
  /\b(security advisory|security bulletin|patch tuesday)\b/i,
  /\b(deprecated|end.of.life|EOL|unsupported|removed)\b/i,
  /\b(critical|high.severity|CVSS)\b/i,
  /\b(recall|withdrawn|revoked)\b/i,
  /\b(breaking change|breaking changes|backward incompatible)\b/i,
  /\b(malware|ransomware|backdoor|supply.chain)\b/i,
];

// ---------------------------------------------------------------------------
// Main flow policy resolver
// ---------------------------------------------------------------------------

/**
 * Resolve flow policy from query, options, guardrails, and query understanding.
 *
 * @param {string} query
 * @param {Object} options - raw research options (mode, platforms, interactive, etc.)
 * @param {Object} [guardrails] - guardrail snapshot (optional during prep)
 * @param {Object} [queryUnderstanding] - query understanding decision (optional during prep)
 * @returns {FlowPolicy}
 */
export function resolveFlowPolicy(query, options = {}, guardrails = {}, queryUnderstanding = {}) {
  const mode = options.mode || "fast";
  const isInteractive = Boolean(options.interactive);
  const explicitPlatforms = Array.isArray(options.platforms) && options.platforms.length > 0;
  const inferredPlatforms = inferQueryPlatforms(query);
  const hasPlatforms = explicitPlatforms || Boolean(inferredPlatforms);

  // --- runMode ---
  // ponytail: interactive currently means collector mode (not checkpoint).
  // Unified plan will change this to checkpoint. During prep, preserve existing behavior.
  const runMode = isInteractive ? "auto" : "auto";

  // --- retrievalBias ---
  let retrievalBias = "web";

  // Explicit platforms or interactive with platforms → community
  if (explicitPlatforms) {
    retrievalBias = "community";
  } else if (isInteractive && hasPlatforms) {
    retrievalBias = "community";
  } else if (hasPlatforms && !isInteractive) {
    // Query implies community platforms
    retrievalBias = "community";
  }

  // Domain family from query understanding can override to mixed/community
  const family = queryUnderstanding.sourceFamily || queryUnderstanding.final?.sourceFamily;
  if (family === "community") {
    retrievalBias = retrievalBias === "web" ? "community" : retrievalBias;
  } else if (family === "mixed") {
    retrievalBias = "mixed";
  }

  // --- authorityRequired ---
  let authorityRequired = false;

  // Academic/code modes require authority
  if (mode === "academic" || mode === "code") {
    authorityRequired = true;
  }

  // Domain config override
  if (options.requireAuthoritative) {
    authorityRequired = true;
  }

  // Guardrail override
  if (guardrails.requireAuthoritative) {
    authorityRequired = true;
  }

  // High-risk factual queries
  const isFactualHighRisk = FACTUAL_HIGH_RISK_PATTERNS.some((pattern) => pattern.test(query));
  if (isFactualHighRisk) {
    authorityRequired = true;
  }

  // --- communityOnlyAllowed ---
  let communityOnlyAllowed = false;

  // Sentiment/opinion queries
  const isSentiment = SENTIMENT_PATTERNS.some((pattern) => pattern.test(query));
  if (isSentiment) {
    communityOnlyAllowed = true;
  }

  // Explicit community domain
  if (family === "community") {
    communityOnlyAllowed = true;
  }

  // ponytail: if authority is required, community-only is NOT allowed regardless of sentiment
  if (authorityRequired) {
    communityOnlyAllowed = false;
  }

  return {
    runMode,
    retrievalBias,
    authorityRequired,
    communityOnlyAllowed,
  };
}

// ---------------------------------------------------------------------------
// Re-export inferQueryPlatforms for backward compat (used by web-research.js)
// ponytail: remove after shouldRunCollectorInteractive moves to use resolveFlowPolicy
// ---------------------------------------------------------------------------

export { inferQueryPlatforms };
