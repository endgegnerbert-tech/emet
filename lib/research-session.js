// In-memory session state for collector/interactive research.
// Wraps existing collectorSessions pattern from web-research.js.
// ponytail: Map-based in-memory sessions, no DB, no framework.

import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Session limits
// ---------------------------------------------------------------------------

export const SESSION_TTL = 30 * 60 * 1000;        // 30 min
export const MAX_SESSIONS = 100;
export const DEFAULT_MAX_TURNS = 3;

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

/** In-memory sessions keyed by session ID. Exported for testing. */
export const collectorSessions = new Map();

/**
 * Get an existing session or create a new one.
 *
 * - If sessionId is given and exists (and not expired), return it.
 * - Otherwise create a new session with a generated or provided ID.
 * - Evicts expired sessions and oldest session when at capacity.
 */
export function getOrCreateSession(sessionId, query, maxTurns) {
  const now = Date.now();

  // Evict expired sessions
  for (const [id, s] of collectorSessions) {
    if (now - s.createdAt > SESSION_TTL) collectorSessions.delete(id);
  }

  // Continue existing session
  if (sessionId && collectorSessions.has(sessionId)) {
    const s = collectorSessions.get(sessionId);
    s.query = s.query || query;
    return s;
  }

  // Evict oldest if at capacity
  if (collectorSessions.size >= MAX_SESSIONS) {
    collectorSessions.delete(collectorSessions.keys().next().value);
  }

  const id = sessionId || randomUUID();
  const session = {
    id,
    createdAt: now,
    query: query || "",
    turn: 0,
    maxTurns: maxTurns || DEFAULT_MAX_TURNS,
    collectorResults: [],
    fetchedPages: [],
  };
  collectorSessions.set(id, session);
  return session;
}
