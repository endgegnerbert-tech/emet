import test from "node:test";
import assert from "node:assert/strict";
import { loadEvalCases } from "../lib/eval/case-loader.js";
import { runEvalSuite } from "../lib/eval/runner.js";

test("loadEvalCases loads json files from eval/cases/web", () => {
  const cases = loadEvalCases("web");
  assert.ok(Array.isArray(cases));
});

test("runEvalSuite reports pass rates and detailed checks", async () => {
  const result = await runEvalSuite({ domain: "web" });
  assert.equal(typeof result.passRate, "number");
  assert.equal(typeof result.checkPassRate, "number");
  assert.ok(Array.isArray(result.details));
  assert.ok(result.totalChecks >= result.total);
});

test("github eval cases include an expected domain", () => {
  const cases = loadEvalCases("github");
  assert.equal(cases[0].expectedDomain, "github");
});

test("eval suite validates deterministic authority behavior", async () => {
  const security = await runEvalSuite({ domain: "security" });
  const github = await runEvalSuite({ domain: "github" });
  const papers = await runEvalSuite({ domain: "papers" });

  assert.equal(security.passRate, 1);
  assert.equal(github.passRate, 1);
  assert.equal(papers.passRate, 1);
});
