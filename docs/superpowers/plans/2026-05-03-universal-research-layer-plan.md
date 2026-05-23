# Universal Research Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `pi-research` into a domain-routed research layer with claim/evidence output, explicit domain packs, and a benchmark loop that prevents quality regressions.

**Architecture:** Keep the existing web research pipeline, but split it into three layers: a small core router, isolated domain packs, and an eval harness. The core decides *what kind of research this is* and *how strict the answer must be*; domain packs own search/fetch/ranking for their topic; eval cases lock behavior so new heuristics do not silently drift.

**Tech Stack:** Node.js, `node:test`, existing `typebox`, existing Pi extension API, current `pi-research` web search/fetch stack.

---

## File Map

**Core router and shared output**
- Modify: `index.js`
- Modify: `lib/web-research.js`
- Modify: `lib/research.js`
- Modify: `lib/types.js`
- Create: `lib/research-intent.js`
- Create: `lib/research-evidence.js`
- Create: `lib/research-output.js`

**Domain packs**
- Create: `lib/domains/index.js`
- Create: `lib/domains/web.js`
- Create: `lib/domains/github.js`
- Create: `lib/domains/security.js`
- Create: `lib/domains/papers.js`
- Create: `lib/domains/specs.js`
- Create: `lib/domains/changelog.js`
- Create: `lib/domains/forums.js`
- Create: `lib/domains/package-registry.js`
- Create: `lib/domains/vendor-status.js`

**Eval and benchmarks**
- Create: `lib/eval/runner.js`
- Create: `lib/eval/case-loader.js`
- Create: `eval/cases/web/*.json`
- Create: `eval/cases/github/*.json`
- Create: `eval/cases/security/*.json`
- Create: `eval/cases/papers/*.json`
- Create: `eval/cases/specs/*.json`
- Create: `eval/cases/changelog/*.json`
- Create: `eval/cases/forums/*.json`
- Create: `eval/cases/package-registry/*.json`
- Create: `eval/cases/vendor-status/*.json`
- Modify: `package.json`
- Modify: `README.md`

**Tests**
- Create: `test/intent-router.test.js`
- Create: `test/evidence-schema.test.js`
- Create: `test/domain-packs.test.js`
- Create: `test/output-formats.test.js`
- Create: `test/eval-runner.test.js`
- Modify: `test/web-research.test.js`
- Modify: `test/strategic-features.test.js`
- Modify: `test/source-scoring.test.js`

---

## Phase 1: Core Router

### Task 1: Lock down current router behavior before changing internals

**Files:**
- Create: `test/intent-router.test.js`
- Modify: `index.js`
- Modify: `lib/web-research.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuestionDomain, normalizeResearchMode } from "../lib/research-intent.js";

test("classifyQuestionDomain routes GitHub issue questions to github", () => {
  assert.equal(classifyQuestionDomain("bug in issue tracker for this repo"), "github");
});

test("classifyQuestionDomain routes CVE questions to security", () => {
  assert.equal(classifyQuestionDomain("is this package affected by CVE-2025-1234"), "security");
});

test("normalizeResearchMode keeps explicit mode and default fallback", () => {
  assert.equal(normalizeResearchMode({ mode: "academic" }, "fast"), "academic");
  assert.equal(normalizeResearchMode({}, "fast"), "fast");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/intent-router.test.js`
Expected: FAIL because `lib/research-intent.js` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/research-intent.js` with only the two exported functions used by the test.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/intent-router.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/intent-router.test.js lib/research-intent.js index.js lib/web-research.js
git commit -m "feat: add research intent router"
```

### Task 2: Move mode resolution and option semantics out of the web pipeline

**Files:**
- Create: `test/output-formats.test.js`
- Create: `lib/research-output.js`
- Modify: `index.js`
- Modify: `lib/web-research.js`
- Modify: `lib/research.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveOutputFormat, shouldRequireAuthoritativeSources } from "../lib/research-output.js";

test("resolveOutputFormat respects explicit format", () => {
  assert.equal(resolveOutputFormat({ format: "json" }, "markdown"), "json");
});

test("shouldRequireAuthoritativeSources returns true when requested", () => {
  assert.equal(shouldRequireAuthoritativeSources({ requireAuthoritative: true }, false), true);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/output-formats.test.js`
