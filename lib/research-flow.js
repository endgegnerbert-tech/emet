// Pure flow policy — determines run mode, retrieval bias, and authority requirements.
// No I/O, no network, no session state. Inputs are snapshots only.
// ponytail: flow policy only chooses stop/retrieval bias; pipeline still owns I/O.

// ---------------------------------------------------------------------------
// Flow policy result
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FlowPolicy
 * @property {"auto"|"checkpoint"} runMode
 * @property {"web"|"community"|"mixed"} retrievalBias
 * @property {boolean} authorityRequired
 * @property {boolean} communityOnlyAllowed
 * @property {"none"|"sentiment"|"complaints"|"feature_requests"|"verify_claim"} communityIntent
 */

// ---------------------------------------------------------------------------
// Helper: detect query characteristics
// ---------------------------------------------------------------------------

// ponytail: only clear social-intent queries, not passing mentions
function inferQueryPlatforms(query) {
  if (/\bhn\b|hacker\s?news/i.test(query) && !/rack news/i.test(query)) return ["hn"];
  if (/\bv2ex\b/i.test(query)) return ["v2ex"];
  if (/\breddit\b/i.test(query)) return ["reddit"];
  if (/\bgithub\s+(issues|discussions?|repos?|trending|stars?)/i.test(query)) return ["github"];
  return null;
}

const COMPLAINT_PATTERNS = [
  /\b(complain(?:t|ts|ing)?|pain points?|problems?|bugs?|regressions?|frustrat(?:ing|ed)|annoying|hate|broken)\b/i,
];

const FEATURE_REQUEST_PATTERNS = [
  /\b(feature requests?|wish(?:es)?|missing features?|what (?:do )?people want|asking for|requested)\b/i,
];

const VERIFY_CLAIM_PATTERNS = [
  /\b(verify|confirm|is it true|true\?|claims?|rumou?rs?|reports?|says|said|outage|incident)\b/i,
];

const SENTIMENT_PATTERNS = [
  /\b(best|favorite|favourite|recommend|prefer)\b/i,
  /\bwhat('s| is) (your|everyone'?s?|people'?s?)\b/i,
  /\b(annoying|frustrating|love|hate)\b/i,
  /\b(experience|opinion|review|thoughts?)\b/i,
  /\b(worth it|worth the|bang for buck)\b/i,
  /\bvs\b.*\bvs\b/i,
];

function inferCommunityIntent(query) {
  if (VERIFY_CLAIM_PATTERNS.some((pattern) => pattern.test(query))) return "verify_claim";
  if (COMPLAINT_PATTERNS.some((pattern) => pattern.test(query))) return "complaints";
  if (FEATURE_REQUEST_PATTERNS.some((pattern) => pattern.test(query))) return "feature_requests";
  if (SENTIMENT_PATTERNS.some((pattern) => pattern.test(query))) return "sentiment";
  return "none";
}

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
  const communityIntent = inferCommunityIntent(query);

  // --- runMode ---
  const runMode = (isInteractive || options.sessionId || options.action) ? "checkpoint" : "auto";

  // --- retrievalBias ---
  let retrievalBias = "web";

  // Explicit or inferred platforms select community retrieval.
  if (hasPlatforms) {
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
  if (options.requireAuthoritative || options.requirePrimarySource) {
    authorityRequired = true;
  }

  // Guardrail override
  if (guardrails.requireAuthoritative) {
    authorityRequired = true;
  }

  // High-risk or factual verification queries need authority.
  const isFactualHighRisk = FACTUAL_HIGH_RISK_PATTERNS.some((pattern) => pattern.test(query));
  if (isFactualHighRisk || communityIntent === "verify_claim") {
    authorityRequired = true;
  }

  if (retrievalBias === "community" && authorityRequired) {
    retrievalBias = "mixed";
  }

  // --- communityOnlyAllowed ---
  let communityOnlyAllowed = false;

  if (["sentiment", "complaints", "feature_requests"].includes(communityIntent)) {
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
    communityIntent,
  };
}

// ---------------------------------------------------------------------------
// Re-export community intent helpers for retrieval planning.
// ---------------------------------------------------------------------------

export { inferQueryPlatforms, inferCommunityIntent };
