import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_TTL,
  MAX_SESSIONS,
  DEFAULT_MAX_TURNS,
  COLLECTOR_SESSION_TTL,
  COLLECTOR_MAX_SESSIONS,
  COLLECTOR_MAX_TURNS_DEFAULT,
  collectorSessions,
  getOrCreateSession,
} from "../lib/research-session.js";

// Clean session state between tests
test.beforeEach(() => {
  collectorSessions.clear();
});

// --- Constants ---

test("SESSION_TTL is 30 minutes", () => {
  assert.equal(SESSION_TTL, 30 * 60 * 1000);
});

test("legacy aliases match canonical constants", () => {
  assert.equal(COLLECTOR_SESSION_TTL, SESSION_TTL);
  assert.equal(COLLECTOR_MAX_SESSIONS, MAX_SESSIONS);
  assert.equal(COLLECTOR_MAX_TURNS_DEFAULT, DEFAULT_MAX_TURNS);
});

// --- Session creation ---

test("getOrCreateSession creates new session with auto-generated ID", () => {
  const session = getOrCreateSession(null, "test query", 3);
  assert.ok(session.id);
  assert.equal(typeof session.id, "string");
  assert.equal(session.query, "test query");
  assert.equal(session.turn, 0);
  assert.equal(session.maxTurns, 3);
  assert.deepEqual(session.collectorResults, []);
  assert.deepEqual(session.fetchedPages, []);
  assert.ok(collectorSessions.has(session.id));
});

test("getOrCreateSession creates session with provided ID", () => {
  const session = getOrCreateSession("my-session", "query", 5);
  assert.equal(session.id, "my-session");
  assert.equal(session.maxTurns, 5);
});

test("getOrCreateSession defaults maxTurns to DEFAULT_MAX_TURNS", () => {
  const session = getOrCreateSession(null, "query", null);
  assert.equal(session.maxTurns, DEFAULT_MAX_TURNS);
});

// --- Session continuation ---

test("getOrCreateSession continues existing session", () => {
  const s1 = getOrCreateSession("abc", "original query", 3);
  s1.turn = 1;
  s1.collectorResults = [{ platform: "hn" }];

  const s2 = getOrCreateSession("abc", "new query", 3);
  assert.equal(s2.id, "abc");
  assert.equal(s2.query, "original query"); // preserves original query
  assert.equal(s2.turn, 1); // preserves state
  assert.deepEqual(s2.collectorResults, [{ platform: "hn" }]);
});

// --- Session expiry ---

test("getOrCreateSession evicts expired sessions", () => {
  // Create a session and fake its creation time
  const s1 = getOrCreateSession("expired", "query", 3);
  s1.createdAt = Date.now() - SESSION_TTL - 1000; // expired

  // Creating another session triggers eviction
  const s2 = getOrCreateSession("new", "query", 3);
  assert.ok(!collectorSessions.has("expired"));
  assert.ok(collectorSessions.has(s2.id));
});

// --- Max session cap ---

test("getOrCreateSession evicts oldest when at capacity", () => {
  // Fill to capacity
  for (let i = 0; i < MAX_SESSIONS; i++) {
    const s = getOrCreateSession(`session-${i}`, `query ${i}`, 3);
    // Stagger creation times so we can identify oldest
    s.createdAt = Date.now() - (MAX_SESSIONS - i) * 1000;
  }
  assert.equal(collectorSessions.size, MAX_SESSIONS);

  // Add one more — should evict session-0 (oldest)
  const newest = getOrCreateSession(`session-${MAX_SESSIONS}`, "overflow", 3);
  assert.ok(collectorSessions.has(newest.id));
  assert.ok(!collectorSessions.has("session-0")); // oldest evicted
  assert.equal(collectorSessions.size, MAX_SESSIONS);
});

// --- Max turns enforcement ---

test("session tracks turns separately from creation", () => {
  const s = getOrCreateSession("turns", "query", 2);
  assert.equal(s.turn, 0);
  s.turn += 1;
  assert.equal(s.turn, 1);
  s.turn += 1;
  assert.equal(s.turn, 2);
  // maxTurns is enforced by the caller (runCollectorInteractive), not the session module
});
