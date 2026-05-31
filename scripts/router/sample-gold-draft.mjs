#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export * from "./train/sample-gold-draft.mjs";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./train/sample-gold-draft.mjs", import.meta.url)), ...process.argv.slice(2)], { stdio: "inherit" });
  process.exitCode = result.status ?? (result.signal ? 1 : 0);
}
