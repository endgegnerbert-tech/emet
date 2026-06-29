import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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

export function researchProjectKey(env = process.env, cwd = process.cwd()) {
  const explicit = env.EMET_PROJECT_KEY || env.EMET_PROJECT_ID || env.EMET_CONTEXT_PROJECT;
  const raw = explicit || (env.EMET_CONTEXT_PATH ? dirname(env.EMET_CONTEXT_PATH) : cwd);
  return createHash("sha1").update(String(raw || "default")).digest("hex").slice(0, 16);
}

function scopedCacheKey(key, project = researchProjectKey()) {
  return `${project}:${key}`;
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

    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      normalized_url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      source_type TEXT,
      code_blocks TEXT,
      publish_date TEXT,
      content_type TEXT,
      fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 1,
      session_ids TEXT NOT NULL DEFAULT ''
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      title,
      text,
      content='pages',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, text) VALUES('delete', old.id, old.title, old.text);
    END;
    CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, text) VALUES('delete', old.id, old.title, old.text);
      INSERT INTO pages_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
    END;

    CREATE INDEX IF NOT EXISTS idx_pages_expires_at ON pages(expires_at);
    CREATE INDEX IF NOT EXISTS idx_pages_fetched_at ON pages(fetched_at);

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

    INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '2');
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
    try { unlinkSync(jsonFile); } catch (_) { /* ponytail: best-effort cleanup */ }
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
    const now = Date.now();
    const deleted = db
      .prepare("DELETE FROM global_usage_cache WHERE ttl < ?")
      .run(now);
    db.prepare("DELETE FROM pages WHERE expires_at < ?").run(now);
    if (deleted.changes > 0) {
      db.prepare(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('last_cleanup', ?)"
      ).run(String(now));
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

/**
 * Aggressive topic normalization that strips specifics (years, versions,
 * site: prefixes, GitHub repo paths, URLs) so topically identical queries
 * produce the same key regardless of cosmetic differences.
 */
export function normalizeResearchTopic(query = "") {
  let q = String(query);
  // Strip site: prefixes
  q = q.replace(/\bsite:\S+/gi, "");
  // Strip years
  q = q.replace(/\b(?:19|20)\d{2}\b/g, "");
  // Strip version numbers (v1.2.3, 1.2.3, v2)
  q = q.replace(/\bv?\d+\.\d+(?:\.\d+)?[a-z]?\b/gi, "");
  // Strip GitHub-style repo paths (user/repo)
  q = q.replace(/\b[\w.-]+\/[\w.-]+\b/g, "");
  // Strip URLs
  q = q.replace(/https?:\/\/[^\s]+/g, "");
  return normalizeResearchQuery(q);
}

export function hashResearchQuery(query = "") {
  return createHash("sha1").update(normalizeResearchQuery(query)).digest("hex");
}

export function hashResearchTopic(query = "") {
  return createHash("sha1").update(normalizeResearchTopic(query)).digest("hex");
}

export function hashText(text = "") {
  return createHash("sha1").update(String(text)).digest("hex").slice(0, 12);
}

export function modeCacheKey(query, config = {}) {
  const stable = {
    mode: config.mode,
    files: config.files,
    preferRecent: config.preferRecent,
    minYear: config.minYear,
    maxYear: config.maxYear,
    requireAuthoritative: config.requireAuthoritative,
    rawPages: config.rawPages,
    format: config.format,
    queryHints: config.queryHints,
    overlays: config.overlays,
    allowedSources: config.allowedSources,
    hostAllowlist: config.hostAllowlist,
    allowedSourceTypes: config.allowedSourceTypes,
    sourcePolicy: config.sourcePolicy,
    sourcePolicyFlags: config.sourcePolicyFlags,
    deepResearchConfig: config.deepResearchConfig,
    platforms: config.platforms,
    maxPages: config.maxPages,
    maxTurns: config.maxTurns,
    searchProvider: config.searchProvider,
  };
  return `emet:v1:${hashResearchQuery(query)}:${hashText(JSON.stringify(stable))}`;
}

export function topicCacheKey(query, config = {}) {
  const stable = {
    mode: config.mode,
    files: config.files,
    allowedSources: config.allowedSources,
    hostAllowlist: config.hostAllowlist,
    allowedSourceTypes: config.allowedSourceTypes,
    maxPages: config.maxPages,
    maxTurns: config.maxTurns,
    searchProvider: config.searchProvider,
  };
  return `emet:v2:${hashResearchTopic(query)}:${hashText(JSON.stringify(stable))}`;
}

export function canUseTopicCache(query = "", config = {}) {
  const q = String(query || "");
  if (config.rawPages || config.requireAuthoritative) return false;
  if (Array.isArray(config.hostAllowlist) && config.hostAllowlist.length > 0) return false;
  if (Array.isArray(config.sourcePolicyFlags) && config.sourcePolicyFlags.length > 0) return false;
  if (config.sourcePolicy && Object.keys(config.sourcePolicy).length > 0) return false;
  if (config.minYear || config.maxYear || /\b(?:19|20)\d{2}\b/.test(q)) return false;
  if (/https?:\/\/|(?:^|\s)site:/i.test(q)) return false;
  if (/\b[\w.-]+\/[\w.-]+\b/.test(q)) return false;
  if (/\bv?\d+\.\d+(?:\.\d+)?\b/i.test(q)) return false;
  if (/\b(changelog|release notes?|migration|migrat(?:e|ion)|deprecat(?:e|ed|ion)|breaking(?: changes?)?|removed|upgrade)\b/i.test(q)) return false;
  const allowedSources = Array.isArray(config.allowedSources) ? config.allowedSources : [];
  if (allowedSources.some((source) => /[./:]/.test(String(source || "")))) return false;
  return true;
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
  const project = researchProjectKey();
  const storageKey = scopedCacheKey(key, project);
  memory.set(`persistent:${storageKey}`, payload);
  trimMemory();

  // 2. SQLite
  try {
    const db = getDb();
    db.prepare(
      "INSERT OR REPLACE INTO global_usage_cache (cache_key, value, project, ttl) VALUES (?, ?, ?, ?)"
    ).run(storageKey, safeJsonStringify(payload), project, expiresAt);

    // Occasional inline cleanup
    if (++_cleanupCounter % 10 === 0) cleanupExpired();
  } catch (err) {
    console.error("emet: cache write failed:", err.message);
  }

  return value;
}

/**
 * Write full result to dev JSON cache (for training/analysis).
 * Only active when EMET_DEV_CACHE is set.
 */
export function writeDevCacheResult(key, value) {
  if (!process.env.EMET_DEV_CACHE) return;
  try {
    const payload = { expiresAt: Date.now() + 7 * 24 * 3600 * 1000, value };
    appendDevCacheEntry(key, payload);
  } catch {
    // dev cache is optional
  }
}

export function readCachedResult(key) {
  const project = researchProjectKey();
  const storageKey = scopedCacheKey(key, project);
  // 1. In-memory
  const inMemory = memory.get(`persistent:${storageKey}`);
  if (inMemory) {
    if (inMemory.expiresAt > Date.now()) return inMemory.value;
    memory.delete(`persistent:${storageKey}`);
  }

  // 2. SQLite
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT value FROM global_usage_cache WHERE cache_key = ? AND project = ?")
      .get(storageKey, project);
    if (!row) return null;
    const parsed = safeJsonParse(row.value);
    if (!parsed || parsed.expiresAt <= Date.now()) {
      db.prepare("DELETE FROM global_usage_cache WHERE cache_key = ? AND project = ?").run(storageKey, project);
      return null;
    }
    // Populate in-memory for next read
    memory.set(`persistent:${storageKey}`, parsed);
    trimMemory();
    return parsed.value;
  } catch {
    return null;
  }
}

