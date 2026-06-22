import test from "node:test";
import assert from "node:assert/strict";

import { resolveFlowPolicy, inferQueryPlatforms } from "../lib/research-flow.js";

// --- inferQueryPlatforms ---

test("inferQueryPlatforms: HN mentions", () => {
  assert.deepEqual(inferQueryPlatforms("what does hn think about rust"), ["hn"]);
  assert.deepEqual(inferQueryPlatforms("Hacker News discussion on AI"), ["hn"]);
});

test("inferQueryPlatforms: no false positives on 'hn'", () => {
  assert.equal(inferQueryPlatforms("rack news about tech"), null);
});

test("inferQueryPlatforms: V2EX mentions", () => {
  assert.deepEqual(inferQueryPlatforms("v2ex nodejs discussion"), ["v2ex"]);
});

test("inferQueryPlatforms: GitHub intent", () => {
  assert.deepEqual(inferQueryPlatforms("github issues react hooks"), ["github"]);
  assert.deepEqual(inferQueryPlatforms("github discussions about vite"), ["github"]);
  assert.deepEqual(inferQueryPlatforms("github repos for rust"), ["github"]);
  assert.deepEqual(inferQueryPlatforms("github trending this week"), ["github"]);
});

test("inferQueryPlatforms: normal queries return null", () => {
  assert.equal(inferQueryPlatforms("what is node.js"), null);
  assert.equal(inferQueryPlatforms("how to use fetch api"), null);
});

// --- resolveFlowPolicy: runMode ---

test("resolveFlowPolicy: default is auto", () => {
  const policy = resolveFlowPolicy("test query", { mode: "fast" });
  assert.equal(policy.runMode, "auto");
});

test("resolveFlowPolicy: interactive without platforms still auto (prep phase)", () => {
  // ponytail: interactive→checkpoint once unified plan lands
  const policy = resolveFlowPolicy("test query", { mode: "fast", interactive: true });
  assert.equal(policy.runMode, "auto");
});

// --- resolveFlowPolicy: retrievalBias ---

test("resolveFlowPolicy: default is web", () => {
  const policy = resolveFlowPolicy("what is node", { mode: "fast" });
  assert.equal(policy.retrievalBias, "web");
});

test("resolveFlowPolicy: explicit platforms → community", () => {
  const policy = resolveFlowPolicy("anything", { mode: "fast", platforms: ["hn"] });
  assert.equal(policy.retrievalBias, "community");
});

test("resolveFlowPolicy: interactive+inferred platforms → community", () => {
  const policy = resolveFlowPolicy("what does hn think", { mode: "fast", interactive: true });
  assert.equal(policy.retrievalBias, "community");
});

test("resolveFlowPolicy: inferred platforms without interactive → community", () => {
  const policy = resolveFlowPolicy("what does hn think", { mode: "fast" });
  assert.equal(policy.retrievalBias, "community");
});

test("resolveFlowPolicy: queryUnderstanding community family → community", () => {
  const policy = resolveFlowPolicy("best laptop", { mode: "fast" }, {}, {
    sourceFamily: "community",
  });
  assert.equal(policy.retrievalBias, "community");
});

test("resolveFlowPolicy: queryUnderstanding mixed family → mixed", () => {
  const policy = resolveFlowPolicy("laptop specs", { mode: "fast" }, {}, {
    sourceFamily: "mixed",
  });
  assert.equal(policy.retrievalBias, "mixed");
});

// --- resolveFlowPolicy: authorityRequired ---

test("resolveFlowPolicy: normal query does not require authority", () => {
  const policy = resolveFlowPolicy("what is npm", { mode: "fast" });
  assert.equal(policy.authorityRequired, false);
});

test("resolveFlowPolicy: academic mode requires authority", () => {
  const policy = resolveFlowPolicy("paper about transformers", { mode: "academic" });
  assert.equal(policy.authorityRequired, true);
});

