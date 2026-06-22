import { SocialCollector, fetchWithTimeout } from "./collector.js";

// ponytail: 60 req/h unauthenticated, add GITHUB_TOKEN env var if rate limit is hit
export class GitHubCollector extends SocialCollector {
  get platform() { return "github"; }
  get label() { return "GitHub (public REST)"; }

  async search(query, { limit = 10, type = "repositories" } = {}) {
    const start = Date.now();
    const kind = ({ repositories: "repositories", code: "code", issues: "issues" })[type] || "repositories";
    const url = `https://api.github.com/search/${kind}?q=${encodeURIComponent(query)}&sort=stars&per_page=${Math.min(limit, 100)}`;
    const res = await fetchWithTimeout(url, {
      timeout: 10_000,
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "emet-collector/1.0",
      },
    });
    const data = await res.json();
    return {
      platform: this.platform,
      resultCount: data.items?.length ?? 0,
      results: (data.items || []).map((item) => SocialCollector.normalizeResult({
        title: item.full_name || item.name || item.title || "",
        url: item.html_url || "",
        author: item.owner?.login || item.user?.login || "",
        score: item.stargazers_count ?? item.score ?? 0,
        signals: {
          forks: item.forks_count,
          language: item.language,
          description: item.description,
          updatedAt: item.updated_at,
        },
      })),
      meta: { elapsedMs: Date.now() - start, apiCalls: 1, cacheHits: 0 },
    };
  }
}
