import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { WEAK_PAGE_POLICY } from "./research-policy.js";

const SCRAPLING_ROOT = fileURLToPath(new URL("../Scrapling", import.meta.url));
const BLOCKED_PATTERNS = [
  /cloudflare/i,
  /turnstile/i,
  /captcha/i,
  /please enable cookies/i,
  /bot detection/i,
  /verify you are human/i,
  /security check/i,
  /access denied/i,
  /temporarily unavailable/i,
  /attention required/i,
  /challenge-platform/i,
];
const DYNAMIC_PATTERNS = [
  /__next_data__/i,
  /__nuxt__/i,
  /data-reactroot/i,
  /hydrat/i,
  /window\.__INITIAL_STATE__/i,
  /id=["']app["']/i,
  /id=["']root["']/i,
];

let spawnProcess = nodeSpawn;
let daemonState = null;
let daemonSequence = 0;
let exitHookInstalled = false;
let runtimeStatus = null;
const DAEMON_IDLE_TIMEOUT_MS = 3000;

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function assessPageAttempt({ status = 200, body = "", contentType = "", url = "" } = {}) {
  const text = String(body || "");
  const plain = stripHtml(text);
  const lower = `${text}\n${url}`.toLowerCase();
  const antiBotSignal = BLOCKED_PATTERNS.some((pattern) => pattern.test(lower));
  const negativeSignals = [];

  if (plain.length < WEAK_PAGE_POLICY.weakTextLimit) negativeSignals.push("weak_text");
  else if (plain.length < WEAK_PAGE_POLICY.thinTextLimit) negativeSignals.push("thin_text");
  if (antiBotSignal) negativeSignals.push("placeholder");
  if (!/text\/(html|plain)/i.test(contentType) && plain.length < 500) negativeSignals.push("unsupported_content_type");

  const blocked = status === 403
    || status === 429
    || (antiBotSignal && plain.length < WEAK_PAGE_POLICY.blockedTextLimit);
  const dynamic = !blocked && (DYNAMIC_PATTERNS.some((pattern) => pattern.test(lower)) || (text.includes("<script") && plain.length < WEAK_PAGE_POLICY.weakTextLimit));
  const weak = blocked || negativeSignals.includes("weak_text") || negativeSignals.length >= WEAK_PAGE_POLICY.minNegativeSignals;

  return {
    blocked,
    dynamic,
    weak,
    mode: blocked ? "stealthy" : dynamic ? "dynamic" : "async",
    plainLength: plain.length,
    negativeSignals,
  };
}

export function chooseScraplingMode(input) {
  return assessPageAttempt(input).mode;
}

function pythonDaemonScript() {
  return String.raw`
import asyncio
import atexit
import json
import os
import sys

root = sys.argv[1]
sys.path.insert(0, root)

from scrapling.fetchers import AsyncFetcher, AsyncDynamicSession, AsyncStealthySession, ProxyRotator

sessions = {}

def session_key(mode, proxy_rotation):
    if not proxy_rotation:
        return mode
    return f"{mode}:{json.dumps(proxy_rotation, sort_keys=True)}"

async def build_session(mode, payload):
    proxy_rotation = payload.get("proxyRotation") or []
    key = session_key(mode, proxy_rotation)
    session = sessions.get(key)
    if session is not None:
        return session

    kwargs = {
        "headless": True,
        "disable_resources": True,
        "network_idle": True,
        "timeout": payload.get("timeout") or 30000,
    }
    if proxy_rotation:
        kwargs["proxy_rotator"] = ProxyRotator(proxy_rotation)

    session = AsyncDynamicSession(**kwargs) if mode == "dynamic" else AsyncStealthySession(**kwargs)
    await session.start()
    sessions[key] = session
    return session

async def cleanup():
    for session in sessions.values():
        try:
            await session.close()
        except Exception:
            pass
    sessions.clear()

def cleanup_sync():
    asyncio.get_event_loop().run_until_complete(cleanup())

atexit.register(cleanup_sync)


def normalize_response(response, fallback_url):
    headers = {}
    raw_headers = getattr(response, "headers", None)
    if hasattr(raw_headers, "items"):
        headers = dict(raw_headers.items())
    else:
        try:
            headers = dict(raw_headers or {})
        except Exception:
            headers = {}

    body = getattr(response, "body", None)
    if body is None:
        candidate = getattr(response, "text", None)
        body = candidate() if callable(candidate) else candidate

    if isinstance(body, bytes):
        body = body.decode("utf-8", "replace")
    elif not isinstance(body, str):
        body = str(body or "")

    return {
        "ok": True,
        "url": getattr(response, "url", fallback_url),
        "status": getattr(response, "status", 200),
        "contentType": headers.get("content-type", ""),
        "body": body,
        "headers": headers,
    }


async def handle_job(job):
    mode = job.get("mode")
    url = job.get("url")
    payload = job.get("payload") or {}
    timeout = payload.get("timeout") or 30000
    proxy = payload.get("proxy")

    kwargs = {"timeout": timeout}
    if proxy:
        kwargs["proxy"] = proxy

    if mode == "async":
        response = await AsyncFetcher.get(url, **kwargs)
    else:
        session = await build_session(mode, payload)
        response = await session.fetch(url, **kwargs)

    out = normalize_response(response, url)
    out["id"] = job.get("id")
    return out


async def main():
    print(json.dumps({"type": "ready"}), flush=True)

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
        except Exception as exc:
            print(json.dumps({"type": "error", "ok": False, "error": str(exc)}), flush=True)
            continue

        if job.get("type") == "shutdown":
            break

        try:
            out = await handle_job(job)
        except Exception as exc:
            out = {"id": job.get("id"), "ok": False, "error": str(exc), "type": exc.__class__.__name__}
        print(json.dumps(out), flush=True)

    await cleanup()


asyncio.run(main())
`;
}

function handleDaemonStdout(state, chunk) {
  state.stdoutBuffer += String(chunk || "");
  while (state.stdoutBuffer.includes("\n")) {
    const newlineIndex = state.stdoutBuffer.indexOf("\n");
    const line = state.stdoutBuffer.slice(0, newlineIndex).trim();
    state.stdoutBuffer = state.stdoutBuffer.slice(newlineIndex + 1);
    if (!line) continue;

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed.type === "ready") {
      state.ready = true;
      state.resolveReady?.(state);
      continue;
    }

    const pending = state.pending.get(parsed.id);
    if (!pending) continue;
    state.pending.delete(parsed.id);
    pending.cleanup?.();
    pending.resolve(parsed.ok ? parsed : { error: parsed.error || "scrapling failed", _scraplingError: true });
    scheduleDaemonIdleStop(state);
  }
}

function failDaemonState(state) {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  for (const pending of state.pending.values()) {
    pending.cleanup?.();
    pending.resolve(null);
  }
  state.pending.clear();
}

function scheduleDaemonIdleStop(state) {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  if (state.pending.size > 0) return;
  state.idleTimer = setTimeout(() => {
    if (daemonState === state && state.pending.size === 0) void stopScraplingDaemon();
  }, DAEMON_IDLE_TIMEOUT_MS);
  state.idleTimer.unref?.();
}

function resolvePythonExecutable() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const venvPython = path.join(process.cwd(), ".venv-scrapling", "bin", "python");
  return existsSync(venvPython) ? venvPython : "python3";
}

