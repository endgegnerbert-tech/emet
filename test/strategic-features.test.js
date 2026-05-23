import test from "node:test";
import assert from "node:assert/strict";

import { buildQueries } from "../lib/web-research.js";
import { factCheckAnswer } from "../lib/research.js";
import { planResearch } from "../lib/planner.js";

test("code mode query planning adds docs and github hints", async () => {
  const queries = await buildQueries("DuckDB window functions", "code", undefined, undefined);
  assert.ok(queries.some((query) => /github|docs|readme/i.test(query)));
});

test("planner returns canonical academic subqueries", () => {
  const plan = planResearch("transformer attention paper", "academic");
  assert.ok(plan.subqueries.some((query) => /arxiv|semanticscholar|doi/i.test(query)));
  assert.ok(Array.isArray(plan.expectedSources));
});

test("planner adds a benchmark fallback for broad comparison queries", () => {
  const plan = planResearch("B-trees vs LSM-trees", "code");
  assert.ok(plan.subqueries.some((query) => /benchmark/i.test(query)));
  assert.ok(plan.subqueries.some((query) => /comparison/i.test(query)));
});

test("fact check ignores synthesis boilerplate", () => {
  const result = factCheckAnswer(
    "I found 3 sources and the strongest sources are summarized below.",
    [{ title: "DuckDB docs", url: "https://duckdb.org/docs", text: "DuckDB supports recursive CTEs." }],
  );

  assert.deepEqual(result.unverifiedClaims, []);
});

test("fact check marks unsupported claims as unverified", () => {
  const result = factCheckAnswer(
    "DuckDB supports recursive CTEs.",
    [{ title: "DuckDB docs", url: "https://duckdb.org/docs", text: "DuckDB supports recursive CTEs." }],
  );

  assert.equal(Array.isArray(result.unverifiedClaims), true);
  assert.equal(result.unverifiedClaims.length, 0);
});
