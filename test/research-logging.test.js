import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { logResearchEvent } from "../lib/local-logger.js";
import { readLocalFiles } from "../lib/research/fetch.js";

test("default research logs omit cwd, stacks, and raw config/result blobs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "emet-logs-"));
  const previousLogPath = process.env.EMET_LOG_PATH;
  const path = join(dir, "research.jsonl");
  process.env.EMET_LOG_PATH = path;

  try {
    const error = new Error("provider failed");
    error.code = "ETEST";
    await logResearchEvent("test_event", {
      config: { hostAllowlist: ["secret.internal"], pageTextLimit: 123 },
      result: { answer: "raw answer", sources: [{ url: "https://example.com", text: "raw text" }], pageTexts: ["raw page"] },
      error,
    });

    const line = (await readFile(path, "utf8")).trim();
    const record = JSON.parse(line);

    assert.equal("cwd" in record, false);
    assert.equal(record.data.config, "[Redacted config]");
    assert.equal(record.data.result.redacted, true);
    assert.equal(record.data.result.sourceCount, 1);
    assert.equal(record.data.result.pageTextCount, 1);
    assert.deepEqual(record.data.error, { name: "Error", message: "provider failed" });
    assert.equal(JSON.stringify(record).includes("raw answer"), false);
    assert.equal(JSON.stringify(record).includes("raw page"), false);
    assert.equal(JSON.stringify(record).includes("stack"), false);
  } finally {
    if (previousLogPath === undefined) delete process.env.EMET_LOG_PATH;
    else process.env.EMET_LOG_PATH = previousLogPath;
    await rm(dir, { recursive: true, force: true });
  }
});

test("readLocalFiles redacts local paths in default logs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "emet-local-file-log-test-"));
  const previousLogPath = process.env.EMET_LOG_PATH;
  const logPath = join(dir, "research.jsonl");
  const filePath = join(dir, "private-note.txt");
  process.env.EMET_LOG_PATH = logPath;

  try {
    await writeFile(filePath, "local file content ".repeat(20), "utf8");
    const pages = await readLocalFiles([filePath], { pageTextLimit: 1000, minPageText: 1 });
    assert.equal(pages.length, 1);

    const record = JSON.parse((await readFile(logPath, "utf8")).trim());
    assert.match(record.data.path, /^\[local-file:[a-f0-9]+:private-note\.txt\]$/);
    assert.equal(record.data.path.includes(dir), false);
  } finally {
    if (previousLogPath === undefined) delete process.env.EMET_LOG_PATH;
    else process.env.EMET_LOG_PATH = previousLogPath;
    await rm(dir, { recursive: true, force: true });
  }
});
