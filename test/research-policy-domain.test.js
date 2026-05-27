import test from "node:test";
import assert from "node:assert/strict";

import { scoreSourceEntry } from "../lib/research.js";
import { buildAuthorityFollowUpQueries, buildConflictFollowUpQueries } from "../lib/research-policy.js";

test("medical routing prefers PubMed and guideline follow-ups", () => {
  const queries = buildAuthorityFollowUpQueries("clinical guideline for asthma treatment");
  assert.ok(queries.some((query) => /pubmed|guideline/i.test(query)));
});

test("news-current-events routing keeps authoritative wire-service sources", () => {
  const scored = scoreSourceEntry({
    url: "https://www.reuters.com/world/us/openai-announces-example-2026-05-27/",
    title: "OpenAI announces example",
    text: "OpenAI announced a new release according to Reuters.",
  }, "latest OpenAI announcement headlines");

  assert.equal(scored.sourceType, "news");
  assert.equal(scored.authoritative, true);
});

test("local-howto routing treats official government pages as authoritative", () => {
  const scored = scoreSourceEntry({
    url: "https://www.nyc.gov/site/finance/vehicles/parking-permits.page",
    title: "Parking permits | NYC.gov",
    text: "Official city instructions for parking permits and appointments.",
  }, "parking permit city hall appointment near me");

  assert.equal(scored.sourceType, "official_doc");
  assert.equal(scored.authoritative, true);
});

test("trading conflict follow-ups ask for exchange or regulator evidence", () => {
  const queries = buildConflictFollowUpQueries("nasdaq premarket trading hours today");
  assert.ok(queries.some((query) => /exchange|regulator|market notice/i.test(query)));
});
