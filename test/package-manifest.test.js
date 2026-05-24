import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import pkg from "../package.json" with { type: "json" };

test("package manifest exposes the pi extension entrypoint", () => {
  assert.equal(pkg.name, "@black-knight.dev/emet");
  assert.equal(pkg.pi.extensions[0], "./extensions/emet.ts");
});

test("package manifest exposes MCP CLI aliases", () => {
  assert.equal(pkg.bin["emet"], "./emet.js");
  assert.equal(pkg.bin["emet-mcp"], "./emet-mcp.js");
});

test("package manifest ships MCP host config examples", () => {
  assert.ok(pkg.files.includes("configs"));
  assert.ok(pkg.files.includes(".claude-plugin"));
  assert.ok(pkg.files.includes(".codex-plugin"));
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
