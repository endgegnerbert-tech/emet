#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(process.execPath, [fileURLToPath(new URL("./export/extract_followup_candidates.js", import.meta.url)), ...process.argv.slice(2)], { stdio: "inherit" });
process.exitCode = result.status ?? (result.signal ? 1 : 0);
