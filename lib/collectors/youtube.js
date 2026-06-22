import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { SocialCollector } from "./collector.js";

const execFileAsync = promisify(execFile);

// ponytail: yt-dlp based, NO YouTube Data API key needed; degrades gracefully when missing
export class YouTubeCollector extends SocialCollector {
  get platform() { return "youtube"; }
  get label() { return "YouTube (via yt-dlp)"; }

  checkAvailability() {
    try {
      execFileSync("which", ["yt-dlp"], { stdio: "ignore" });
      return { available: true };
    } catch {
      return {
        available: false,
        reason: "yt-dlp not found",
        installHint: "Install yt-dlp: brew install yt-dlp or pip install yt-dlp",
      };
    }
  }

  async search(videoUrl, { limit = 1 } = {}) {
    // ponytail: basic guard against shell injection via execFile (array args)
    const url = String(videoUrl || "").trim();
    if (!url) return SocialCollector.emptyResult(this.platform);
    const { stdout } = await execFileAsync("yt-dlp", [
      "--dump-json",
      "--no-playlist",
      "--flat-playlist",
      url,
    ], { timeout: 15_000 });
    const meta = JSON.parse(stdout);
    return {
      platform: this.platform,
      resultCount: 1,
      results: [SocialCollector.normalizeResult({
        title: meta.title,
        url: meta.webpage_url || videoUrl,
        author: meta.uploader,
        score: meta.view_count ?? 0,
        signals: {
          duration: meta.duration,
          uploadDate: meta.upload_date,
          description: meta.description?.slice(0, 200),
        },
      })],
      meta: { elapsedMs: 0, apiCalls: 0, cacheHits: 0 },
    };
  }
}
