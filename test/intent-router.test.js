import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuestionDomain, normalizeResearchMode } from "../lib/research-intent.js";

test("classifyQuestionDomain routes GitHub issue questions to github", () => {
  assert.equal(classifyQuestionDomain("bug in issue tracker for this repo"), "github");
});

test("classifyQuestionDomain routes CVE questions to security", () => {
  assert.equal(classifyQuestionDomain("is this package affected by CVE-2025-1234"), "security");
});

test("classifyQuestionDomain keeps release-note questions out of papers", () => {
  assert.equal(classifyQuestionDomain("What changed in the latest release notes for emet?"), "changelog");
});

test("classifyQuestionDomain keeps outage reports out of github", () => {
  assert.equal(classifyQuestionDomain("Any outage or incident reported?"), "vendor-status");
});

test("normalizeResearchMode keeps explicit mode and default fallback", () => {
  assert.equal(normalizeResearchMode({ mode: "academic" }, "fast"), "academic");
  assert.equal(normalizeResearchMode({}, "fast"), "fast");
});
