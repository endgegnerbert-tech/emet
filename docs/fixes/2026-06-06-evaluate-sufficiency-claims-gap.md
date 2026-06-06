# evaluateSufficiency: Detached `missingAspects` via empty claims

**Severity:** HIGH — 73/201 cached queries (36%) have contradictory `sufficient=true` + `missing=['authoritative sources']`

## Bug

`evaluateSufficiency()` in `lib/research.js` calls `detectCoverageGaps(payload)` which inspects `payload.claims`:

```js
const coverage = detectCoverageGaps(payload); // checks payload.claims
```

But the only call site in `runWebResearch()` (lib/web-research.js, ~line 750) passes **no claims**:

```js
sufficiency = evaluateSufficiency({
  query,
  sources: mergedPages,
  conflictDetected,
  minSources,
  // ⬆ no claims passed
});
```

`detectCoverageGaps()` then receives `claims: []` (the default), finds zero claims with evidence, and returns `{ detected: true, missingAspects: ["authoritative sources"] }`.

Back in `evaluateSufficiency`:

```js
if (!authoritativeSourcesFound || coverage.detected) // ← coverage.detected is ALWAYS true
  missingAspects.push("authoritative sources");
```

Since `coverage.detected` is unconditionally true when no claims are passed, "authoritative sources" is **always** appended to `missingAspects` — even when authoritative sources *were* found.

## Impact

- 73 cached results say "I have enough evidence" AND "I lack authoritative sources" — a direct contradiction.
- Downstream logic that checks `missingAspects` gets a false signal.
- The `sufficient` flag in `createResearchResult()` has its own gating, so the final `sufficient` is *sometimes* corrected, but `missingAspects` stays wrong.

## Fix

Two options:

### A: Make `detectCoverageGaps` source-aware when claims are missing

In `lib/research.js`, change `detectCoverageGaps` to fall back to source count:

```js
export function detectCoverageGaps(input = {}) {
  const claims = Array.isArray(input.claims) ? input.claims : [];
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const authoritativeSourcesFound = claims.some((claim) => /* ... */)
    || sources.some((s) => s.authoritative); // ← fallback to sources
  // ...
}
```

### B: Always pass claims from `runWebResearch`

Build a claims array from `mergedPages` and pass it to `evaluateSufficiency`.

**Recommended:** Option A is safer (fix lives in one place, all callers benefit).

---

## Related: `sufficient` is double-gated

In `lib/web-research.js` (~line 1170):

```js
sufficient: sufficiency.sufficient && unverifiedRatio <= 0.2 &&
  (!shouldRequireAuthoritativeSources(activeConfig) || sufficiency.authoritativeSourcesFound),
```

But `missingAspects` is copied directly from `sufficiency.missingAspects` without the same gating. This creates a second contradiction path: `sufficient=false` with `missingAspects=['authoritative sources']` even though `authoritativeSourcesFound=true`.
