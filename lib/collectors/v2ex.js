import { SocialCollector, fetchWithTimeout } from "./collector.js";

// ponytail: v1 API, 120 req/h/IP, no auth; v2 beta requires token — skip until needed
export class V2exCollector extends SocialCollector {
  get platform() { return "v2ex"; }
  get label() { return "V2EX (public API)"; }

  async search(query, { limit = 20 } = {}) {
    const start = Date.now();
    const url = "https://www.v2ex.com/api/topics/hot.json";
    const res = await fetchWithTimeout(url, {
      timeout: 8_000,
      headers: { "User-Agent": "emet-collector/1.0" },
    });
    const data = await res.json();
    // ponytail: V2EX has no search endpoint — client-side filter on hot topics
    const filtered = data
      .filter((t) => !query || t.title?.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit);
    return {
      platform: this.platform,
      resultCount: filtered.length,
      results: filtered.map((t) => SocialCollector.normalizeResult({
        title: t.title,
        url: t.url,
        author: t.member?.username,
        score: t.replies ?? 0,
        signals: { node: t.node?.title, createdAt: t.created },
      })),
      meta: { elapsedMs: Date.now() - start, apiCalls: 1, cacheHits: 0 },
    };
  }
}
