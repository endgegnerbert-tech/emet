# Test Cache Pollution: Mock Data Leaks into Persistent Cache

**Severity:** MEDIUM — Affects 2 cached queries with fake arxiv.org/abs/2401.12345 data

## Problem

The `writeCachedResult()` function in `lib/research-memory.js` writes to a shared `research-cache.json` file. Test runners (e.g., `node --test`) use mock data that includes a fake paper entry:

```json
{
  "title": "Paper",
  "url": "https://arxiv.org/abs/2401.12345",
  "sourceType": "paper",
  "authoritative": true,
  "score": 23
}
```

This fake entry was cached during a test run and persists in the real cache. Subsequent real queries for papers hit this cached entry instead of fetching fresh data.

## Detection

Cache query: `"retrieval augmented generation papers"` (academic mode) returned:
- 1 source: `arxiv.org/abs/2401.12345` with title `"Paper"`
- `sufficient=false`, `confidenceScore=0.59`
- Answer is boilerplate: "I found 1 relevant sources..."

## Fix

### Option A: Separate cache file for tests

In tests, mock `writeCachedResult` and `readCachedResult` to use a temp file or in-memory store instead of the real `research-cache.json`.

### Option B: Namespace cache keys with a test prefix

```js
const cacheKey = config.isTest ? `test:${modeCacheKey(query, config)}` : modeCacheKey(query, config);
```

### Option C: Flush test cache on teardown

```js
after(() => {
  // Clear test entries from research-cache.json
  const data = JSON.parse(readFileSync(cachePath));
  for (const key of Object.keys(data)) {
    if (key.startsWith("test:")) delete data[key];
  }
  writeFileSync(cachePath, JSON.stringify(data));
});
```

**Recommended:** Option A — cleanest separation, no risk of polluting prod cache.

## Current State

The cache file `.cache/research-cache.json` is 1.6MB with 201 entries. The 2 fake entries are mixed in. A full cache clear would fix it but lose real entries too. Selective cleanup is preferred.
