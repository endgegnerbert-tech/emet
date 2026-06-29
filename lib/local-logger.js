import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";

let writeChain = Promise.resolve();
let loggerFailureCount = 0;
let loggerFailureReported = false;

function todayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function resolveResearchLogDir(env = process.env) {
  if (env.EMET_CONTEXT_PATH) return join(dirname(env.EMET_CONTEXT_PATH), "logs");

  if (env.PI_CODING_AGENT === "true") {
    return join(homedir(), ".pi", "agent", "lazy-modules", "emet", "logs");
  }

  const os = platform();
  if (os === "darwin") return join(homedir(), "Library", "Logs", "emet");
  if (os === "win32") return join(env.LOCALAPPDATA || homedir(), "emet", "logs");
  const xdgState = env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  return join(xdgState, "emet", "logs");
}

function resolveResearchLogPath(env = process.env, date = new Date()) {
  if (env.EMET_LOG_PATH) return env.EMET_LOG_PATH;
  return join(resolveResearchLogDir(env), `emet-${todayStamp(date)}.jsonl`);
}

async function rotateOversizedLogIfNeeded(path, env = process.env) {
  const maxBytes = Number(env.EMET_LOG_MAX_BYTES || 50 * 1024 * 1024);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return;

  try {
    const info = await stat(path);
    if (info.size < maxBytes) return;
    const suffix = new Date().toISOString().replace(/[:.]/g, "-");
    await rename(path, `${path}.${suffix}.old`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const REDACTED_BLOB_KEYS = new Set([
  "config",
  "result",
  "cachedResult",
  "persistentHit",
  "runtimeTrace",
  "contentText",
  "pageTexts",
  "rawConfig",
  "rawResult",
  "body",
  "html",
]);

function summarizeBlob(key, value) {
  if (key === "config") return "[Redacted config]";
  if (key === "result" || key === "cachedResult" || key === "persistentHit" || key === "rawResult") {
    return {
      redacted: true,
      ok: typeof value?.ok === "boolean" ? value.ok : undefined,
      outcome: typeof value?.outcome === "string" ? value.outcome : undefined,
      reason: typeof value?.reason === "string" ? value.reason : undefined,
      sourceCount: Array.isArray(value?.sources) ? value.sources.length : undefined,
      pageTextCount: Array.isArray(value?.pageTexts) ? value.pageTexts.length : undefined,
    };
  }
  return "[Redacted]";
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    if (depth >= 6) return "[MaxDepth]";
    return value.map((item) => sanitize(item, depth + 1, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    if (depth >= 6) return "[MaxDepth]";
    seen.add(value);
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = REDACTED_BLOB_KEYS.has(key) ? summarizeBlob(key, item) : sanitize(item, depth + 1, seen);
    }
    seen.delete(value);
    return output;
  }
  return String(value);
}

export function getResearchLogPath(date = new Date()) {
  return resolveResearchLogPath(process.env, date);
}

export function getResearchLoggerState() {
  return { failureCount: loggerFailureCount, failureReported: loggerFailureReported, path: getResearchLogPath() };
}

export async function logResearchEvent(type, data = {}) {
  const path = getResearchLogPath();
  const record = {
    schemaVersion: 1,
    ts: new Date().toISOString(),
    pid: process.pid,
    type,
    event: type,
    data: sanitize(data),
  };
  const line = `${JSON.stringify(record)}\n`;
  writeChain = writeChain
    .then(async () => {
      await mkdir(dirname(path), { recursive: true });
      await rotateOversizedLogIfNeeded(path);
      await appendFile(path, line, "utf8");
    })
    .catch((error) => {
      loggerFailureCount += 1;
      if (!loggerFailureReported) {
        loggerFailureReported = true;
        console.error("emet: research logger degraded:", error?.message || error);
      }
    });
  return writeChain;
}
