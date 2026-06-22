// Research result contract — canonical action enum and result builders.
// Pure module: no I/O, no network, no platform-specific imports.
// ponytail: single source for action enum, no const enums, no wrapper classes.

// ---------------------------------------------------------------------------
// Canonical actions
// ---------------------------------------------------------------------------

/** Canonical research pipeline actions. */
export const Action = Object.freeze({
  SEARCH: "search",
  REFINE: "refine",
  FETCH: "fetch",
  SYNTHESIZE: "synthesize",
  FINAL: "final",
});

const VALID_ACTIONS = new Set(Object.values(Action));

export function isValidAction(value) {
  return VALID_ACTIONS.has(value);
}

// ---------------------------------------------------------------------------
// Backward-compat legacy → canonical mapping
// ponytail: remove after unified plan ships and all callers use canonical actions
// ---------------------------------------------------------------------------

const LEGACY_TO_CANONICAL = Object.freeze({
  collector_search: Action.SEARCH,
  collector_fetch: Action.FETCH,
  collector_synthesize: Action.SYNTHESIZE,
  web_research: Action.FINAL,
});

/**
 * Map a legacy action string to canonical action.
 * Returns the original value if it's already canonical, or null if unrecognized.
 */
export function canonicalAction(action) {
  if (!action) return null;
  const canonical = LEGACY_TO_CANONICAL[action];
  if (canonical) return canonical;
  if (isValidAction(action)) return action;
  return null;
}

// ---------------------------------------------------------------------------
// Checkpoint result builder (for interactive mode)
// ---------------------------------------------------------------------------

/**
 * Build a checkpoint result — returned when the pipeline pauses for user input.
 */
export function buildCheckpointResult({
  ok = true,
  action,
  sessionId,
  query,
  currentQuery,
  turn,
  sources = [],
  evidenceState = null,
  nextActions = [],
  missingAspects = [],
  contentText = "",
}) {
  const canonical = canonicalAction(action);
  if (!canonical) {
    throw new Error(`buildCheckpointResult: invalid action "${action}"`);
  }
  if (!sessionId) {
    throw new Error("buildCheckpointResult: sessionId is required");
  }

  return {
    ok,
    action: canonical,
    sessionId,
    query: query || "",
    currentQuery: currentQuery || query || "",
    turn: typeof turn === "number" ? turn : 0,
    sources,
    evidenceState,
    nextActions,
    missingAspects,
    contentText,
  };
}

// ---------------------------------------------------------------------------
// Final result builder (for completed research)
// ---------------------------------------------------------------------------

/**
 * Build a final result — returned when the pipeline completes.
 */
export function buildFinalResult({
  ok = true,
  query,
  subqueries = [],
  answer = "",
  bullets = [],
  citations = [],
  sources = [],
  sourceTypes = [],
  sufficient = false,
  confidence = 0,
  confidenceScore = 0,
  missingAspects = [],
  openSubQuestions = [],
  conflictSummary = "",
  authoritativeSourcesFound = false,
  followupRecommended = false,
  followupQuery = null,
  unverifiedClaims = [],
  contentText = "",
  meta = {},
}) {
  return {
    ok,
    action: Action.FINAL,
    query: query || "",
    subqueries,
    answer,
    bullets,
    citations,
    sources,
    sourceTypes,
    sufficient,
    confidence,
    confidenceScore,
    missingAspects,
    openSubQuestions,
    conflictSummary,
    authoritativeSourcesFound,
    followupRecommended,
    followupQuery,
    unverifiedClaims,
    contentText,
    meta,
  };
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

/** Check if a result is a checkpoint (paused, needs more input). */
export function isCheckpoint(result) {
  return result?.action === Action.SEARCH
    || result?.action === Action.REFINE
    || result?.action === Action.FETCH
    || result?.action === Action.SYNTHESIZE;
}

/** Check if a result is final (pipeline complete). */
export function isFinal(result) {
  return result?.action === Action.FINAL;
}