function normalizePageUrl(url = "") {
  try {
    const parsed = new URL(String(url));
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(url || "").trim();
  }
}

function pageFromRow(row) {
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    try {
      getDb().prepare("DELETE FROM pages WHERE id = ?").run(row.id);
    } catch {
      // best-effort cleanup
    }
    return null;
  }
  let codeBlocks = [];
  try {
    codeBlocks = row.code_blocks ? JSON.parse(row.code_blocks) : [];
  } catch {
    codeBlocks = [];
  }
  return {
    url: row.url,
    title: row.title || row.url,
    text: row.text || "",
    fullText: row.text || "",
    sourceType: row.source_type || undefined,
    codeBlocks,
    publishDate: row.publish_date || null,
    contentType: row.content_type || undefined,
    fetchedAt: row.fetched_at,
    persistentCache: true,
  };
}

export function writePageSnapshot(page, ttlMs = 30 * 60 * 1000, sessionId = "") {
  if (!page?.url) return null;
  const text = String(page.fullText || page.text || "");
  if (!text.trim()) return null;
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const normalizedUrl = normalizePageUrl(page.url);
  const payload = [
    page.url,
    normalizedUrl,
    page.title || page.url,
    text,
    page.sourceType || null,
    safeJsonStringify(Array.isArray(page.codeBlocks) ? page.codeBlocks : []),
    page.publishDate || null,
    page.contentType || null,
    now,
    expiresAt,
    sessionId || "",
  ];

  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO pages (
        url, normalized_url, title, text, source_type, code_blocks,
        publish_date, content_type, fetched_at, expires_at, session_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(normalized_url) DO UPDATE SET
        url = excluded.url,
        title = excluded.title,
        text = excluded.text,
        source_type = excluded.source_type,
        code_blocks = excluded.code_blocks,
        publish_date = excluded.publish_date,
        content_type = excluded.content_type,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at,
        access_count = pages.access_count + 1,
        session_ids = CASE
          WHEN excluded.session_ids = '' THEN pages.session_ids
          WHEN pages.session_ids = '' THEN excluded.session_ids
          WHEN instr(pages.session_ids, excluded.session_ids) > 0 THEN pages.session_ids
          ELSE pages.session_ids || ',' || excluded.session_ids
        END
    `).run(...payload);
    return page;
  } catch (err) {
    console.error("emet: page cache write failed:", err.message);
    return null;
  }
}

export function readPageSnapshot(url) {
  const normalizedUrl = normalizePageUrl(url);
  try {
    const db = getDb();
    const row = db.prepare("SELECT * FROM pages WHERE normalized_url = ? OR url = ?").get(normalizedUrl, String(url));
    const page = pageFromRow(row);
    if (page) {
      db.prepare("UPDATE pages SET access_count = access_count + 1 WHERE id = ?").run(row.id);
    }
    return page;
  } catch {
    return null;
  }
}

export function searchPageSnapshots(query, limit = 10) {
  const text = String(query || "").trim();
  if (!text) return [];
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT pages.*, bm25(pages_fts) AS rank
      FROM pages_fts
      JOIN pages ON pages.id = pages_fts.rowid
      WHERE pages_fts MATCH ? AND pages.expires_at > ?
      ORDER BY rank
      LIMIT ?
    `).all(text.replace(/["']/g, " "), Date.now(), Math.max(1, Math.min(50, Number(limit) || 10)));
    return rows.map(pageFromRow).filter(Boolean);
  } catch {
    return [];
  }
}

export function pageStoreStats() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) AS pages, COALESCE(SUM(length(text)), 0) AS bytes FROM pages WHERE expires_at > ?").get(Date.now());
    return { pages: row?.pages || 0, bytes: row?.bytes || 0, path: dbPath() };
  } catch {
    return { pages: 0, bytes: 0, path: dbPath() };
  }
}

// ---------------------------------------------------------------------------
// Optional dev cache (JSON snapshot for analysis)
// ---------------------------------------------------------------------------

function devCachePath() {
  return join(researchCacheDir(), "research-cache.dev.json");
}

// ponytail: NDJSON append instead of JSON full-rewrite — avoids 261MB in-memory copy
function appendDevCacheEntry(key, payload) {
  const path = devCachePath();
  try {
    ensureDevCacheDir();
    const line = JSON.stringify({ key, payload, ts: Date.now() }) + "\n";
    appendFileSync(path, line);
  } catch {
    // best-effort dev cache
  }
}

function ensureDevCacheDir() {
  mkdirSync(researchCacheDir(), { recursive: true });
}