function daemonEnv() {
  return {
    ...process.env,
    PYTHONPATH: [SCRAPLING_ROOT, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
  };
}

function validateScraplingRuntime() {
  if (runtimeStatus) return runtimeStatus;
  const python = resolvePythonExecutable();
  const probe = spawnSync(python, ["-c", "import sys; sys.path.insert(0, sys.argv[1]); import lxml, patchright, playwright, scrapling; print('OK')", SCRAPLING_ROOT], {
    env: daemonEnv(),
    encoding: "utf8",
    timeout: 15000,
  });

  runtimeStatus = probe.status === 0
    ? { ok: true, python }
    : {
      ok: false,
      python,
      error: (probe.stderr || probe.stdout || `scrapling runtime check failed with status ${probe.status ?? "unknown"}`).trim(),
    };
  return runtimeStatus;
}

export function getScraplingRuntimeStatus() {
  return validateScraplingRuntime();
}

function ensureExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once("exit", () => {
    daemonState?.child?.kill?.("SIGKILL");
  });
}

async function ensureScraplingDaemon() {
  if (daemonState?.ready) return daemonState;
  if (daemonState?.readyPromise) return daemonState.readyPromise;

  ensureExitHook();
  const runtime = validateScraplingRuntime();
  if (!runtime.ok) throw new Error(runtime.error || "scrapling runtime unavailable");
  const child = spawnProcess(runtime.python, ["-c", pythonDaemonScript(), SCRAPLING_ROOT], {
    env: daemonEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  const state = {
    child,
    pending: new Map(),
    stdoutBuffer: "",
    stderrBuffer: "",
    ready: false,
    readyPromise: null,
    resolveReady: null,
    rejectReady: null,
    idleTimer: null,
  };

  state.readyPromise = new Promise((resolve, reject) => {
    state.resolveReady = resolve;
    state.rejectReady = reject;
  });

  child.stdout.on("data", (chunk) => handleDaemonStdout(state, chunk));
  child.stderr.on("data", (chunk) => {
    state.stderrBuffer += String(chunk || "");
    if (state.stderrBuffer.length > 20_000) state.stderrBuffer = state.stderrBuffer.slice(-20_000);
  });
  child.on("error", (error) => {
    if (!state.ready) state.rejectReady?.(error);
    failDaemonState(state);
    if (daemonState === state) daemonState = null;
  });
  child.on("close", (code) => {
    if (!state.ready) state.rejectReady?.(new Error(`scrapling daemon exited before ready (${code ?? "unknown"})`));
    failDaemonState(state);
    if (daemonState === state) daemonState = null;
  });

  daemonState = state;
  return state.readyPromise;
}

function requestPayload(mode, config = {}) {
  return {
    timeout: mode === "stealthy"
      ? (config.stealthTimeoutMs || config.pageTimeoutMs || 30_000)
      : (config.pageTimeoutMs || 30_000),
    proxy: config.proxy || null,
    proxyRotation: Array.isArray(config.proxyRotation) && config.proxyRotation.length ? config.proxyRotation : null,
  };
}

export async function fetchWithScrapling(url, mode, signal, config = {}) {
  if (!mode) return null;
  let state;
  try {
    state = await ensureScraplingDaemon();
  } catch {
    return null;
  }
  const id = `job-${++daemonSequence}`;
  const payload = requestPayload(mode, config);

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(signal?.aborted ? null : value);
    };

    const cleanup = () => {
      if (signal && abort) signal.removeEventListener("abort", abort);
    };

    const abort = () => {
      state.pending.delete(id);
      cleanup();
      scheduleDaemonIdleStop(state);
      finish(null);
    };

    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.pending.set(id, { resolve: finish, cleanup });

    if (signal) {
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
    }

    try {
      state.child.stdin.write(`${JSON.stringify({ id, url, mode, payload })}\n`);
    } catch {
      state.pending.delete(id);
      cleanup();
      finish(null);
    }
  });
}

export async function stopScraplingDaemon() {
  if (!daemonState) return;
  const state = daemonState;
  daemonState = null;
  failDaemonState(state);
  try {
    state.child.kill("SIGKILL");
  } catch {
    // ignore
  }
}

export function setScraplingSpawnForTests(factory) {
  spawnProcess = factory || nodeSpawn;
}

export function setScraplingRuntimeStatusForTests(status) {
  runtimeStatus = status;
}

export const pageFetchAdapter = {
  assessPageAttempt,
  chooseScraplingMode,
  fetchWithScrapling,
  stopScraplingDaemon,
};
