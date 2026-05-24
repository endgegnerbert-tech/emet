import test from "node:test";
import assert from "node:assert/strict";

import { observedActionFromResult, sourceMetaFromPages } from "../scripts/router/followup-log-utils.js";

test("sourceMetaFromPages treats publishDate-backed freshness as recent", () => {
  const meta = sourceMetaFromPages([
    {
      url: "https://example.com/docs",
      sourceType: "official_doc",
      authoritative: true,
      publishDate: new Date().toISOString().slice(0, 10),
    },
  ]);

  assert.equal(meta.has_authority, true);
  assert.equal(meta.has_recent, true);
  assert.equal(meta.source_count, 1);
});

test("sourceMetaFromPages treats canonical freshness buckets as recent", () => {
  const meta = sourceMetaFromPages([
    {
      url: "https://example.com/docs",
      sourceType: "official_doc",
      authoritative: true,
      freshness: "this_week",
    },
  ]);

  assert.equal(meta.has_recent, true);
});

test("sourceMetaFromPages recognizes news-like sources canonically", () => {
  const meta = sourceMetaFromPages([
    {
      url: "https://www.reuters.com/world/example-story",
      title: "Example Story",
      sourceType: "news",
    },
  ]);

  assert.equal(meta.has_news, true);
});

test("observedActionFromResult uses version metadata when version coverage is missing", () => {
  const action = observedActionFromResult({
    followupRounds: 1,
    meta: {
      versionContext: { versionSensitive: true, explicitVersion: true },
      versionCoverage: { exactMatchSources: 0, mismatchSources: 2 },
    },
  });

  assert.equal(action, "need_version_context");
});
