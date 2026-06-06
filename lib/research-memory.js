import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// DB path resolution
// ---------------------------------------------------------------------------

export function researchCacheDir() {
  if (process.env.EMET_CONTEXT_PATH) return dirname(process.env.EMET_CONTEXT_PATH);

  if (process.env.PI_CODING_AGENT === "true") {
    return join(homedir(), ".pi", "agent", "lazy-modules", "emet", ".cache");
  }

  const os = platform();
  if (os === "darwin") {
    return join(homedir(), "Library", "Caches", "emet");
  }
  if (os === "win32") {
    return join(process.env.LOCALAPPDATA || homedir(), "emet-cache");
  }
  const xdgCache = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(xdgCache, "emet");
}

function dbPath() {
  if (process.env.EMET_CONTEXT_PATH) return process.env.EMET_CONTEXT_PATH;
  return join(researchCacheDir(), "emet-context.db");
}

// ---------------------------------------------------------------------------
// DB singleton
// ---------------------------------------------------------------------------

let _db = null;
let _cleanupCounter = 0;

function getDb() {
  if (_db) return _db;
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });

  _db = new Database(path);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("cache_size = -8000");
  _db.pragma("busy_timeout = 3000");
  _db.pragma("auto_vacuum = INCREMENTAL");
  ensureSchema(_db);

  // One-shot migration from old JSON cache (must run after DB is ready)
  migrateFromJsonIfNeeded();

  cleanupExpired();
  return _db;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS global_usage_cache (
      cache_key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      project TEXT NOT NULL DEFAULT '',
      ttl INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
  `);
}

// ---------------------------------------------------------------------------
// JSON migration (one-shot, silent, idempotent)
// ---------------------------------------------------------------------------

const MIGRATED_FLAG = ".migrated-from-json";

function oldJsonPath() {
  return join(homedir(), ".pi", "agent", "lazy-modules", "emet", ".cache", "research-cache.json");
}

export function migrateFromJsonIfNeeded() {
  const cacheDir = researchCacheDir();
  if (existsSync(join(cacheDir, MIGRATED_FLAG))) return;        // already migrated
  const jsonFile = oldJsonPath();
  if (!existsSync(jsonFile)) return;                             // nothing to migrate

  try {
    const raw = readFileSync(jsonFile, "utf8");
    const oldData = JSON.parse(raw);
    const db = getDb();

    const insert = db.prepare(
      "INSERT OR IGNORE INTO global_usage_cache (cache_key, value, project, ttl) VALUES (?, ?, '', ?)"
    );
    const tx = db.transaction(() => {
      for (const [key, entry] of Object.entries(oldData)) {
        if (!entry || typeof entry !== "object") continue;
        const expiresAt = entry.expiresAt ?? entry.ttl ?? 0;
        if (expiresAt > Date.now()) {
          insert.run(key, JSON.stringify(entry), expiresAt);
        }
      }
    });
    tx();

    writeFileSync(join(cacheDir, MIGRATED_FLAG), String(Date.now()));
    renameSync(jsonFile, jsonFile + ".migrated");
  } catch (err) {
    console.error("emet: cache migration failed (harmless):", err.message);
  }
}

// ---------------------------------------------------------------------------
// In-memory layer (fastest path)
// ---------------------------------------------------------------------------

const memory = new Map();
const MAX_MEMORY_ENTRIES = 100;

function trimMemory() {
  if (memory.size <= MAX_MEMORY_ENTRIES) return;
  const entries = [...memory.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const toDelete = entries.slice(0, memory.size - MAX_MEMORY_ENTRIES);
  for (const [key] of toDelete) memory.delete(key);
}

// ---------------------------------------------------------------------------
// Cleanup (inline, no cron)
// ---------------------------------------------------------------------------

function cleanupExpired() {
  try {
    const db = getDb();
    const deleted = db
      .prepare("DELETE FROM global_usage_cache WHERE ttl < ?")
      .run(Date.now());
    if (deleted.changes > 0) {
      db.prepare(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('last_cleanup', ?)"
      ).run(String(Date.now()));
    }
  } catch {
    // cleanup is not critical
  }
}

// ---------------------------------------------------------------------------
// Safe JSON helpers
// ---------------------------------------------------------------------------

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ ok: false, error: "non-serializable value" });
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

export function hashText(text = "") {
  return createHash("sha1").update(String(text)).digest("hex").slice(0, 12);
}

export function modeCacheKey(query, config = {}) {
  const stable = {
    mode: config.mode,
    files: config.files,
    allowedSources: config.allowedSources,
    allowedSourceTypes: config.allowedSourceTypes,
    maxPages: config.maxPages,
    maxTurns: config.maxTurns,
    searchProvider: config.searchProvider,
  };
  return `emet:v1:${hashResearchQuery(query)}:${hashText(JSON.stringify(stable))}`;
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
  const expiresAt = Date.now() + ttlMs;
  const payload = { expiresAt, value };

  // 1. In-memory (fastest path)
  memory.set(`persistent:${key}`, payload);
  trimMemory();

  // 2. SQLite
  try {
    const db = getDb();
    db.prepare(
      "INSERT OR REPLACE INTO global_usage_cache (cache_key, value, project, ttl) VALUES (?, ?, '', ?)"
    ).run(key, safeJsonStringify(payload), expiresAt);

    // Occasional inline cleanup
    if (++_cleanupCounter % 10 === 0) cleanupExpired();
  } catch (err) {
    console.error("emet: cache write failed:", err.message);
  }

  // 3. Dev cache (optional)
  if (process.env.EMET_DEV_CACHE) {
    try {
      appendDevCacheEntry(key, payload);
    } catch {
      // dev cache is optional
    }
  }

  return value;
}

export function readCachedResult(key) {
  // 1. In-memory
  const inMemory = memory.get(`persistent:${key}`);
  if (inMemory) {
    if (inMemory.expiresAt > Date.now()) return inMemory.value;
    memory.delete(`persistent:${key}`);
  }

  // 2. SQLite
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT value FROM global_usage_cache WHERE cache_key = ?")
      .get(key);
    if (!row) return null;
    const parsed = safeJsonParse(row.value);
    if (!parsed || parsed.expiresAt <= Date.now()) {
      db.prepare("DELETE FROM global_usage_cache WHERE cache_key = ?").run(key);
      return null;
    }
    // Populate in-memory for next read
    memory.set(`persistent:${key}`, parsed);
    trimMemory();
    return parsed.value;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Optional dev cache (JSON snapshot for analysis)
// ---------------------------------------------------------------------------

function devCachePath() {
  return join(researchCacheDir(), "research-cache.dev.json");
}

function appendDevCacheEntry(key, payload) {
  let cache = {};
  const path = devCachePath();
  try {
    ensureDevCacheDir();
    const raw = readFileSync(path, "utf8");
    cache = JSON.parse(raw) || {};
  } catch {
    // fresh
  }
  cache[key] = payload;
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

function ensureDevCacheDir() {
  mkdirSync(researchCacheDir(), { recursive: true });
}
