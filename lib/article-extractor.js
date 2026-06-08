import { extractFromHtml } from "@extractus/article-extractor";

/**
 * Extract structured article content from raw HTML.
 * Falls back to title regex + stripped body if extraction fails.
 */
export async function extractArticle(html, url) {
  try {
    const article = await extractFromHtml(html, url || "");
    if (article && article.content) {
      return {
        title: article.title || null,
        description: article.description || null,
        content: article.content, // HTML
        author: article.author || null,
        published: article.published || null,
        url: article.url || url || null,
        source: "article-extractor",
      };
    }
  } catch {
    // fall through to basic extraction
  }
  return null;
}

/**
 * Basic regex-based extraction as fallback.
 */
export function extractBasicArticle(html, url) {
  const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : (url || "");
  const body = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    description: null,
    content: body,
    author: null,
    published: null,
    url: url || null,
    source: "basic",
  };
}

export function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
