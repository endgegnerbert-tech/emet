import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const LOG_PATH = process.env.EMET_LOG_PATH || join(homedir(), ".pi", "logs", "emet.jsonl");
let writeChain = Promise.resolve();

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
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
    for (const [key, item] of Object.entries(value)) output[key] = sanitize(item, depth + 1, seen);
    seen.delete(value);
    return output;
  }
  return String(value);
}

export function getResearchLogPath() {
  return LOG_PATH;
}

export async function logResearchEvent(type, data = {}) {
  const record = {
    ts: new Date().toISOString(),
    pid: process.pid,
    cwd: process.cwd(),
    type,
    data: sanitize(data),
  };
  const line = `${JSON.stringify(record)}\n`;
  writeChain = writeChain
    .then(async () => {
      await mkdir(dirname(LOG_PATH), { recursive: true });
      await appendFile(LOG_PATH, line, "utf8");
    })
    .catch(() => {});
  return writeChain;
}
