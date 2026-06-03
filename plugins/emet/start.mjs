#!/usr/bin/env node

import { mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "@black-knight.dev/emet";
const PACKAGE_VERSION = "1.2.4";
const HOST_ID = "codex";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.join(scriptDir, ".runtime");
const packageDir = path.join(runtimeDir, "node_modules", "@black-knight.dev", "emet");
const entrypoint = path.join(packageDir, "emet.js");

async function fileJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function ensureRuntime() {
  await mkdir(runtimeDir, { recursive: true });
  const installed = await fileJson(path.join(packageDir, "package.json"));
  if (installed?.version === PACKAGE_VERSION) return;
  await run(process.platform === "win32" ? "npm.cmd" : "npm", [
    "install",
    "--no-audit",
    "--no-fund",
    "--silent",
    "--prefix",
    runtimeDir,
    `${PACKAGE_NAME}@${PACKAGE_VERSION}`,
  ]);
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code ?? 1}`)));
    child.on("error", reject);
  });
}

await ensureRuntime();
await run(process.execPath, [entrypoint], { EMET_MCP_HOST: HOST_ID });
