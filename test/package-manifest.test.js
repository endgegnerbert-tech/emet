import test from "node:test";
import assert from "node:assert/strict";
import pkg from "../package.json" with { type: "json" };

test("package manifest exposes the pi extension entrypoint", () => {
  assert.equal(pkg.name, "emet");
  assert.equal(pkg.pi.extensions[0], "./extensions/emet.ts");
});

test("package manifest exposes MCP CLI aliases", () => {
  assert.equal(pkg.bin["emet"], "./bin/emet.js");
  assert.equal(pkg.bin["emet-mcp"], "./bin/emet-mcp.js");
});
