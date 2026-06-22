// Base contract every collector must implement
export class SocialCollector {
  get platform() { throw new Error("subclass must implement platform getter"); }
  get label() { throw new Error("subclass must implement label getter"); }
  checkAvailability() { return { available: true }; }
  async search(query, options = {}) { throw new Error("subclass must implement search()"); }

  static emptyResult(platform) {
    return { platform, resultCount: 0, results: [], meta: { elapsedMs: 0, apiCalls: 0, cacheHits: 0 } };
  }

  static normalizeResult(item) {
    return {
      title: item.title || "",
      url: item.url || "",
      author: item.author || "",
      score: typeof item.score === "number" ? item.score : 0,
      signals: item.signals || {},
      tier: item.tier || null,
    };
  }
}

// ponytail: single fetch primitive, no retry — collectors are internal, retry is caller's job
export async function fetchWithTimeout(url, options = {}) {
  const { timeout = 10_000, headers = {}, signal } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const linked = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const response = await fetch(url, { headers, signal: linked });
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      err.statusCode = response.status;
      throw err;
    }
    return response;
  } catch (error) {
    if (error.name === "AbortError" && !signal?.aborted) {
      const err = new Error(`Request timeout after ${timeout}ms`);
      err.code = "TIMEOUT";
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(id);
  }
}
