#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const temp = await mkdtemp(join(tmpdir(), "emet-pack-smoke-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed\n${output}`);
  }
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

try {
  const packJson = run("npm", ["pack", "--json", "--pack-destination", temp]);
  const packInfo = JSON.parse(packJson)[0];
  if (!packInfo?.filename) throw new Error("npm pack did not return a tarball filename");
  const tarball = join(temp, packInfo.filename);

  run("npm", ["init", "-y"], { cwd: temp });
  run("npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: temp, stdio: "inherit" });

  const bin = join(temp, "node_modules", ".bin", "emet");
  const help = run(bin, ["--help"], { cwd: temp });
  if (!/Usage:\s+emet/s.test(help)) throw new Error("installed emet --help did not print usage");

  const doctor = run(bin, ["doctor"], { cwd: temp });
  if (!/emet doctor/i.test(doctor)) throw new Error("installed emet doctor did not run");

  run(process.execPath, [
    "--input-type=module",
    "-e",
    "import emet from '@black-knight.dev/emet'; import { startMcpServer } from '@black-knight.dev/emet/mcp-server'; if (typeof emet !== 'function' || typeof startMcpServer !== 'function') throw new Error('bad exports');",
  ], { cwd: temp });

  console.error(`package install smoke ok (${packInfo.name}@${packInfo.version})`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
