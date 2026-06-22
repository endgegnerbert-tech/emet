import test from "node:test";
import assert from "node:assert/strict";

import { readPageSnapshot, searchPageSnapshots, writePageSnapshot } from "../lib/research-memory.js";

test("persistent page store round-trips pages and FTS search", () => {
  const page = {
    url: `https://example.com/emet-page-store-${Date.now()}`,
    title: "Persistent Emet Page Store",
    fullText: "SQLite FTS5 stores reusable page content for cross session raw fetch reuse.",
    sourceType: "official_doc",
    codeBlocks: ["const ok = true;"],
    contentType: "text/html",
  };

  writePageSnapshot(page, 60_000);
  const cached = readPageSnapshot(page.url);
  assert.equal(cached.title, page.title);
  assert.match(cached.fullText, /cross session/);
  assert.deepEqual(cached.codeBlocks, page.codeBlocks);

  const found = searchPageSnapshots("SQLite FTS5 reusable", 5);
  assert.ok(found.some((item) => item.url === page.url));
});
