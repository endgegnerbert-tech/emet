import test from "node:test";
import assert from "node:assert/strict";

import { canUseTopicCache, clearResearchMemory, modeCacheKey, readCachedResult, researchProjectKey, writeCachedResult } from "../lib/research-memory.js";

test("modeCacheKey includes semantic output and policy options", () => {
  const base = modeCacheKey("node release notes", { mode: "fast" });
  const variants = [
    { mode: "fast", preferRecent: true },
    { mode: "fast", minYear: 2025 },
    { mode: "fast", maxYear: 2026 },
    { mode: "fast", requireAuthoritative: true },
    { mode: "fast", rawPages: true },
    { mode: "fast", format: "markdown" },
    { mode: "fast", queryHints: ["migration"] },
    { mode: "fast", overlays: ["changelog"] },
    { mode: "fast", sourcePolicyFlags: ["official-only"] },
    { mode: "fast", sourcePolicy: { strict: true } },
    { mode: "fast", deepResearchConfig: { depth: 2 } },
    { mode: "fast", platforms: ["github"] },
  ];

  for (const config of variants) {
    assert.notEqual(modeCacheKey("node release notes", config), base, JSON.stringify(config));
  }
});

test("topic cache is disabled for exact or strict requests", () => {
  const blocked = [
    ["React 19.2 migration", {}],
    ["site:nodejs.org fetch API", {}],
    ["https://example.com/docs", {}],
    ["owner/repo release notes", {}],
    ["Node changelog 2026", {}],
    ["plain topic", { rawPages: true }],
    ["plain topic", { requireAuthoritative: true }],
    ["plain topic", { hostAllowlist: ["nodejs.org"] }],
    ["plain topic", { allowedSources: ["nodejs.org"] }],
    ["plain topic", { sourcePolicyFlags: ["official-only"] }],
    ["plain topic", { sourcePolicy: { strict: true } }],
    ["plain topic", { minYear: 2025 }],
  ];

  for (const [query, config] of blocked) {
    assert.equal(canUseTopicCache(query, config), false, query);
  }

  assert.equal(canUseTopicCache("broad package comparison", { allowedSources: ["paper"] }), true);
});

test("persistent cache keys are isolated by project without storing raw paths", () => {
  clearResearchMemory();
  const previousProject = process.env.EMET_PROJECT_KEY;

  try {
    process.env.EMET_PROJECT_KEY = "/Users/example/private/project-a";
    const projectA = researchProjectKey();
    writeCachedResult("same-semantic-key", { answer: "project-a" }, 10_000);
    assert.equal(readCachedResult("same-semantic-key")?.answer, "project-a");

    process.env.EMET_PROJECT_KEY = "/Users/example/private/project-b";
    const projectB = researchProjectKey();
    clearResearchMemory();
    assert.notEqual(projectA, projectB);
    assert.equal(projectA.includes("/Users/example"), false);
    assert.equal(readCachedResult("same-semantic-key"), null);
  } finally {
    if (previousProject === undefined) delete process.env.EMET_PROJECT_KEY;
    else process.env.EMET_PROJECT_KEY = previousProject;
    clearResearchMemory();
  }
});
