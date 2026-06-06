# Why the Agent Still Uses curl/Browser Instead of emet

## The Core Gap

emet gives the agent **synthesized answers** (text summaries with citations). But the agent often needs **raw page content** — especially for papers, docs, and source code.

The request flow breaks down like this:

```
Agent needs info
  │
  ├─▶ calls emet("Attention Is All You Need paper")
  │     │
  │     ├─▶ emet picks "fast" mode (agent overrides)
  │     ├─▶ DuckDuckGo search → 3 Semantic Scholar results
  │     ├─▶ fetch 3 pages → extract text snippets
  │     ├─▶ synthesize → "I found 3 sources. The strongest..."
  │     └─▶ returns BOILERPLATE, not paper content
  │
  └─▶ agent gets useless boilerplate
        │
        ├─▶ curl https://arxiv.org/abs/1706.03762
        │     → gets HTML page
        │
        └─▶ OR browser_action to navigate to paper page
              → screenshots paper, extracts full text
```

**The agent doesn't want a summary of the paper. It wants the paper.**

## Why emet Can't Deliver Raw Content Today

### 1. Synthesis = summarization, not passthrough

`synthesizeResearch()` in `lib/web-research.js` is designed to produce a condensed answer. It deliberately **discards** raw page text after extracting chunks:

```js
const synthesis = await synthesizeResearch(query, mergedPages, ctx, signal);
// Returns { answer, bullets, sources, citations }
// Raw page text is in mergedPages but never surfaced to the agent
```

### 2. Page text is truncated

```js
const trimmed = String(text || "").slice(0, config.pageTextLimit).trim();
// pageTextLimit defaults to ~5000 chars
// A paper abstract alone is often 3000+
```

### 3. PDFs are not parsed

Papers are usually PDFs. emet's `fetchPageSource` checks `content-type`:

```js
if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
  // fallback: try Jina Reader
}
```

Jina can convert PDF → markdown, but:
- No section structure (Abstract, Methods, Results stay flat)
- No figure/table extraction
- No citation metadata
- No LaTeX math rendering

### 4. No "raw" output mode

emet has `format: "markdown" | "json" | "table" | "latex"` but no `format: "raw"` that returns the full page text with metadata.

## What the Agent Actually Needs

For a paper, the agent needs:

```
{
  "title": "Attention Is All You Need",
  "authors": ["Ashish Vaswani", "Noam Shazeer", ...],
  "published": "2017-06-12",
  "url": "https://arxiv.org/abs/1706.03762",
  "abstract": "The dominant sequence transduction models are based on...",
  "sections": {
    "abstract": "...",
    "introduction": "...",
    "method": "...",
    "results": "...",
    "conclusion": "..."
  },
  "citations": [...],
  "fullText": "..."
}
```

For a code docs page, the agent needs:

```
{
  "title": "React useState",
  "url": "https://react.dev/reference/react/useState",
  "fullText": "...",  // raw markdown of the full doc
  "codeExamples": ["const [state, setState] = useState(initialState);"]
}
```

## The Raw Content Solution

Add a new mode or option that makes emet return full page content instead of a synthesis:

### Option A: `mode: "fetch"`

New fetch mode that:
1. Finds the best matching URL (via DuckDuckGo + ranking)
2. Fetches the full page (with PDF support)
3. Returns the full extracted text as-is
4. No synthesis, no bullets, no confidence scoring

```json
{
  "query": "Attention Is All You Need paper",
  "mode": "fetch"
}
```

Returns:
```json
{
  "ok": true,
  "url": "https://arxiv.org/abs/1706.03762",
  "contentType": "text/html",
  "title": "[1706.03762] Attention Is All You Need",
  "fullText": "Abstract\n\nThe dominant sequence transduction models...",
  "codeBlocks": [],
  "source": "arxiv"
}
```

### Option B: `options.rawPages: true` flag

Add to existing mode calls:
```json
{
  "query": "Attention Is All You Need paper",
  "mode": "academic",
  "options": { "rawPages": true }
}
```

The response then includes:
- Normal synthesis (answer, bullets, citations)
- PLUS `rawPages: [{url, fullText, sourceType, ...}]` with top 1-3 full page texts

### Option C: Built-in PDF parser

For papers specifically:

```js
// In fetchPageSource, when URL is arxiv.org/abs/...
const pdfUrl = url.replace("/abs/", "/pdf/") + ".pdf";
const pdfText = await parsePdf(pdfUrl);
// Returns structured paper: { abstract, sections, citations, fullText }
```

Use `pdfjs-dist` (Node.js compatible PDF parser) or route through Jina Reader which already handles PDF → Markdown.

## Recommendation

Implement **Option A + C**: A dedicated `fetch` mode + PDF-aware page fetching. This covers both the general "I want raw content" case and the specific "I want the paper" case.

The `fetch` mode:
- Does one search round to find the best URL
- Fetches with PDF support (Jina Reader for PDFs, Scrapling for JS pages)
- Returns full text + metadata
- No LLM, no synthesis, no follow-ups
- ~500ms instead of 5-30s

This gives the agent what it actually wants: **the content, not a summary**.
