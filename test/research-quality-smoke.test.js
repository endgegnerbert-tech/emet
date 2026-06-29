import test from "node:test";
import assert from "node:assert/strict";

import { runWebResearch, clearResearchMemory } from "../lib/web-research.js";

function html(title, body) {
  return `<html><title>${title}</title><body>${body}</body></html>`;
}

function response(url, body, contentType = "text/html") {
  return {
    ok: true,
    status: 200,
    url,
    headers: { get: () => contentType },
    async text() { return body; },
  };
}

test("quality smoke: OpenAI Codex MCP discovery stays on official OpenAI docs", async () => {
  clearResearchMemory();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("developers.openai.com/codex/mcp")) {
      return response(text, html(
        "Model Context Protocol - Codex | OpenAI Developers",
        `${"OpenAI Codex MCP official documentation server instructions CLI IDE extension ".repeat(80)}`,
      ));
    }
    if (text.includes("duckduckgo.com")) throw new Error("generic search unavailable");
    throw new Error(`unexpected fetch: ${text}`);
  };

  try {
    const result = await runWebResearch(
      "official OpenAI Codex MCP documentation server instructions CLI IDE extension",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { mode: "code", isolate: true, maxSites: 2, requireAuthoritative: true },
    );

    assert.equal(result.ok, true);
    assert.ok(result.sources.some((source) => source.url === "https://developers.openai.com/codex/mcp"));
    assert.equal(result.sources.some((source) => /huggingface\.co/.test(source.url)), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("quality smoke: MCP tools specification discovery stays on official spec host", async () => {
  clearResearchMemory();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("modelcontextprotocol.io/specification/2025-11-25/server/tools")) {
      return response(text, html(
        "Tools - Model Context Protocol",
        `${"Model Context Protocol official specification tools list tools call inputSchema outputSchema annotations ".repeat(80)}`,
      ));
    }
    if (text.includes("duckduckgo.com")) throw new Error("generic search unavailable");
    throw new Error(`unexpected fetch: ${text}`);
  };

  try {
    const result = await runWebResearch(
      "Model Context Protocol latest specification tools list call inputSchema outputSchema official",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { mode: "code", isolate: true, maxSites: 2, requireAuthoritative: true },
    );

    assert.equal(result.ok, true);
    assert.ok(result.sources.some((source) => source.url.includes("modelcontextprotocol.io/specification/2025-11-25/server/tools")));
    assert.equal(result.sources.some((source) => /datatracker\.ietf\.org/.test(source.url)), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("quality smoke: npm package discovery accepts short official registry pages", async () => {
  clearResearchMemory();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("npmjs.com/package/@modelcontextprotocol/sdk")) {
      return {
        ok: false,
        status: 403,
        url: text,
        headers: { get: () => "text/html" },
        async text() { return "<html><title>Just a moment...</title></html>"; },
      };
    }
    if (text.includes("registry.npmjs.org/%40modelcontextprotocol%2Fsdk")) {
      return response(text, JSON.stringify({
        name: "@modelcontextprotocol/sdk",
        "dist-tags": { latest: "1.0.0" },
        description: "MCP TypeScript SDK official npm registry metadata package docs",
      }), "application/json");
    }
    if (text.includes("duckduckgo.com")) throw new Error("generic search unavailable");
    throw new Error(`unexpected fetch: ${text}`);
  };

  try {
    const result = await runWebResearch(
      "latest @modelcontextprotocol/sdk npm version official package docs",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { mode: "code", isolate: true, maxSites: 2, requireAuthoritative: true },
    );

    assert.equal(result.ok, true);
    assert.ok(result.sources.some((source) => source.url === "https://registry.npmjs.org/%40modelcontextprotocol%2Fsdk"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
