import test from "node:test";
import assert from "node:assert/strict";
import { resolveOutputFormat, shouldRequireAuthoritativeSources } from "../lib/research-output.js";
import { formatResearchResponse } from "../lib/research.js";

test("resolveOutputFormat respects explicit format", () => {
  assert.equal(resolveOutputFormat({ format: "json" }, "markdown"), "json");
});

test("formatResearchResponse emits json when requested", () => {
  const text = formatResearchResponse({
    answer: "A",
    bullets: ["B"],
    sources: [{ title: "S", url: "https://example.com" }],
    confidence: "high",
    format: "json",
  });
  assert.doesNotThrow(() => JSON.parse(text));
});

test("formatResearchResponse emits table when requested", () => {
  const text = formatResearchResponse({
    answer: "A",
    bullets: ["B"],
    sources: [{ title: "S", url: "https://example.com" }],
    confidence: "high",
    format: "table",
  });
  assert.match(text, /\|/);
});

test("shouldRequireAuthoritativeSources returns true when requested", () => {
  assert.equal(shouldRequireAuthoritativeSources({ requireAuthoritative: true }, false), true);
});
