import { SocialCollector, fetchWithTimeout } from "./collector.js";

// ponytail: regex extraction on RSS 2.0 <item> and Atom <entry> elements.
// No namespace handling — drops items where fields are namespaced.
// Add feedparser after the first real-world feed that breaks.
function parseRSSItems(xml) {
  if (!xml || typeof xml !== "string") return [];
  const items = [];
  // Match <item>...</item> or <entry>...</entry>
  const entryRe = /<(item|entry)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const body = m[2];
    const title = extractTag(body, "title");
    const link = extractLink(body);
    // ponytail: Atom nests <author><name>, RSS has <author> directly — try nested first
    const author = extractNestedAuthor(body) || extractTag(body, "author");
    const pubDate = extractTag(body, "pubDate") || extractTag(body, "published");
    items.push({
      title: decodeEntities(title),
      url: decodeEntities(link),
      author: decodeEntities(author),
      score: 0,
      signals: { pubDate: decodeEntities(pubDate) },
    });
  }
  return items;
}

function extractTag(body, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(body);
  return m ? m[1].trim() : "";
}

function extractLink(body) {
  // RSS: <link>https://...</link>
  const linkRe = /<link>(.*?)<\/link>/i;
  let m = linkRe.exec(body);
  if (m) return m[1].trim();
  // Atom: <link href="https://..."/>
  const hrefRe = /<link[^>]*href\s*=\s*"([^"]*)"/i;
  m = hrefRe.exec(body);
  return m ? m[1].trim() : "";
}

function extractNestedAuthor(body) {
  // Atom: <author><name>...</name></author>
  const m = /<author[^>]*>[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i.exec(body);
  return m ? m[1].trim() : "";
}

const ENTITY_MAP = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
};

function decodeEntities(text) {
  if (!text) return text;
  return String(text).replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITY_MAP[`&${e};`] || "");
}

export class RSSCollector extends SocialCollector {
  get platform() { return "rss"; }
  get label() { return "RSS/Atom feeds"; }

  async search(feedUrl, { limit = 20 } = {}) {
    const start = Date.now();
    const res = await fetchWithTimeout(feedUrl, { timeout: 12_000 });
    const xml = await res.text();
    const items = parseRSSItems(xml).slice(0, limit);
    return {
      platform: this.platform,
      resultCount: items.length,
      results: items.map((item) => SocialCollector.normalizeResult(item)),
      meta: { elapsedMs: Date.now() - start, apiCalls: 1, cacheHits: 0 },
    };
  }
}