Expected: FAIL because `lib/research-output.js` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/research-output.js` with the two exported functions and wire them into `resolveResearchConfig` / `runWebResearch` so `requireAuthoritative` actually changes sufficiency and `format` is preserved in the returned payload.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/output-formats.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/output-formats.test.js lib/research-output.js index.js lib/web-research.js lib/research.js
git commit -m "feat: wire output format and authority rules"
```

### Task 3: Add claim/evidence objects to the research result

**Files:**
- Create: `test/evidence-schema.test.js`
- Create: `lib/research-evidence.js`
- Modify: `lib/types.js`
- Modify: `lib/research.js`
- Modify: `lib/web-research.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createClaim, createEvidence, explainConfidence } from "../lib/research-evidence.js";

test("createClaim keeps evidence and confidence", () => {
  const claim = createClaim({
    text: "This package supports ESM.",
    confidence: "high",
    evidence: [createEvidence({ type: "web", source: "https://example.com", snippet: "supports ESM" })],
  });

  assert.equal(claim.text, "This package supports ESM.");
  assert.equal(claim.confidence, "high");
  assert.equal(claim.evidence[0].type, "web");
});

test("explainConfidence maps high confidence to a readable reason", () => {
  assert.match(explainConfidence("high", 3), /multiple/i);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/evidence-schema.test.js`
Expected: FAIL because `lib/research-evidence.js` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Add `createEvidence`, `createClaim`, and `explainConfidence`. Extend the normalized result shape in `lib/types.js` to carry `claims` and `evidenceSummary`.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/evidence-schema.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/evidence-schema.test.js lib/research-evidence.js lib/types.js lib/research.js lib/web-research.js
git commit -m "feat: add claim and evidence model"
```

### Task 4: Make conflict and gap detection work on claims, not only keywords

**Files:**
- Modify: `lib/research.js`
- Modify: `lib/web-research.js`
- Modify: `test/source-scoring.test.js`
- Modify: `test/web-research.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { detectClaimConflicts, detectCoverageGaps } from "../lib/research.js";

test("detectClaimConflicts flags opposite claims with source evidence", () => {
  const result = detectClaimConflicts([
    { text: "Supported", source: "docs" },
    { text: "Not supported", source: "issue" },
  ]);
  assert.equal(result.detected, true);
});

