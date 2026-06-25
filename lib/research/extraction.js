// Page snapshot extraction — wraps article-extractor for HTML→semantic text.
// Layer: adapter — imports article-extractor (external dep).

import { extractArticle, extractBasicArticle, stripTags } from "../article-extractor.js";
import { extractCodeBlocks } from "./heuristics.js";

export async function extractPageSnapshot(html, url) {
  // Try semantic article extraction first
  const article = await extractArticle(html, url);
  if (article) {
    const clean = extractBasicArticle(article.content, url);
    const text = clean.content || article.description || "";
    return {
      title: article.title || url,
      url: article.url || url,
      text,
      codeBlocks: extractCodeBlocks(html),
      source: "article-extractor",
    };
  }

  // Fallback: regex-based extraction
  const basic = extractBasicArticle(html, url);
  return {
    title: basic.title,
    url: basic.url,
    text: basic.content || "",
    codeBlocks: extractCodeBlocks(html),
    source: "basic",
  };
}
