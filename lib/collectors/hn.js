import { SocialCollector, fetchWithTimeout } from "./collector.js";

export class HNCollector extends SocialCollector {
  get platform() { return "hn"; }
  get label() { return "Hacker News (Algolia)"; }

  async search(query, { limit = 20 } = {}) {
    const start = Date.now();
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${Math.min(limit, 100)}`;
    const res = await fetchWithTimeout(url, { timeout: 8_000 });
    const data = await res.json();
    return {
      platform: this.platform,
      resultCount: data.hits?.length ?? 0,
      results: (data.hits || []).map((h) => SocialCollector.normalizeResult({
        title: h.title || "",
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        author: h.author,
        score: h.points,
        signals: { comments: h.num_comments, createdAt: h.created_at, objectID: h.objectID },
      })),
      meta: { elapsedMs: Date.now() - start, apiCalls: 1, cacheHits: 0 },
    };
  }
}
