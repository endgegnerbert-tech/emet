import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initHost, runDoctor } from "../lib/cli.js";

test("doctor reports core install checks", () => {
  const result = runDoctor({ nodeVersion: process.version });
  assert.equal(result.ok, true);
  assert.match(result.text, /emet doctor/);
  assert.ok(result.checks.some((check) => check.name === "mcp binary" && check.ok));
});

test("initHost prints and writes shipped host config", () => {
  const cwd = mkdtempSync(join(tmpdir(), "emet-init-"));
  const printed = initHost("cursor", { print: true, write: false, cwd });
  assert.match(printed.content, /mcpServers/);
  assert.equal(printed.wrote, false);

  const written = initHost("cursor", { print: false, write: true, cwd });
  assert.equal(written.wrote, true);
  assert.equal(readFileSync(join(cwd, ".cursor/mcp.json"), "utf8"), printed.content);
});
