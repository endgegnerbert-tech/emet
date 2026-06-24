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
- `allowedSources: [...]` — soft source hints for ranking; if every entry is a concrete host or host/path, they are also applied fail-closed
- `hostAllowlist: [...]` — strict fail-closed host or host/path filter when you already know the canonical sources

### Raw source access

- `web_fetch({ url })` — best when you already have the URL; faster than deep mode for targeted page reads
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

- `interactive: true` — return compact state and next choices; today this is most useful with explicit community/media `platforms`
- `sessionId` — continue a bounded session
- `action: "search" | "refine" | "fetch" | "synthesize"` — continue the session intentionally
- `queryOverride` — refine the question
- `selectedResultIds` / `selectedUrls` — fetch selected results from a checkpoint response

`interactive: true` is for checkpointing. `platforms` is for community/media retrieval. They are related, but not the same thing. If you already know the URL, use `web_fetch` instead of an interactive round.

## Good call patterns

### Current docs

```json
{
  "query": "current MCP sampling docs",
  "mode": "code",
  "options": {
    "requireAuthoritative": true,
    "hostAllowlist": ["modelcontextprotocol.io", "github.com/modelcontextprotocol"]
  }
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
- Do **not** rely on `allowedSources` alone for strict verification; use `hostAllowlist` when source boundaries must fail closed.
- Do **not** use `rawPages: true` by default; it makes responses much larger.
- Do **not** use `deep` when `fast`, `code`, or `web_fetch` is enough.
- Do **not** use `web_fetch` as a search tool; it expects a known URL.
