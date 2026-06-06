import test from "node:test";
import assert from "node:assert/strict";

import {
  assessPageAttempt,
  chooseScraplingMode,
} from "../lib/page-fetch-adapter.js";

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
