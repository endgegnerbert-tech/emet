# Emet Lean & Robust Plan

**Date:** 2026-06-06 (final)
**Context:** emet ist eine Research Engine (3 npm deps). Läuft als Pi Extension, MCP Server (Claude Code, Cursor), CLI, und npm Modul.

---

## 🔍 Aktuelle Realität

**`research-cache.json` ist der EINZIGE Cache für ALLE Nutzer.** Hartcodiert in `lib/research-memory.js:7`:

```js
const CACHE_PATH = join(homedir(), ".pi", "agent", "lazy-modules", "emet", ".cache", "research-cache.json");
```

| Nutzer | Installiert | Cache-Pfad (heute) | Problem |
|---|---|---|---|
| **Pi User** | `pi add @black-knight.dev/emet` | `~/.pi/agent/lazy-modules/emet/.cache/` | ✅ Passt |
| **MCP User** (Claude Code, Cursor) | `npm i -g @black-knight.dev/emet` | `~/.pi/agent/lazy-modules/emet/.cache/` | ❌ `~/.pi/` wird künstlich erstellt |
| **npm Modul** | `npm install @black-knight.dev/emet` | `~/.pi/agent/lazy-modules/emet/.cache/` | ❌ Selbes Problem |

**Erkenntnis:** Der Pfad muss sich unterscheiden — Pi User vs Standalone User.

---

## 🏗️ Ziel-Architektur

### Speicherort je nach Kontext

**Erkennung:** `process.env.PI_CODING_AGENT === "true"` → Pi Kontext

| Kontext | Pfad | Begründung |
|---|---|---|
| **Pi Extension** | `~/.pi/agent/lazy-modules/emet/.cache/emet-context.db` | Pi verwaltet `~/.pi/`, lazy-modules ist pi's Cache-Dir |
| **MCP / CLI / npm standalone** | macOS: `~/Library/Caches/emet/emet-context.db` | XDG-kompatibel, kein pi-Kram für Nicht-Pi-Nutzer |
| | Linux: `~/.cache/emet/emet-context.db` | XDG_CACHE_HOME Standard |
| | Windows: `%LOCALAPPDATA%/emet-cache/emet-context.db` | Windows-Standard |
| **Immer via ENV** | `EMET_CONTEXT_PATH=/pfad/emet-context.db` | Expliziter Override |

```js
import { homedir, platform } from "node:os";

function defaultDbPath() {
  if (process.env.EMET_CONTEXT_PATH) return process.env.EMET_CONTEXT_PATH;
  
  // Pi-Kontext → pi's Directory
  if (process.env.PI_CODING_AGENT === "true") {
    return join(homedir(), ".pi", "agent", "lazy-modules", "emet", ".cache", "emet-context.db");
  }
  
  // Standalone → XDG-kompatibel
  const os = platform();
  if (os === "darwin") {
    return join(homedir(), "Library", "Caches", "emet", "emet-context.db");
  }
  if (os === "win32") {
    return join(process.env.LOCALAPPDATA || homedir(), "emet-cache", "emet-context.db");
  }
  // Linux / others
  const xdgCache = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(xdgCache, "emet", "emet-context.db");
}
```

### DB-Schema

```sql
-- 📦 Schneller Research-Cache (Key-Value)
CREATE TABLE global_usage_cache (
  cache_key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  project TEXT NOT NULL DEFAULT '',
  ttl INTEGER NOT NULL,          -- expiresAt timestamp
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 🔎 Pages & Results mit Volltextsuche
CREATE VIRTUAL TABLE artifacts USING fts5(
  project,      -- cwd-Hash oder "global"
  source,       -- "emet:page:<url>" oder "emet:research:<query_hash>"
  content,      -- JSON { url, title, fullText, sourceType, ... }
  tokenize='trigram'
);

-- 📝 Events/Traces (optional, nur Debug)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ⏱️ Metadaten für Cleanup
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- z.B. ('schema_version', '1'), ('last_cleanup', '1749264000')
```

### DB-Pragmas (best practice)

