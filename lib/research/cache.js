// Per-run LRU caches. Layer: base — no imports.

export const MIN_PAGE_TEXT = 300;
export const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
export const PAGE_CACHE_TTL_MS = 30 * 60 * 1000;
export const EXPENSIVE_PAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_SEARCH_CACHE = 200;
export const MAX_PAGE_CACHE = 100;
export const searchCache = new Map();
export const pageCache = new Map();

export function getCacheValue(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCacheValue(cache, key, value, ttlMs) {
  const limit = cache === pageCache ? MAX_PAGE_CACHE : MAX_SEARCH_CACHE;
  if (cache.size >= limit) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function pageCacheTtl(page) {
  return page?.expensive ? EXPENSIVE_PAGE_CACHE_TTL_MS : PAGE_CACHE_TTL_MS;
}
