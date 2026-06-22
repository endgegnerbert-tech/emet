// Shared I/O helpers. Layer: base — stdlib only.

export const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
];

export function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export const DOMAIN_TIMEOUTS = new Map([
  ["arxiv.org", 15_000],
  ["github.com", 5_000],
]);

export function resolvePageTimeout(url, configTimeout) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [domain, ms] of DOMAIN_TIMEOUTS) {
      if (host === domain || host.endsWith("." + domain)) return ms;
    }
  } catch {
    // invalid URL
  }
  return configTimeout;
}

export function withTimeoutSignal(signal, timeoutMs) {
  if (!timeoutMs) return signal;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

export function isTransientStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export function isRetryableFetchError(error) {
  if (!error) return false;
  if (error.name === "TimeoutError") return true;
  if (error.name === "HttpFetchError") return Boolean(error.transient);
  return error.name === "TypeError" || /fetch failed|network/i.test(String(error.message || ""));
}

export function fetchFailureReason(errorOrStatus, contentType = "") {
  const status = typeof errorOrStatus === "number" ? errorOrStatus : Number(errorOrStatus?.statusCode || errorOrStatus?.status || 0);
  if (status === 403) return "http_403";
  if (status === 404) return "http_404";
  if (status === 429) return "http_429";
  if (status >= 500) return "http_5xx";
  if (status >= 400) return `http_${status}`;
  if (String(contentType || "").includes("pdf")) return "pdf_extract_failed";
  const name = typeof errorOrStatus === "object" ? errorOrStatus?.name : "";
  const message = typeof errorOrStatus === "object" ? String(errorOrStatus?.message || "") : "";
  if (name === "TimeoutError" || /timeout/i.test(message)) return "timeout";
  if (name === "AbortError") return "aborted";
  if (name === "TypeError" || /fetch failed|network/i.test(message)) return "network_error";
  return "unknown";
}

export function contentFailureReason(page, config = {}) {
  if (!page) return "content_too_thin";
  if (page.quality?.blocked) return "blocked_page";
  if (page.quality?.weak || (page.text?.length || 0) < (config.minPageText || MIN_PAGE_TEXT)) return "content_too_thin";
  return "success";
}

export function summarizeFetchedPage(page) {
  return page ? { title: page.title, sourceType: page.sourceType, publishDate: page.publishDate, textLength: page.text?.length || 0 } : null;
}

export function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
      fn(value);
    };
    const abort = () => finish(reject, Object.assign(new Error("aborted"), { name: "AbortError" }));
    const timer = setTimeout(() => finish(resolve), ms);
    timer.unref?.();
    if (signal?.aborted) abort();
    else signal?.addEventListener?.("abort", abort, { once: true });
  });
}

export async function fetchTextWithRetry(url, signal, attempts = 2, headers = {
  "user-agent": randomUserAgent(),
  "accept-language": "en-US,en;q=0.9",
}, timeoutMs) {
  let lastError;
  const startedAt = Date.now();
  const deadline = timeoutMs ? startedAt + timeoutMs : null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const attemptStartedAt = Date.now();
    const remainingMs = deadline ? Math.max(1, deadline - Date.now()) : timeoutMs;
    try {
      const response = await fetch(url, { headers, redirect: "follow", signal: withTimeoutSignal(signal, remainingMs) });
      const status = Number(response?.status || 200);
      const ok = response?.ok !== false && status < 400;
      if (!ok) {
        const error = new Error(`HTTP ${status}`);
        error.name = "HttpFetchError";
        error.statusCode = status;
        error.transient = isTransientStatus(status);
        error.retryCount = attempt;
        throw error;
      }
      response.__emetFetchMeta = { attempt: attempt + 1, retryCount: attempt, latencyMs: Date.now() - startedAt, statusCode: status };
      return response;
    } catch (error) {
      lastError = error;
      error.attempt = attempt + 1;
      error.retryCount = attempt;
      error.latencyMs = Date.now() - startedAt;
      if (signal?.aborted || error?.name === "AbortError") throw error;
      const retryable = isRetryableFetchError(error);
      const hasAttemptLeft = attempt + 1 < attempts;
      const hasBudget = !deadline || Date.now() < deadline;
      if (!retryable || !hasAttemptLeft || !hasBudget) throw error;
      const base = 100 * (2 ** attempt);
      const jitter = Math.floor(Math.random() * 75);
      const delay = deadline ? Math.min(base + jitter, Math.max(0, deadline - Date.now())) : base + jitter;
      await sleep(delay, signal);
    } finally {
      void attemptStartedAt;
    }
  }
  throw lastError;
}

