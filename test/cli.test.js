import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initHost, runCli, runDoctor } from "../lib/cli.js";

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

test("runCli handles help before implicit MCP startup", async () => {
  let started = false;
  let output = "";
  const code = await runCli(["--help"], {
    stdout: { write: (text) => { output += text; } },
    stderr: { write() {} },
    startMcpServer: () => { started = true; },
  });

  assert.equal(code, 0);
  assert.equal(started, false);
  assert.match(output, /Usage:/);
});

test("runCli rejects unknown flag-only invocations before MCP startup", async () => {
  let started = false;
  let error = "";
  const code = await runCli(["--bogus"], {
    stdout: { write() {} },
    stderr: { write: (text) => { error += text; } },
    startMcpServer: () => { started = true; },
  });

  assert.equal(code, 1);
  assert.equal(started, false);
  assert.match(error, /Unknown global flag: --bogus/);
});

test("runCli starts MCP with no-telemetry opt-out", async () => {
  const previous = process.env.EMET_TELEMETRY_DISABLED;
  let started = false;
  try {
    delete process.env.EMET_TELEMETRY_DISABLED;
    const code = await runCli(["--no-telemetry"], {
      stdout: { write() {} },
      stderr: { write() {} },
      startMcpServer: () => { started = true; },
    });

    assert.equal(code, 0);
    assert.equal(started, true);
    assert.equal(process.env.EMET_TELEMETRY_DISABLED, "1");
  } finally {
    if (previous === undefined) delete process.env.EMET_TELEMETRY_DISABLED;
    else process.env.EMET_TELEMETRY_DISABLED = previous;
  }
});
