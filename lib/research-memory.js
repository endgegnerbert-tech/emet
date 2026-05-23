import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const memory = new Map();
const CACHE_PATH = join(homedir(), ".pi", "agent", "lazy-modules", "emet", ".cache", "research-cache.json");

function ensureCacheDir() {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
}

function readPersistentCache() {
  try {
    const raw = readFileSync(CACHE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writePersistentCache(cache) {
  ensureCacheDir();
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export function normalizeResearchQuery(query = "") {
  return String(query)
    .toLowerCase()
    .trim()
    .replace(/[?!.,:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashResearchQuery(query = "") {
  return createHash("sha1").update(normalizeResearchQuery(query)).digest("hex");
}

export function shouldSkipResearch({ queryHash, lastHash, lastWasSufficient, force = false, isolate = false }) {
  if (force || isolate) return false;
  return Boolean(queryHash && lastHash && queryHash === lastHash && lastWasSufficient);
}

export function getResearchMemory(key) {
  return memory.get(key) || null;
}

export function setResearchMemory(key, value) {
  memory.set(key, value);
  return value;
}

export function clearResearchMemory() {
  memory.clear();
}

export function writeCachedResult(key, value, ttlMs) {
  const payload = {
    expiresAt: Date.now() + ttlMs,
    value,
  };
  memory.set(`persistent:${key}`, payload);
  const cache = readPersistentCache();
  cache[key] = payload;
  writePersistentCache(cache);
  return value;
}

export function readCachedResult(key) {
  const inMemory = memory.get(`persistent:${key}`);
  if (inMemory) {
    if (inMemory.expiresAt > Date.now()) return inMemory.value;
    memory.delete(`persistent:${key}`);
  }

  const cache = readPersistentCache();
  const entry = cache[key];
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    delete cache[key];
    writePersistentCache(cache);
    return null;
  }
  memory.set(`persistent:${key}`, entry);
  return entry.value;
}