```js
db.pragma('journal_mode = WAL');       // Concurrent reads, kein Lock
db.pragma('synchronous = NORMAL');     // Safety vs Speed Balance
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -8000');       // ~8MB page cache
db.pragma('busy_timeout = 3000');      // 3s warten bei Konflikt
db.pragma('auto_vacuum = INCREMENTAL'); // cleanup ohne VACUUM FULL
```

---

## 🔄 Migration: research-cache.json → emet-context.db

### Prinzipien
1. **No data loss** — erst kopieren, dann markieren
2. **Idempotent** — mehrmals ausführen = kein Schaden
3. **Silent** — kein Prompt, kein Spam
4. **Atomic** — DB schreiben BEVOR alte Datei markieren
5. **Backwards compatible** — alter Code kann JSON noch lesen

### Logik (in `lib/research-memory.js:migrateIfNeeded()`)

```
Beim ersten Start:
  ├─ emet-context.db existiert?           → YES → fertig
  ├─ research-cache.json existiert?       → NO  → fertig
  ├─ .migrated-from-json existiert?       → YES → überspringen
  └─ ALLE DREI checks negativ → Migration:
       1. JSON lesen
       2. Nicht-abgelaufene Einträge in DB schreiben
       3. .migrated-from-json schreiben
       4. research-cache.json → research-cache.json.migrated
```

**Was passiert bei Fehler?**
→ `console.error("emet: cache migration failed (harmless)", err.message)`
→ emet startet mit leerer DB — kein Crash, kein Datenverlust
→ Alte JSON bleibt unangetastet für manuelle Migration

**Ablauf im Detail:**

