#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const server = JSON.parse(readFileSync("server.json", "utf8"));
const codexPlugin = JSON.parse(readFileSync(".codex-plugin/plugin.json", "utf8"));
const claudePlugin = JSON.parse(readFileSync(".claude-plugin/plugin.json", "utf8"));
const bundledCodexPlugin = JSON.parse(readFileSync("plugins/emet/.codex-plugin/plugin.json", "utf8"));
const bootstrap = readFileSync("plugins/emet/start.mjs", "utf8");
const publishWorkflow = readFileSync(".github/workflows/publish.yml", "utf8");

function fail(message) {
  throw new Error(`package surface audit failed: ${message}`);
}

for (const [name, target] of Object.entries(pkg.bin || {})) {
  if (!existsSync(target)) fail(`missing bin target ${name}: ${target}`);
  if ((statSync(target).mode & 0o111) === 0) fail(`bin target is not executable: ${target}`);
}

for (const [label, version] of Object.entries({
  "server.json": server.version,
  "server.json.packages[0]": server.packages?.[0]?.version,
  ".codex-plugin/plugin.json": codexPlugin.version,
  ".claude-plugin/plugin.json": claudePlugin.version,
  "plugins/emet/.codex-plugin/plugin.json": bundledCodexPlugin.version,
})) {
  if (version !== pkg.version) fail(`${label} version ${version} != package ${pkg.version}`);
}

if (bootstrap.includes("@latest") || bootstrap.includes('PACKAGE_VERSION = "latest"')) {
  fail("Codex bootstrap must not install latest");
}
if (!bootstrap.includes("PACKAGE_VERSION")) fail("Codex bootstrap must pin package version");
if (pkg.engines?.node !== ">=20") fail("package must declare Node >=20");
if (Object.hasOwn(pkg.dependencies || {}, "turndown")) fail("unused turndown dependency is present");

for (const dep of ["@extractus/article-extractor", "@napi-rs/canvas", "pdfjs-dist"]) {
  if (!Object.hasOwn(pkg.dependencies || {}, dep)) {
    fail(`high-quality extraction dependency is missing: ${dep}`);
  }
}

for (const [subpath, target] of Object.entries({
  ".": "./index.js",
  "./web-research": "./lib/web-research.js",
  "./research": "./lib/research.js",
  "./research-contract": "./lib/research-contract.js",
  "./research-flow": "./lib/research-flow.js",
  "./mcp-server": "./mcp-server.js",
  "./mcp": "./mcp/index.js",
})) {
  if (pkg.exports?.[subpath] !== target) fail(`missing export ${subpath} -> ${target}`);
}

if (!pkg.scripts?.["pack:smoke"]?.includes("package-install-smoke.mjs")) {
  fail("pack:smoke must run package-install-smoke.mjs");
}
if (!pkg.scripts?.check?.includes("npm run pack:smoke")) {
  fail("check must include the tarball install smoke");
}
if (!publishWorkflow.includes("id-token: write")) fail("publish workflow must allow OIDC id-token");
if (!publishWorkflow.includes("npm publish --provenance --access public")) {
  fail("publish workflow must publish with provenance");
}
if (/NODE_AUTH_TOKEN|NPM_TOKEN/.test(publishWorkflow)) {
  fail("publish workflow must not use long-lived npm tokens");
}

console.error(`package surface audit ok (${pkg.name}@${pkg.version})`);
