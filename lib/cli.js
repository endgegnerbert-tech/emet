import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json" with { type: "json" };
import { pageStoreStats } from "./research-memory.js";
import { webFetch } from "./web-research.js";
import { runCollectorDoctor } from "./collectors/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const HOSTS = {
  "claude-code": {
    source: "configs/claude-code/mcp.json",
    target: ".mcp.json",
    label: "Claude Code",
  },
  codex: {
    source: "configs/codex/config.toml",
    target: ".codex/config.toml",
    label: "Codex",
  },
  cursor: {
    source: "configs/cursor/mcp.json",
    target: ".cursor/mcp.json",
    label: "Cursor",
  },
  gemini: {
    source: "configs/gemini/settings.json",
    target: ".gemini/settings.json",
    label: "Gemini CLI",
  },
  "vscode-copilot": {
    source: "configs/vscode-copilot/mcp.json",
    target: ".vscode/mcp.json",
    label: "VS Code / Copilot",
  },
};

function usage() {
  return `emet ${packageJson.version}

Usage:
  emet                     Start the MCP stdio server
  emet doctor              Check local install health
  emet init <host> [--print|--write] [--path <file>]
  emet fetch <url> [--json]

Hosts: ${Object.keys(HOSTS).join(", ")}
`;
}

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "path" || key === "mode") {
      values.set(key, argv[++i]);
    } else {
      flags.add(key);
    }
  }
  return { positional, flags, values };
}

function readConfig(host) {
  const entry = HOSTS[host];
  if (!entry) throw new Error(`Unknown host: ${host}`);
  return readFileSync(resolve(ROOT, entry.source), "utf8").trimEnd() + "\n";
}

export function runDoctor({ cwd = process.cwd(), nodeVersion = process.version } = {}) {
  const nodeMajor = Number(nodeVersion.replace(/^v/, "").split(".")[0]);
  const checks = [];
  const add = (name, ok, note, fix = "") => checks.push({ name, ok, note, fix });

  add("node", nodeMajor >= 20, `${nodeVersion} (requires Node 20+)`, "Install Node.js 20 or newer.");
  add("package", Boolean(packageJson.name && packageJson.version), `${packageJson.name}@${packageJson.version}`);
  add("mcp binary", existsSync(resolve(ROOT, "bin/emet-mcp.js")), "bin/emet-mcp.js");
  add("pi extension", existsSync(resolve(ROOT, "extensions/emet.ts")), "extensions/emet.ts");

  for (const [host, entry] of Object.entries(HOSTS)) {
    add(`${host} config`, existsSync(resolve(ROOT, entry.source)), entry.source);
  }

  // Add collector availability checks
  const collectorResult = runCollectorDoctor();
  for (const check of collectorResult.checks) {
    checks.push(check);
  }

  const stats = pageStoreStats();
  const hardFailures = checks.filter((check) => !check.ok && ["node", "package", "mcp binary", "pi extension"].includes(check.name));
  const lines = [
    `emet doctor (${packageJson.version})`,
    `cwd: ${cwd}`,
    `page store: ${stats.pages} pages, ${stats.bytes} bytes (${stats.path})`,
    "",
    ...checks.map((check) => `${check.ok ? "ok" : check.name.startsWith("collector:") ? "warn" : "fail"} ${check.name}: ${check.note}${check.ok || !check.fix ? "" : `\n  fix: ${check.fix}`}`),
  ];
  return { ok: hardFailures.length === 0, checks, text: lines.join("\n") };
}

export function initHost(host, { print = true, write = false, path = null, cwd = process.cwd() } = {}) {
  const entry = HOSTS[host];
  if (!entry) throw new Error(`Unknown host: ${host}`);
  const content = readConfig(host);
  const target = resolve(cwd, path || entry.target);
  if (write) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const text = print
    ? content
    : `${write ? "wrote" : "would write"} ${entry.label} config to ${target}`;
  return { host, target, content, wrote: write, text };
}

export async function runCli(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  const { positional, flags, values } = parseArgs(argv);
  const command = positional[0];

  if (!command || command === "mcp") {
    const { startMcpServer } = await import("../mcp/index.js");
    startMcpServer();
    return 0;
  }

  if (command === "--help" || command === "help") {
    stdout.write(usage());
    return 0;
  }

  if (command === "doctor") {
    const result = runDoctor();
    stdout.write(result.text + "\n");
    return result.ok ? 0 : 1;
  }

  if (command === "init") {
    const host = positional[1];
    if (!host) throw new Error(`Missing host.\n${usage()}`);
    const write = flags.has("write");
    const print = flags.has("print") || !write;
    const result = initHost(host, { print, write, path: values.get("path") });
    stdout.write(result.text + (result.text.endsWith("\n") ? "" : "\n"));
    return 0;
  }

  if (command === "fetch") {
    const url = positional[1];
    if (!url) throw new Error("Missing URL for emet fetch <url>");
    const result = await webFetch(url, undefined, { mode: values.get("mode") || "fast", isolate: flags.has("force") });
    stdout.write((flags.has("json") ? JSON.stringify(result, null, 2) : (result.ok ? result.text : JSON.stringify(result, null, 2))) + "\n");
    return result.ok ? 0 : 1;
  }

  stderr.write(`Unknown command: ${command}\n\n${usage()}`);
  return 1;
}
