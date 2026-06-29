import test from "node:test";
import assert from "node:assert/strict";

import { classifySourceType, isAuthoritativeUrl } from "../lib/research.js";
import { getResearchConfig } from "../lib/research/config.js";
import { inferOfficialTargets } from "../lib/research/official-targets.js";
import { searchDuckDuckGo } from "../lib/research/search.js";

test("inferOfficialTargets detects OpenAI Codex MCP docs", () => {
  const target = inferOfficialTargets("official OpenAI Codex MCP documentation server instructions");

  assert.ok(target.ids.includes("openai-codex"));
  assert.ok(target.expectedHosts.includes("developers.openai.com"));
  assert.ok(target.directResults.some((result) => result.url === "https://developers.openai.com/codex/mcp"));
  assert.equal(target.failClosed, true);
});

test("inferOfficialTargets detects official MCP specification pages", () => {
  const target = inferOfficialTargets("Model Context Protocol latest specification tools list call inputSchema outputSchema official");

  assert.ok(target.ids.includes("mcp-spec"));
  assert.deepEqual(target.expectedHosts, ["modelcontextprotocol.io"]);
  assert.ok(target.directResults.some((result) => result.url.includes("/server/tools")));
  assert.equal(target.failClosed, true);
});

test("inferOfficialTargets detects npm package registry pages", () => {
  const target = inferOfficialTargets("latest @modelcontextprotocol/sdk npm version official package docs");

  assert.ok(target.ids.includes("npm-package"));
  assert.ok(target.expectedHosts.includes("npmjs.com"));
  assert.ok(target.expectedHosts.includes("registry.npmjs.org"));
  assert.ok(target.directResults.some((result) => result.url === "https://www.npmjs.com/package/@modelcontextprotocol/sdk"));
  assert.ok(target.directResults.some((result) => result.url === "https://registry.npmjs.org/%40modelcontextprotocol%2Fsdk"));
});

test("inferOfficialTargets detects zero-setup package registry APIs", () => {
  const pypi = inferOfficialTargets("requests pypi latest version official");
  assert.ok(pypi.ids.includes("pypi-package"));
  assert.ok(pypi.expectedHosts.includes("pypi.org"));
  assert.ok(pypi.directResults.some((result) => result.url === "https://pypi.org/pypi/requests/json"));

  const crate = inferOfficialTargets("serde crate latest version official");
  assert.ok(crate.ids.includes("crates-package"));
  assert.ok(crate.expectedHosts.includes("crates.io"));
  assert.ok(crate.expectedHosts.includes("docs.rs"));
  assert.ok(crate.directResults.some((result) => result.url === "https://crates.io/api/v1/crates/serde"));

  const maven = inferOfficialTargets("maven org.slf4j:slf4j-api latest version official");
  assert.ok(maven.ids.includes("maven-package"));
  assert.ok(maven.expectedHosts.includes("search.maven.org"));
  assert.ok(maven.directResults.some((result) => result.url.includes("search.maven.org/solrsearch/select")));
});

test("inferOfficialTargets detects official GitHub release APIs", () => {
  const target = inferOfficialTargets("github releases modelcontextprotocol/typescript-sdk latest");

  assert.ok(target.ids.includes("github-release"));
  assert.ok(target.expectedHosts.includes("api.github.com"));
  assert.ok(target.directResults.some((result) => result.url === "https://api.github.com/repos/modelcontextprotocol/typescript-sdk/releases/latest"));
});

test("inferOfficialTargets keeps docs official without guessing concrete pages", () => {
  const react = inferOfficialTargets("React useActionState official docs");
  assert.ok(react.ids.includes("react-docs"));
  assert.deepEqual(react.directResults, []);
  assert.ok(react.expectedHosts.includes("react.dev"));
  assert.equal(react.failClosed, true);

  const python = inferOfficialTargets("Python 3.14 release notes official docs");
  assert.ok(python.ids.includes("python-docs"));
  assert.ok(python.expectedHosts.includes("docs.python.org"));
  assert.ok(python.expectedHosts.includes("peps.python.org"));
});

test("searchDuckDuckGo falls back to direct official targets when web search is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network unavailable");
  };

  try {
    const results = await searchDuckDuckGo("official OpenAI Codex MCP documentation", undefined, {
      isolate: true,
      resultsPerQuery: 5,
      pageTimeoutMs: 10,
      requireAuthoritative: true,
    });

    assert.equal(results[0].url, "https://developers.openai.com/codex/mcp");
    assert.equal(results.some((result) => result.url.includes("huggingface.co")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MCP specification pages are authoritative official docs", () => {
  const url = "https://modelcontextprotocol.io/specification/2025-11-25/server/tools";

  assert.equal(classifySourceType(url, "Tools - Model Context Protocol"), "official_doc");
  assert.equal(isAuthoritativeUrl(url), true);
});

test("npm package pages are authoritative official docs", () => {
  const url = "https://www.npmjs.com/package/@modelcontextprotocol/sdk";
  const registryUrl = "https://registry.npmjs.org/%40modelcontextprotocol%2Fsdk";
  const pypiUrl = "https://pypi.org/pypi/requests/json";
  const cratesUrl = "https://crates.io/api/v1/crates/serde";
  const mavenUrl = "https://search.maven.org/solrsearch/select?q=g:%22org.slf4j%22+AND+a:%22slf4j-api%22&rows=5&wt=json";

  assert.equal(classifySourceType(url, "@modelcontextprotocol/sdk - npm"), "official_doc");
  assert.equal(isAuthoritativeUrl(url), true);
  assert.equal(classifySourceType(registryUrl, "@modelcontextprotocol/sdk metadata - npm registry"), "official_doc");
  assert.equal(isAuthoritativeUrl(registryUrl), true);
  assert.equal(classifySourceType(pypiUrl, "requests metadata - PyPI JSON"), "official_doc");
  assert.equal(isAuthoritativeUrl(pypiUrl), true);
  assert.equal(classifySourceType(cratesUrl, "serde metadata - crates.io API"), "official_doc");
  assert.equal(isAuthoritativeUrl(cratesUrl), true);
  assert.equal(classifySourceType(mavenUrl, "slf4j-api Maven Central"), "official_doc");
  assert.equal(isAuthoritativeUrl(mavenUrl), true);
});

test("specs domain allows the official MCP specification host", () => {
  const config = getResearchConfig({
    mode: "code",
    query: "Model Context Protocol latest specification tools list call inputSchema outputSchema official",
    domain: "specs",
  });

  assert.ok(config.allowedSources.includes("modelcontextprotocol.io"));
  assert.ok(config.queryHints.includes("site:modelcontextprotocol.io/specification"));
});