```js
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const MIGRATED_FLAG = ".migrated-from-json";

function migrateFromJson(dbPath, oldJsonPath, cacheDir) {
  if (existsSync(dbPath)) return;                              // bereits migriert
  if (existsSync(join(cacheDir, MIGRATED_FLAG))) return;      // bereits markiert
  if (!existsSync(oldJsonPath)) return;                        // nix zu migrieren

  try {
    const oldData = JSON.parse(readFileSync(oldJsonPath, "utf8"));
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE IF NOT EXISTS global_usage_cache (...)`);

    const insert = db.prepare(
      `INSERT OR IGNORE INTO global_usage_cache (cache_key, value, project, ttl) VALUES (?, ?, '', ?)`
    );
    const tx = db.transaction(() => {
      for (const [key, entry] of Object.entries(oldData)) {
        const expiresAt = entry.expiresAt ?? entry.ttl ?? 0;
        if (expiresAt > Date.now()) {
          insert.run(key, JSON.stringify(entry.value), expiresAt);
        }
      }
    });
    tx();
    db.close();

    writeFileSync(join(cacheDir, MIGRATED_FLAG), String(Date.now()));
    renameSync(oldJsonPath, oldJsonPath + ".migrated");
  } catch (err) {
    console.error("emet: cache migration failed (harmless):", err.message);
  }
}
```

---

## 🏗️ Phase 0: Scrapling Raus (343MB Müll)

**Aktuell:** `.venv-scrapling/` (330MB) + `Scrapling/` (13MB) + ~350 Zeilen Python-Daemon

**Fix:**
1. `.venv-scrapling/` + `Scrapling/` löschen + `.gitignore`
2. `page-fetch-adapter.js` → behalten: `assessPageAttempt, chooseScraplingMode, stripHtml, BLOCKED_PATTERNS, DYNAMIC_PATTERNS`. Alles andere raus.
3. In `web-research.js`: Scrapling-Block → sofort Jina-Fallback

**Ergebnis:** −343MB, −350 Zeilen, 5 Fehlermodi eliminiert, kein Python.

---

## 🏗️ Phase 1: emet-context.db (SQLite FTS5)

### Was ändert sich in `lib/research-memory.js`

**`writeCachedResult(key, value, ttlMs)` — neu:**
```js
export function writeCachedResult(key, value, ttlMs) {
  // 1. In-Memory (schnellster Pfad)
  memory.set(`persistent:${key}`, { expiresAt: Date.now() + ttlMs, value });

  // 2. DB (global_usage_cache)
  try {
    const db = getDb();
    db.prepare(`INSERT OR REPLACE INTO global_usage_cache (cache_key, value, project, ttl)
                VALUES (?, ?, '', ?)`).run(
      key, JSON.stringify({ expiresAt: Date.now() + ttlMs, value }), Date.now() + ttlMs
    );
  } catch (err) {
    console.error("emet: cache write failed", err.message);
  }

  // 3. Dev-Cache (optional, für Analyse)
  if (process.env.EMET_DEV_CACHE) appendToDevJson(key, { expiresAt: Date.now() + ttlMs, value });

  return value;
}
```

**`readCachedResult(key)` — neu:**
```js
export function readCachedResult(key) {
  // 1. In-Memory
  const inMemory = memory.get(`persistent:${key}`);
  if (inMemory) {
    if (inMemory.expiresAt > Date.now()) return inMemory.value;
    memory.delete(`persistent:${key}`);
  }

  // 2. DB
  try {
    const row = getDb().prepare(`SELECT value FROM global_usage_cache WHERE cache_key = ?`).get(key);
    if (!row) return null;
    const parsed = JSON.parse(row.value);
    if (parsed.expiresAt <= Date.now()) {
      getDb().prepare(`DELETE FROM global_usage_cache WHERE cache_key = ?`).run(key);
      return null;
    }
    memory.set(`persistent:${key}`, parsed);
    return parsed.value;
  } catch { return null; }
}
```

### runtimeTrace raus aus dem Cache

**Heute:** `runtimeTrace` ist 97-100% jedes Cache-Eintrags (400-800KB von 6MB Datei)
**Neu:** Nur slim Result in `global_usage_cache`:
```js
const slimResult = {
  answer, bullets, citations,
  sources: result.sources.map(s => ({ title: s.title, url: s.url, sourceType: s.sourceType })),
  confidence, sufficient, // KEIN runtimeTrace
};
writeCachedResult(cacheKey, slimResult, config.cacheTtlMs);
```
`runtimeTrace` → nur in `events`-Tabelle wenn `EMET_DEV_CACHE` gesetzt.

### In-Memory Cache Size Limit
```js
const MAX_MEMORY_ENTRIES = 100;
function trimMemory() {
  if (memory.size <= MAX_MEMORY_ENTRIES) return;
  const entries = [...memory.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const toDelete = entries.slice(0, memory.size - MAX_MEMORY_ENTRIES);
  for (const [key] of toDelete) memory.delete(key);
}
```

---

## 🧹 Cache Maintenance (best practice, cron-los)

Einfach, robust, no-dependency — läuft inline bei Gelegenheit:

```js
// Wird beim Start + regelmäßig getriggert
function cleanupExpired() {
  try {
    const db = getDb();
    const deleted = db.prepare(`DELETE FROM global_usage_cache WHERE ttl < ?`).run(Date.now());
    if (deleted.changes > 0) {
      db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('last_cleanup', ?)`).run(String(Date.now()));
    }
  } catch { /* cleanup ist nicht kritisch */ }
}
// Wird aufgerufen bei: writeCachedResult (jeder 10.), getDb (erster Aufruf)
```

**Warum kein separater Cron/Thread?**
- emet ist ein CLI-Tool, kein Daemon
- Cleanup inline = keine zusätzliche Infrastruktur
- SQLite WAL + `DELETE` = schnell, blockiert nicht

---

## 🔧 Weitere Verbesserungen (best practice research)

### 1. Cache-Keys mit Prefix + Version

**Heute:** `modeCacheKey()` hash-t alle Config-Optionen → langer String
**Besser:**
```js
function modeCacheKey(query, config) {
  const stable = JSON.stringify({
    mode: config.mode,
    files: config.files,
    // NUR felder die Cache-Invalidierung beeinflussen
    allowedSources: config.allowedSources,
    allowedSourceTypes: config.allowedSourceTypes,
    maxPages: config.maxPages,
    maxTurns: config.maxTurns,
    searchProvider: config.searchProvider,
  });
  return `emet:v1:${hashResearchQuery(query)}:${hashText(stable)}`;
}
```
→ Prefix `emet:v1:` macht die Keys identifizierbar in der DB

### 2. Artifact-Suche für User

emet kann dem Agent ermöglichen, im **eigenen Cache zu suchen**:
```sql
SELECT source, content FROM artifacts WHERE content MATCH 'transformer attention'
```
→ Kein erneuter Fetch für bekannte Themen
→ Wird via `artifacts`-Tabelle bedient, nicht `global_usage_cache`

### 3. Memory-Leak-Fix für in-Memory-Caches

```js
// pageCache + searchCache in web-research.js kriegen Size-Limit
const MAX_PAGE_CACHE = 100;
const MAX_SEARCH_CACHE = 200;

function setCacheValue(cache, key, value, ttlMs) {
  if (cache.size >= (cache === pageCache ? MAX_PAGE_CACHE : MAX_SEARCH_CACHE)) {
    // Ältesten Eintrag entfernen (lazy eviction reicht nicht)
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
```

### 4. JSON.stringify Safety

```js
function safeJsonStringify(value) {
  try { return JSON.stringify(value); }
  catch { return JSON.stringify({ ok: false, error: "circular or non-serializable value" }); }
}

function safeJsonParse(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}
```

---

## 📦 Phase 2: Content-Extraktion (+3 Dependencies)

### 2.1 `@extractus/article-extractor` (+2MB) — P1
```js
const article = await extractFromHtml(html, url);
// → { title, description, content (HTML), author, published, ttr }
```

### 2.2 `turndown` (+1MB) — P2
```js
const markdown = new TurndownService({ codeBlockStyle: 'fenced' }).turndown(article.content);
```

### 2.3 `pdfjs-dist` (+8MB, optional) — P1
PDF-Parsing für `academic` mode.

---

## ⚡ Phase 3: Web-Fetch (0 Dependencies)

- User-Agent Rotation (3 UAs, random per request)
- Domain-spezifische Timeouts (`arxiv.org: 15s, github.com: 5s`)

---

## ❌ Phase 4: Code Language Detection — gestrichen

`@vscode/languagedetection` (+5MB) — erst wenn ein Consumer Language-Tags braucht.

---

## 📊 Dependency Budget

| Phase | Änderung | Größe | Kummuliert |
|---|---|---|---|
| Aktuell | 3 npm deps | ~179MB | 179MB |
| 0: Scrapling raus | −Python | −343MB | 179MB |
| 1: better-sqlite3 | +1 | +3MB | 182MB |
| 2.1: article-extractor | +1 | +2MB | 184MB |
| 2.2: turndown | +1 | +1MB | 185MB |
| 2.3: pdfjs-dist | +1 (opt) | +8MB | 193MB |

**Netto:** +4 npm deps, −343MB Python → **−329MB, leaner, schneller, stabiler.**

---

## 🎯 Priority Matrix

| Task | Δ | Aufwand | Impact |
|---|---|---|---|
| **P0** Scrapling raus | −343MB | ~1h | 🔥 |
| **P0** emet-context.db | +3MB | ~3h | 🔥 |
| **P0** Migration JSON→DB | 0 | ~1h | 🔥 |
| **P1** Article-Extraktion | +2MB | ~2h | 🔥 |
| **P1** PDF (pdfjs-dist) | +8MB (opt) | ~2h | 🔥 |
| **P1** Cache Size Limits | 0 | ~0.5h | 🔥 |
| **P1** JSON.stringify Safety | 0 | ~15min | 🔥 |
| **P2** turndown | +1MB | ~1h | ✅ |
| **P3** User-Agent Rotation | 0 | ~30min | ⚡ |
| **P4** Code Language Detection | ❌ | — | ❌ |

---

## 🔑 Architektur-Entscheidungen (final)

1. **Speicherort je nach Kontext** — Pi: `~/.pi/...` / Standalone: XDG (`~/.cache/emet/` oder `~/Library/Caches/emet/`)
2. **`PI_CODING_AGENT=true`** ist der Detection-Switch
3. **`EMET_CONTEXT_PATH`** als Override für alle
4. **`better-sqlite3`** — standalone, keine pi-context-Kopplung
5. **Global + project-Column** — ein DB-File, cross-project Cache Hits + Isolation
6. **`runtimeTrace` raus aus dem Cache** — 98% Bloat Elimination
7. **Migration: silent, idempotent, safe** — `.migrated-from-json` Flag
8. **In-Memory & DB Size Limits** — keine Memory Leaks mehr
9. **`EMET_DEV_CACHE`** für Dev-Analyse (optional)