test("resolveFlowPolicy: code mode requires authority", () => {
  const policy = resolveFlowPolicy("how to use express", { mode: "code" });
  assert.equal(policy.authorityRequired, true);
});

test("resolveFlowPolicy: explicit requireAuthoritative", () => {
  const policy = resolveFlowPolicy("anything", { mode: "fast", requireAuthoritative: true });
  assert.equal(policy.authorityRequired, true);
});

test("resolveFlowPolicy: guardrail requires authority", () => {
  const policy = resolveFlowPolicy("anything", { mode: "fast" }, { requireAuthoritative: true });
  assert.equal(policy.authorityRequired, true);
});

test("resolveFlowPolicy: CVE query requires authority", () => {
  const policy = resolveFlowPolicy("CVE-2024-1234 vulnerability patch", { mode: "fast" });
  assert.equal(policy.authorityRequired, true);
});

test("resolveFlowPolicy: security advisory requires authority", () => {
  const policy = resolveFlowPolicy("security advisory for log4j", { mode: "fast" });
  assert.equal(policy.authorityRequired, true);
});

test("resolveFlowPolicy: deprecated package requires authority", () => {
  const policy = resolveFlowPolicy("is request package deprecated", { mode: "fast" });
  assert.equal(policy.authorityRequired, true);
});

test("resolveFlowPolicy: breaking change requires authority", () => {
  const policy = resolveFlowPolicy("react 19 breaking changes", { mode: "fast" });
  assert.equal(policy.authorityRequired, true);
});

// --- resolveFlowPolicy: communityOnlyAllowed ---

test("resolveFlowPolicy: sentiment query allows community only", () => {
  const policy = resolveFlowPolicy("best laptop for coding", { mode: "fast" });
  assert.equal(policy.communityOnlyAllowed, true);
});

test("resolveFlowPolicy: opinion query allows community only", () => {
  const policy = resolveFlowPolicy("is typescript worth it", { mode: "fast" });
  assert.equal(policy.communityOnlyAllowed, true);
});

test("resolveFlowPolicy: favorite query allows community only", () => {
  const policy = resolveFlowPolicy("what's your favorite editor", { mode: "fast" });
  assert.equal(policy.communityOnlyAllowed, true);
});

test("resolveFlowPolicy: factual query disallows community only", () => {
  const policy = resolveFlowPolicy("what is node.js version 22", { mode: "fast" });
  assert.equal(policy.communityOnlyAllowed, false);
});

test("resolveFlowPolicy: authority overrides community only", () => {
  // Even though it's a "best laptop" sentiment query, CVE makes it authoritative
  const policy = resolveFlowPolicy("best laptop for CVE-2024-1234 patch", { mode: "fast" });
  assert.equal(policy.authorityRequired, true);
  assert.equal(policy.communityOnlyAllowed, false);
});

test("resolveFlowPolicy: community family allows community only", () => {
  const policy = resolveFlowPolicy("discussion about rust", { mode: "fast" }, {}, {
    sourceFamily: "community",
  });
  assert.equal(policy.communityOnlyAllowed, true);
});

// --- resolveFlowPolicy: combined scenarios ---

test("resolveFlowPolicy: code mode CVE query — authority, no community", () => {
  const policy = resolveFlowPolicy("CVE-2024-9999 openssl fix", { mode: "code" });
  assert.equal(policy.runMode, "auto");
  assert.equal(policy.retrievalBias, "web");
  assert.equal(policy.authorityRequired, true);
  assert.equal(policy.communityOnlyAllowed, false);
});

test("resolveFlowPolicy: hn sentiment query — community bias, community allowed", () => {
  const policy = resolveFlowPolicy("best text editor according to hn", { mode: "fast" });
  assert.equal(policy.retrievalBias, "community");
  assert.equal(policy.communityOnlyAllowed, true);
  assert.equal(policy.authorityRequired, false);
});
