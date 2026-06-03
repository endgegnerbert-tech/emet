import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
});

test("package manifest ships MCP host config examples", () => {
  assert.ok(pkg.files.includes("configs"));
  assert.ok(pkg.files.includes(".agents"));
  assert.ok(pkg.files.includes(".claude-plugin"));
  assert.ok(pkg.files.includes(".codex-plugin"));
  assert.ok(pkg.files.includes("plugins"));
  assert.equal(existsSync("configs/claude-code/mcp.json"), true);
  assert.equal(existsSync("configs/cursor/mcp.json"), true);
  assert.equal(existsSync("configs/vscode-copilot/mcp.json"), true);
  assert.equal(existsSync("configs/codex/config.toml"), true);
  assert.equal(existsSync("configs/gemini/settings.json"), true);
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
});
