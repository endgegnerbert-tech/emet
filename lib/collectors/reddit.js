import { SocialCollector, fetchWithTimeout } from "./collector.js";

export class RedditCollector extends SocialCollector {
  get platform() { return "reddit"; }
  get label() { return "Reddit (public JSON)"; }

  async search(query, { limit = 20 } = {}) {
    const start = Date.now();
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 25)}&sort=relevance&t=year`;
    const res = await fetchWithTimeout(url, {
      timeout: 8_000,
      headers: { "user-agent": "emet/2.0 (+https://github.com/endgegnerbert-tech/emet)" },
    });
    const data = await res.json();
    const children = data?.data?.children || [];
    return {
      platform: this.platform,
      resultCount: children.length,
      results: children.map((child) => {
        const post = child.data || {};
        return SocialCollector.normalizeResult({
          title: post.title || "",
          url: post.permalink ? `https://www.reddit.com${post.permalink}` : (post.url || ""),
          author: post.author || "",
          score: post.score || 0,
          signals: {
            comments: post.num_comments || 0,
            createdAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
            subreddit: post.subreddit || "",
          },
        });
      }),
      meta: { elapsedMs: Date.now() - start, apiCalls: 1, cacheHits: 0 },
    };
  }
}
