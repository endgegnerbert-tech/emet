import test from "node:test";
import assert from "node:assert/strict";

import {
  Action,
  isValidAction,
  canonicalAction,
  buildCheckpointResult,
  buildFinalResult,
  isCheckpoint,
  isFinal,
} from "../lib/research-contract.js";

// --- Action enum ---

test("Action enum values are stable strings", () => {
  assert.equal(Action.SEARCH, "search");
  assert.equal(Action.REFINE, "refine");
  assert.equal(Action.FETCH, "fetch");
  assert.equal(Action.SYNTHESIZE, "synthesize");
  assert.equal(Action.FINAL, "final");
});

test("Action enum is frozen", () => {
  assert.throws(() => { Action.NEW = "new"; });
});

test("isValidAction accepts canonical actions", () => {
  assert.equal(isValidAction("search"), true);
  assert.equal(isValidAction("refine"), true);
  assert.equal(isValidAction("fetch"), true);
  assert.equal(isValidAction("synthesize"), true);
  assert.equal(isValidAction("final"), true);
});

test("isValidAction rejects legacy and unknown actions", () => {
  assert.equal(isValidAction("collector_search"), false);
  assert.equal(isValidAction("web_research"), false);
  assert.equal(isValidAction("unknown"), false);
  assert.equal(isValidAction(""), false);
  assert.equal(isValidAction(null), false);
  assert.equal(isValidAction(undefined), false);
});

// --- canonicalAction bridge ---

test("canonicalAction maps legacy to canonical", () => {
  assert.equal(canonicalAction("collector_search"), "search");
  assert.equal(canonicalAction("collector_fetch"), "fetch");
  assert.equal(canonicalAction("collector_synthesize"), "synthesize");
  assert.equal(canonicalAction("web_research"), "final");
});

test("canonicalAction passes through canonical", () => {
  assert.equal(canonicalAction("search"), "search");
  assert.equal(canonicalAction("final"), "final");
});

test("canonicalAction returns null for unknown", () => {
  assert.equal(canonicalAction("unknown"), null);
  assert.equal(canonicalAction(""), null);
  assert.equal(canonicalAction(null), null);
  assert.equal(canonicalAction(undefined), null);
});

// --- buildCheckpointResult ---

test("buildCheckpointResult builds valid search checkpoint", () => {
  const result = buildCheckpointResult({
    action: "search",
    sessionId: "abc-123",
    query: "best laptops",
    turn: 1,
    sources: [],
    nextActions: [{ action: "refine", reason: "narrow query" }],
    contentText: "Found 5 results",
  });
  assert.equal(result.ok, true);
  assert.equal(result.action, "search");
  assert.equal(result.sessionId, "abc-123");
  assert.equal(result.query, "best laptops");
  assert.equal(result.turn, 1);
  assert.equal(result.sources.length, 0);
  assert.equal(result.nextActions.length, 1);
});

test("buildCheckpointResult accepts legacy action", () => {
  const result = buildCheckpointResult({
    action: "collector_search",
    sessionId: "abc-123",
    query: "test",
    turn: 0,
    nextActions: [],
  });
  assert.equal(result.action, "search"); // canonicalized
});

test("buildCheckpointResult throws on invalid action", () => {
  assert.throws(() => buildCheckpointResult({
    action: "unknown",
    sessionId: "abc-123",
    query: "test",
    turn: 0,
    nextActions: [],
  }));
});

test("buildCheckpointResult throws on missing sessionId", () => {
  assert.throws(() => buildCheckpointResult({
    action: "search",
    query: "test",
    turn: 0,
    nextActions: [],
  }));
});

test("buildCheckpointResult defaults empty fields", () => {
  const result = buildCheckpointResult({
    action: "search",
    sessionId: "abc",
    query: null,
    turn: null,
    nextActions: [],
  });
  assert.equal(result.query, "");
  assert.equal(result.currentQuery, "");
  assert.equal(result.turn, 0);
  assert.deepEqual(result.sources, []);
  assert.equal(result.contentText, "");
});

// --- buildFinalResult ---

test("buildFinalResult builds valid final result", () => {
  const result = buildFinalResult({
    query: "what is node",
    answer: "Node.js is a runtime",
    bullets: ["bullet 1"],
    citations: [{ text: "cite 1", source: 0 }],
    sources: [{ title: "nodejs.org", url: "https://nodejs.org" }],
    sufficient: true,
    confidence: 0.9,
  });
  assert.equal(result.ok, true);
  assert.equal(result.action, "final");
  assert.equal(result.query, "what is node");
  assert.equal(result.sufficient, true);
  assert.equal(result.confidence, 0.9);
});

test("buildFinalResult defaults empty fields", () => {
  const result = buildFinalResult({ query: "test" });
  assert.equal(result.action, "final");
  assert.equal(result.ok, true);
  assert.equal(result.answer, "");
  assert.deepEqual(result.sources, []);
  assert.equal(result.sufficient, false);
  assert.equal(result.confidence, 0);
});

// --- isCheckpoint / isFinal ---

test("isCheckpoint detects checkpoint actions", () => {
  assert.equal(isCheckpoint({ action: "search" }), true);
  assert.equal(isCheckpoint({ action: "refine" }), true);
  assert.equal(isCheckpoint({ action: "fetch" }), true);
  assert.equal(isCheckpoint({ action: "synthesize" }), true);
});

test("isCheckpoint returns false for final and unknown", () => {
  assert.equal(isCheckpoint({ action: "final" }), false);
  assert.equal(isCheckpoint({ action: "collector_search" }), false);
  assert.equal(isCheckpoint(null), false);
  assert.equal(isCheckpoint(undefined), false);
});

test("isFinal detects final", () => {
  assert.equal(isFinal({ action: "final" }), true);
  assert.equal(isFinal({ action: "search" }), false);
  assert.equal(isFinal(null), false);
});
