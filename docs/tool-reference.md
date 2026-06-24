# emet tool reference

Use this doc when you already know you want `emet`, but need the shortest path to the right call shape.

Pinned: [README](../README.md) · [quickstarts](./quickstarts.md) · [examples](./examples.md) · [pipeline](./pipeline.md)

## Public tools

| Tool | Use it for |
| --- | --- |
| `emet` | live research, docs lookup, comparisons, changelogs, security checks, papers, local file grounding, community/media retrieval, checkpointed sessions |
| `web_fetch` | raw extracted text for one known URL |

## Pick the right mode

| Mode | Best for |
| --- | --- |
| `fast` | current facts, quick doc checks, authority-first lookups |
| `deep` | comparisons, ambiguous questions, broad research, community/media work |
| `code` | docs, APIs, repos, READMEs, code-oriented answers |
| `academic` | papers, DOI/arXiv metadata, scholarly sources |

## High-value options

### Trust and source control

- `requireAuthoritative: true` — force stronger sources for factual/high-risk work
- `sourcePolicy: "official-only"` — bias toward official docs/pages
- `preferRecent: true` — better for current-product or release questions
- `allowedSources: [...]` — narrow retrieval when you already know the source family

### Raw source access

- `web_fetch({ url })` — best when you already have the URL
- `options.rawPages: true` — best when you want a normal `emet` answer plus full source text in `pageTexts[]`

### Local repo grounding

- `options.files: ["package.json", "README.md"]` — merge local evidence into the research run

### Community/media retrieval

Use `options.platforms` explicitly for read-only community/media sources:

- `hn`
- `v2ex`
- `github`
- `rss`
- `youtube`

Important: community/media results are signals, not automatic truth. For CVEs, outages, deprecations, vendor status, legal/medical topics, and similar high-risk claims, follow with authoritative sources.

### Checkpointed sessions

- `interactive: true` — return compact state and next choices
- `sessionId` — continue a bounded session
- `action: "search" | "refine" | "fetch" | "synthesize"` — continue the session intentionally
- `queryOverride` — refine the question
- `selectedResultIds` / `selectedUrls` — fetch selected results from a checkpoint response

`interactive: true` is for checkpointing. `platforms` is for community/media retrieval. They are related, but not the same thing.

## Good call patterns

### Current docs

```json
{
  "query": "current MCP sampling docs",
  "mode": "code",
  "options": { "requireAuthoritative": true }
}
```

### Security / CVE verification

```json
{
  "query": "Verify CVE-2026-12345 from vendor and NVD sources",
  "mode": "deep",
  "options": { "requireAuthoritative": true, "preferRecent": true }
}
```

### Community + GitHub checkpoint

```json
{
  "query": "What are developers saying about React 19 upgrade pain?",
  "mode": "deep",
  "options": {
    "platforms": ["hn", "github"],
    "interactive": true,
    "maxResultsPerPlatform": 5
  }
}
```

### Raw text after a normal research run

```json
{
  "query": "MCP tool schema docs",
  "mode": "code",
  "options": { "rawPages": true }
}
```

## Anti-patterns

- Do **not** use `interactive: true` for every call. Use it only when you want checkpoint/next-step control.
- Do **not** treat community results as enough for high-risk factual claims.
- Do **not** use `rawPages: true` by default; it makes responses much larger.
- Do **not** use `deep` when `fast` or `code` is enough.
- Do **not** use `web_fetch` as a search tool; it expects a known URL.
