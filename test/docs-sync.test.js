import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import pkg from "../package.json" with { type: "json" };

test("docs/pipeline references only existing package scripts and paths", () => {
  const doc = readFileSync("docs/pipeline.md", "utf8");
  const scriptRefs = [...doc.matchAll(/npm run ([a-z0-9:_-]+)/gi)].map((match) => match[1]);
  for (const script of scriptRefs) {
    assert.ok(pkg.scripts[script], `missing package script referenced by docs/pipeline.md: ${script}`);
  }

  assert.equal(doc.includes("scripts/router/"), false);
  assert.equal(doc.includes("check:promotion"), false);
  assert.equal(doc.includes("audit:promotion"), false);
  assert.equal(doc.includes("audit:roadmap"), false);
});

test("package files allowlist points at existing docs", () => {
  for (const entry of pkg.files.filter((item) => item.startsWith("docs/"))) {
    assert.equal(existsSync(entry), true, `missing package files entry: ${entry}`);
  }
});
