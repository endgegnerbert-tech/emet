import test from "node:test";
import assert from "node:assert/strict";

import {
  assessPageAttempt,
  chooseScraplingMode,
} from "../lib/page-fetch-adapter.js";
import { fetchPageSource } from "../lib/research/fetch.js";
import { webFetch } from "../lib/research/synthesis.js";

test("chooseScraplingMode prefers stealthy for blocked pages", () => {
  const mode = chooseScraplingMode({ status: 429, body: "<html><body>Too Many Requests</body></html>", url: "https://example.com" });
  assert.equal(mode, "stealthy");
});

test("chooseScraplingMode prefers dynamic for app shells", () => {
  const mode = chooseScraplingMode({
    status: 200,
    body: "<html><body><div id=\"app\"></div><script src=\"/app.js\"></script></body></html>",
    url: "https://example.com",
  });
  assert.equal(mode, "dynamic");
});

test("assessPageAttempt marks short content as weak", () => {
  const result = assessPageAttempt({ status: 200, body: "short", contentType: "text/html" });
  assert.equal(result.weak, true);
  assert.equal(result.plainLength, 5);
});

test("assessPageAttempt keeps readable html on async mode", () => {
  const result = assessPageAttempt({
    status: 200,
    body: "<html><body>" + "Readable content ".repeat(40) + "</body></html>",
    contentType: "text/html",
  });

  assert.equal(result.weak, false);
  assert.equal(result.mode, "async");
});

test("assessPageAttempt does not mark normal github pages blocked", () => {
  const result = assessPageAttempt({
    status: 200,
    body: "<html><body><main>" + "Project README content ".repeat(60) + "</main></body></html>",
    contentType: "text/html",
    url: "https://github.com/microsoft/TypeScript/blob/main/README.md",
  });

  assert.equal(result.blocked, false);
  assert.equal(result.mode, "async");
});

test("fetchPageSource refuses disallowed hosts before network", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("should not fetch");
  };
  try {
    const page = await fetchPageSource("https://blocked.example/docs", undefined, {
      isolate: true,
      hostAllowlist: ["allowed.example"],
      pageTextLimit: 1000,
      minPageText: 1,
      useJinaFallback: false,
    });
    assert.equal(page, null);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("webFetch refuses disallowed hosts before network", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("should not fetch");
  };
  try {
    const result = await webFetch("https://blocked.example/docs", undefined, {
      hostAllowlist: ["allowed.example"],
      useJinaFallback: false,
    });
    assert.equal(result.ok, false);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("webFetch caps payload text and reports truncation metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    url: String(url),
    headers: { get: () => "text/html" },
    async text() {
      return `<html><title>Long</title><body>${"long content ".repeat(80)}</body></html>`;
    },
  });
  try {
    const result = await webFetch("https://allowed.example/long", undefined, {
      isolate: true,
      hostAllowlist: ["allowed.example"],
      useJinaFallback: false,
      pageTextLimit: 64,
    });
    assert.equal(result.ok, true);
    assert.equal(result.text.length, 64);
    assert.equal(result.truncated, true);
    assert.ok(result.originalLength > result.text.length);
    assert.equal(result.textLimit, 64);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchPageSource refuses private network URLs before network by default", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("should not fetch");
  };
  try {
    const page = await fetchPageSource("http://127.0.0.1:1234/private", undefined, {
      isolate: true,
      pageTextLimit: 1000,
      minPageText: 1,
      useJinaFallback: false,
    });
    assert.equal(page, null);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("webFetch returns capped text with truncation metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    url: String(url),
    headers: { get: () => "text/plain" },
    async text() {
      return "x".repeat(120);
    },
  });
  try {
    const result = await webFetch("https://allowed.example/large", undefined, {
      isolate: true,
      useJinaFallback: false,
      maxBytes: 50,
    });
    assert.equal(result.ok, true);
    assert.equal(result.text.length, 50);
    assert.equal(result.truncated, true);
    assert.equal(result.originalLength, 120);
    assert.equal(result.textLength, 50);
    assert.equal(result.nextOffset, 50);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("webFetch rejects short reader error placeholders", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes("r.jina.ai")) {
      return {
        ok: true,
        status: 200,
        url: target,
        headers: { get: () => "text/plain" },
        async text() {
          return [
            "Title: Just a moment...",
            "URL Source: https://blocked.example/package",
            "Warning: Target URL returned error 403: Forbidden",
          ].join("\n");
        },
      };
    }
    return {
      ok: false,
      status: 403,
      url: target,
      headers: { get: () => "text/html" },
      async text() {
        return "<html><title>Just a moment...</title></html>";
      },
    };
  };
  try {
    const result = await webFetch("https://blocked.example/package", undefined, {
      isolate: true,
      useJinaFallback: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].reason, "http_403");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchPageSource refuses Jina reader transport outside strict host policy", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      url: String(url),
      headers: { get: () => "text/html" },
      async text() {
        return `<html><title>Allowed</title><body>${("direct content ").repeat(120)}</body></html>`;
      },
    };
  };
  try {
    const page = await fetchPageSource("https://medium.com/example/post", undefined, {
      isolate: true,
      hostAllowlist: ["medium.com"],
      pageTextLimit: 1000,
      minPageText: 1,
      useJinaFallback: true,
    });
    assert.ok(page);
    assert.equal(calls.some((url) => url.includes("r.jina.ai")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchPageSource refuses redirect targets outside strict host policy", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return {
      ok: true,
      status: 200,
      url: "https://blocked.example/final",
      headers: { get: () => "text/html" },
      async text() {
        return "<html><body>should not be read</body></html>";
      },
    };
  };
  try {
    const page = await fetchPageSource("https://allowed.example/start", undefined, {
      isolate: true,
      hostAllowlist: ["allowed.example"],
      pageTextLimit: 1000,
      minPageText: 1,
      useJinaFallback: false,
    });
    assert.equal(page, null);
    assert.equal(called, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
