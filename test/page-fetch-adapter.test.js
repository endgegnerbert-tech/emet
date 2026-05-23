import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
  assessPageAttempt,
  chooseScraplingMode,
  fetchWithScrapling,
  getScraplingRuntimeStatus,
  setScraplingRuntimeStatusForTests,
  setScraplingSpawnForTests,
  stopScraplingDaemon,
} from "../lib/page-fetch-adapter.js";

function createMockDaemon(onJob = () => ({})) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write(line) {
      const payload = JSON.parse(String(line).trim());
      const response = onJob(payload);
      queueMicrotask(() => {
        child.stdout.emit("data", `${JSON.stringify({ id: payload.id, ok: true, url: payload.url, status: 200, contentType: "text/html", body: "ok", headers: {}, ...response })}\n`);
      });
      return true;
    },
  };
  child.kill = () => {
    queueMicrotask(() => child.emit("close", 0));
    return true;
  };
  queueMicrotask(() => {
    child.stdout.emit("data", `${JSON.stringify({ type: "ready" })}\n`);
  });
  return child;
}

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

test("getScraplingRuntimeStatus reports missing runtime clearly", () => {
  setScraplingRuntimeStatusForTests({ ok: false, python: "python3", error: "ModuleNotFoundError: No module named 'lxml'" });
  try {
    const status = getScraplingRuntimeStatus();
    assert.equal(status.ok, false);
    assert.match(status.error, /lxml/);
  } finally {
    setScraplingRuntimeStatusForTests(null);
  }
});

test("fetchWithScrapling reuses one daemon across calls", async () => {
  let spawns = 0;
  setScraplingRuntimeStatusForTests({ ok: true, python: "python3" });
  setScraplingSpawnForTests(() => {
    spawns += 1;
    return createMockDaemon();
  });

  try {
    const first = await fetchWithScrapling("https://example.com/a", "stealthy", undefined, {});
    const second = await fetchWithScrapling("https://example.com/b", "stealthy", undefined, {});

    assert.equal(first.url, "https://example.com/a");
    assert.equal(second.url, "https://example.com/b");
    assert.equal(spawns, 1);
  } finally {
    await stopScraplingDaemon();
    setScraplingSpawnForTests(null);
    setScraplingRuntimeStatusForTests(null);
  }
});

test("fetchWithScrapling uses stealth timeout and proxy rotation payload", async () => {
  const jobs = [];
  setScraplingRuntimeStatusForTests({ ok: true, python: "python3" });
  setScraplingSpawnForTests(() => createMockDaemon((payload) => {
    jobs.push(payload);
    return { body: "payload ok" };
  }));

  try {
    await fetchWithScrapling("https://example.com/a", "stealthy", undefined, {
      pageTimeoutMs: 5000,
      stealthTimeoutMs: 42000,
      proxyRotation: [{ server: "http://proxy.local:8080" }],
    });

    assert.equal(jobs[0].payload.timeout, 42000);
    assert.deepEqual(jobs[0].payload.proxyRotation, [{ server: "http://proxy.local:8080" }]);
  } finally {
    await stopScraplingDaemon();
    setScraplingSpawnForTests(null);
    setScraplingRuntimeStatusForTests(null);
  }
});

test("fetchWithScrapling returns null on abort without crashing the daemon", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write() {
      return true;
    },
  };
  child.kill = () => {
    queueMicrotask(() => child.emit("close", 0));
    return true;
  };

  setScraplingRuntimeStatusForTests({ ok: true, python: "python3" });
  setScraplingSpawnForTests(() => {
    queueMicrotask(() => child.stdout.emit("data", `${JSON.stringify({ type: "ready" })}\n`));
    return child;
  });

  try {
    const controller = new AbortController();
    const promise = fetchWithScrapling("https://example.com/a", "stealthy", controller.signal, {});
    controller.abort();
    assert.equal(await promise, null);
  } finally {
    await stopScraplingDaemon();
    setScraplingSpawnForTests(null);
    setScraplingRuntimeStatusForTests(null);
  }
});
