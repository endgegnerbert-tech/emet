#!/usr/bin/env node
import { createReadStream, createWriteStream } from "node:fs";
import { readdir, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { getResearchLogPath } from "../../lib/local-logger.js";

const target = process.argv[2] || dirname(getResearchLogPath());
const maxBytes = Number(process.env.EMET_LOG_MAX_BYTES || 50 * 1024 * 1024);
const now = new Date().toISOString().replace(/[:.]/g, "-");

async function gzipFile(path) {
  const gzPath = `${path}.gz`;
  await pipeline(createReadStream(path), createGzip({ level: 9 }), createWriteStream(gzPath, { flags: "wx" }));
  await unlink(path);
  return gzPath;
}

async function rotateLargeActiveJsonl(path) {
  const info = await stat(path);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || info.size < maxBytes) return null;
  const rotated = join(dirname(path), `${basename(path, extname(path))}.${now}${extname(path)}`);
  await rename(path, rotated);
  return rotated;
}

const entries = await readdir(target, { withFileTypes: true });
const actions = [];
for (const entry of entries) {
  if (!entry.isFile()) continue;
  const path = join(target, entry.name);
  if (!entry.name.endsWith(".jsonl")) continue;
  if (entry.name === basename(getResearchLogPath())) {
    const rotated = await rotateLargeActiveJsonl(path);
    if (rotated) actions.push({ action: "rotated", path, rotated });
    continue;
  }
  const gzPath = await gzipFile(path);
  actions.push({ action: "compressed", path, gzPath });
}

console.log(JSON.stringify({ ok: true, target, actions }, null, 2));
