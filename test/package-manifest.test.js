import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import pkg from "../package.json" with { type: "json" };

test("package manifest exposes the pi extension entrypoint", () => {
  assert.equal(pkg.name, "@black-knight.dev/emet");
  assert.equal(pkg.pi.extensions[0], "./extensions/emet.ts");
});

test("package manifest exposes MCP CLI aliases", () => {
  assert.equal(pkg.bin["emet"], "bin/emet.js");
  assert.equal(pkg.bin["emet-mcp"], "bin/emet-mcp.js");
  assert.equal(existsSync("bin/emet.js"), true);
  assert.equal(existsSync("bin/emet-mcp.js"), true);
  assert.equal(Boolean(statSync("bin/emet.js").mode & 0o111), true);
  assert.equal(Boolean(statSync("bin/emet-mcp.js").mode & 0o111), true);
});

test("package manifest ships MCP host config examples", () => {
  assert.ok(pkg.files.includes("configs"));
  assert.ok(pkg.files.includes(".agents"));
  assert.ok(pkg.files.includes(".claude-plugin"));
  assert.ok(pkg.files.includes(".codex-plugin"));
  assert.ok(pkg.files.includes("plugins"));
  assert.ok(pkg.files.includes("CHANGELOG.md"));
  assert.ok(pkg.files.includes("CONTRIBUTING.md"));
  assert.ok(pkg.files.includes("SECURITY.md"));
  assert.ok(pkg.files.includes("docs/README.md"));
  assert.ok(pkg.files.includes("docs/quickstarts.md"));
  assert.ok(pkg.files.includes("docs/examples.md"));
  assert.ok(pkg.files.includes("docs/hosts"));
  assert.ok(pkg.files.includes("docs/reference"));
  assert.ok(pkg.files.includes("docs/tool-reference.md"));
  assert.ok(pkg.files.includes("docs/pipeline.md"));
  assert.ok(pkg.files.includes("docs/releases"));
  assert.equal(existsSync("configs/claude-code/mcp.json"), true);
  assert.equal(existsSync("configs/cursor/mcp.json"), true);
  assert.equal(existsSync("configs/vscode-copilot/mcp.json"), true);
  assert.equal(existsSync("configs/codex/config.toml"), true);
  assert.equal(existsSync("configs/gemini/settings.json"), true);
  assert.equal(existsSync("SECURITY.md"), true);
  assert.equal(existsSync("docs/README.md"), true);
  assert.equal(existsSync("docs/tool-reference.md"), true);
  assert.equal(existsSync("docs/hosts/README.md"), true);
  assert.equal(existsSync("docs/reference/README.md"), true);
  assert.equal(existsSync(".claude-plugin/plugin.json"), true);
  assert.equal(existsSync(".claude-plugin/marketplace.json"), true);
  assert.equal(existsSync(".agents/plugins/marketplace.json"), true);
  assert.equal(existsSync(".codex-plugin/plugin.json"), true);
  assert.equal(existsSync(".codex-plugin/mcp.json"), true);
  assert.equal(existsSync("plugins/emet/start.mjs"), true);
});

test("plugin manifests are aligned to the package version", async () => {
  const claudePlugin = (await import("../.claude-plugin/plugin.json", { with: { type: "json" } })).default;
  const codexPlugin = (await import("../.codex-plugin/plugin.json", { with: { type: "json" } })).default;
  const bundledCodexPlugin = (await import("../plugins/emet/.codex-plugin/plugin.json", { with: { type: "json" } })).default;
  assert.equal(claudePlugin.version, pkg.version);
  assert.equal(codexPlugin.version, pkg.version);
  assert.equal(bundledCodexPlugin.version, pkg.version);
  const bootstrap = readFileSync("plugins/emet/start.mjs", "utf8");
  assert.ok(!bootstrap.includes("PACKAGE_VERSION = \"latest\""));
  assert.ok(bootstrap.includes(".codex-plugin"));
});

test("package declares the Node floor and omits unused markdown converter", () => {
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(Object.hasOwn(pkg.dependencies, "turndown"), false);
});

test("package exposes only documented public subpaths", () => {
  assert.deepEqual(pkg.exports, {
    ".": "./index.js",
    "./web-research": "./lib/web-research.js",
    "./research": "./lib/research.js",
    "./research-contract": "./lib/research-contract.js",
    "./research-flow": "./lib/research-flow.js",
    "./mcp-server": "./mcp-server.js",
    "./mcp": "./mcp/index.js",
    "./package.json": "./package.json",
  });
  for (const target of Object.values(pkg.exports)) {
    if (target === "./package.json") continue;
    assert.equal(existsSync(target), true, `${target} exists`);
  }
});

test("package check includes the tarball install smoke", () => {
  assert.match(pkg.scripts["pack:smoke"], /package-install-smoke\.mjs/);
  assert.match(pkg.scripts.check, /npm run pack:smoke/);
});