test("detectCoverageGaps asks for missing authoritative sources", () => {
  const result = detectCoverageGaps({ claims: [{ text: "A", evidence: [] }] });
  assert.ok(result.missingAspects.includes("authoritative sources"));
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/source-scoring.test.js`
Expected: FAIL because claim-based helpers are not implemented yet.

- [ ] **Step 3: Write the minimal implementation**

Implement claim-aware conflict and gap detection, and use it in `evaluateSufficiency` and `runWebResearch`.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/source-scoring.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/research.js lib/web-research.js test/source-scoring.test.js test/web-research.test.js
git commit -m "feat: make research gaps claim aware"
```

### Task 5: Refactor the core files into small boundaries

**Files:**
- Modify: `index.js`
- Modify: `lib/web-research.js`
- Modify: `lib/research.js`
- Modify: `README.md`
- Modify: `test/web-research.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import webResearchExtension from "../index.js";

test("pi-research still registers and returns compacted evidence fields", () => {
  const tools = [];
  const pi = { on() {}, registerTool(tool) { tools.push(tool); } };
  webResearchExtension(pi);
  assert.equal(tools[0].name, "pi-research");
});
```

- [ ] **Step 2: Run the test and verify it fails if the refactor broke registration**

Run: `node --test test/web-research.test.js`
Expected: PASS only after the refactor keeps tool registration and payload compaction intact.

- [ ] **Step 3: Write the minimal implementation**

Move only orchestration into `index.js`; keep search/fetch/ranking in `lib/web-research.js`; keep scoring, sufficiency, and formatting in `lib/research.js` / `lib/research-output.js`.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/web-research.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.js lib/web-research.js lib/research.js lib/research-output.js README.md test/web-research.test.js
git commit -m "refactor: split research core boundaries"
```

---

## Phase 2: Domain Packs

### Task 6: Add a domain pack registry and pack interface

**Files:**
- Create: `test/domain-packs.test.js`
- Create: `lib/domains/index.js`
- Create: `lib/domains/web.js`
- Modify: `index.js`
- Modify: `lib/web-research.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getDomainPack, listDomainPacks } from "../lib/domains/index.js";

test("listDomainPacks includes github and security", () => {
  const packs = listDomainPacks();
  assert.ok(packs.includes("github"));
  assert.ok(packs.includes("security"));
});

test("getDomainPack returns the web fallback pack", () => {
  assert.equal(getDomainPack("web").name, "web");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/domain-packs.test.js`
Expected: FAIL because `lib/domains/index.js` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Add a tiny registry plus a web fallback pack. Wire the router so a domain value selects a pack before the existing web pipeline runs.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/domain-packs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/domain-packs.test.js lib/domains/index.js lib/domains/web.js index.js lib/web-research.js
git commit -m "feat: add domain pack registry"
```

### Task 7: Implement the GitHub and forums packs first

**Files:**
- Create: `lib/domains/github.js`
- Create: `lib/domains/forums.js`
- Modify: `lib/domains/index.js`
- Modify: `lib/web-research.js`
- Modify: `test/domain-packs.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getDomainPack } from "../lib/domains/index.js";

test("github pack advertises issue and discussion sources", () => {
  const pack = getDomainPack("github");
  assert.ok(pack.sourceHints.includes("issues"));
  assert.ok(pack.sourceHints.includes("discussions"));
});

test("forums pack advertises stackoverflow and discourse sources", () => {
  const pack = getDomainPack("forums");
  assert.ok(pack.sourceHints.includes("stackoverflow"));
  assert.ok(pack.sourceHints.includes("discourse"));
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/domain-packs.test.js`
Expected: FAIL until both packs exist.

- [ ] **Step 3: Write the minimal implementation**

Implement `run()` for each pack so GitHub questions prefer issues, pull requests, and README pages; forums questions prefer Stack Overflow, Discourse, and Reddit-style sources.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/domain-packs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domains/github.js lib/domains/forums.js lib/domains/index.js lib/web-research.js test/domain-packs.test.js
git commit -m "feat: add github and forums research packs"
```

### Task 8: Implement security, package registry, and changelog packs

**Files:**
- Create: `lib/domains/security.js`
- Create: `lib/domains/package-registry.js`
- Create: `lib/domains/changelog.js`
- Modify: `lib/domains/index.js`
- Modify: `test/domain-packs.test.js`
- Modify: `test/source-scoring.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getDomainPack } from "../lib/domains/index.js";

test("security pack prefers advisories and CVE sources", () => {
  const pack = getDomainPack("security");
  assert.ok(pack.sourceHints.includes("cve"));
  assert.ok(pack.sourceHints.includes("advisory"));
});

test("package registry pack prefers npm and pypi sources", () => {
  const pack = getDomainPack("package-registry");
  assert.ok(pack.sourceHints.includes("npm"));
  assert.ok(pack.sourceHints.includes("pypi"));
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/domain-packs.test.js`
Expected: FAIL until the packs exist.

- [ ] **Step 3: Write the minimal implementation**

Keep each pack small: one search strategy, one source filter, one ranking bias.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/domain-packs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domains/security.js lib/domains/package-registry.js lib/domains/changelog.js lib/domains/index.js test/domain-packs.test.js test/source-scoring.test.js
git commit -m "feat: add security and registry research packs"
```

### Task 9: Implement papers, specs, and vendor-status packs

**Files:**
- Create: `lib/domains/papers.js`
- Create: `lib/domains/specs.js`
- Create: `lib/domains/vendor-status.js`
- Modify: `lib/domains/index.js`
- Modify: `test/domain-packs.test.js`
- Modify: `test/web-research.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getDomainPack } from "../lib/domains/index.js";

test("papers pack prefers arxiv and scholarly sources", () => {
  const pack = getDomainPack("papers");
  assert.ok(pack.sourceHints.includes("arxiv"));
  assert.ok(pack.sourceHints.includes("semanticscholar"));
});

test("vendor status pack prefers status page sources", () => {
  const pack = getDomainPack("vendor-status");
  assert.ok(pack.sourceHints.includes("status"));
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/domain-packs.test.js`
Expected: FAIL until these packs exist.

- [ ] **Step 3: Write the minimal implementation**

Use the same pack interface as the earlier packs so the router can stay generic.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/domain-packs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domains/papers.js lib/domains/specs.js lib/domains/vendor-status.js lib/domains/index.js test/domain-packs.test.js test/web-research.test.js
git commit -m "feat: add papers specs and status packs"
```

---

## Phase 3: Eval + Boost

### Task 10: Add an eval loader and one runner for all packs

**Files:**
- Create: `test/eval-runner.test.js`
- Create: `lib/eval/case-loader.js`
- Create: `lib/eval/runner.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadEvalCases } from "../lib/eval/case-loader.js";

test("loadEvalCases loads json files from eval/cases/web", () => {
  const cases = loadEvalCases("web");
  assert.ok(Array.isArray(cases));
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/eval-runner.test.js`
Expected: FAIL because the eval loader does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Add a loader that reads JSON case files and a runner that executes `pi-research` against them and returns pass/fail plus mismatch details.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/eval-runner.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/eval-runner.test.js lib/eval/case-loader.js lib/eval/runner.js package.json
git commit -m "feat: add eval case loader and runner"
```

### Task 11: Add benchmark cases for each domain pack

**Files:**
- Create: `eval/cases/web/*.json`
- Create: `eval/cases/github/*.json`
- Create: `eval/cases/security/*.json`
- Create: `eval/cases/papers/*.json`
- Create: `eval/cases/specs/*.json`
- Create: `eval/cases/changelog/*.json`
- Create: `eval/cases/forums/*.json`
- Create: `eval/cases/package-registry/*.json`
- Create: `eval/cases/vendor-status/*.json`
- Modify: `test/eval-runner.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { loadEvalCases } from "../lib/eval/case-loader.js";

test("github eval cases include an expected domain", () => {
  const cases = loadEvalCases("github");
  assert.equal(cases[0].expectedDomain, "github");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/eval-runner.test.js`
Expected: FAIL until real case files exist.

- [ ] **Step 3: Write the minimal implementation**

Add small JSON cases, one or two per domain first, with `question`, `expectedDomain`, `expectedClaims`, and `notes`.

- [ ] **Step 4: Run the test and verify it passes**

Run: `node --test test/eval-runner.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add eval/cases test/eval-runner.test.js
git commit -m "feat: add benchmark cases for research packs"
```

### Task 12: Add regression gates and documentation for the universal research layer

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `test/web-research.test.js`
- Modify: `test/domain-packs.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { runEvalSuite } from "../lib/eval/runner.js";

test("eval suite reports a pass rate", async () => {
  const result = await runEvalSuite({ domain: "web" });
  assert.equal(typeof result.passRate, "number");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/web-research.test.js test/domain-packs.test.js test/eval-runner.test.js`
Expected: FAIL until the runner and docs are complete.

- [ ] **Step 3: Write the minimal implementation**

Add a package script like `npm run eval`, document the three-phase architecture, and state the supported domains clearly.

- [ ] **Step 4: Run the full suite and verify it passes**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md package.json test/web-research.test.js test/domain-packs.test.js test/eval-runner.test.js lib/eval/runner.js
git commit -m "docs: add universal research layer eval and docs"
```

---

## Self-Review Checklist

- [ ] Every phase has a clear start and finish.
- [ ] Every new behavior has a failing test first.
- [ ] Every new file has a single responsibility.
- [ ] `index.js` stays a coordinator, not a dump.
- [ ] `lib/web-research.js` stays about retrieval orchestration only.
- [ ] `lib/research.js` stays about scoring, sufficiency, and formatting helpers.
- [ ] Domain packs do not share hidden state.
- [ ] Eval cases are data, not code.
- [ ] No placeholders like TBD/TODO remain.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-03-universal-research-layer-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?