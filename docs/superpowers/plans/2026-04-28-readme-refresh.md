# pi-research README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the README to present pi-research as a local, agent-friendly research tool with clearer English, stronger positioning, and complete usage guidance.

**Architecture:** This is a documentation-only change. The only file to update is `README.md`. The new README should lead with a concise product explanation, clarify that the package does not rely on external research APIs or API keys, document the public tool parameters, and explain outputs, behavior, and limitations without mentioning browser automation.

**Tech Stack:** Markdown, existing package metadata, existing tool schema.

---

### Task 1: Rewrite README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the README with the new English version**

```md
# pi-research

`pi-research` is a Pi extension for fast, local-first web research inside the agent.

It searches the live web, ranks sources, reads the most relevant pages, and synthesizes a grounded answer with citations.
It does **not** require an external research API or API key, and it is not a browser automation tool.

## Why it exists

Most agents need two things to answer well:

1. a way to search the web efficiently
2. a way to turn sources into a usable answer

`pi-research` does both inside Pi, so the agent can research topics without calling a separate hosted research service.

## What it does

- searches the live web
- scores and deduplicates sources
- prefers official docs, READMEs, and papers when relevant
- follows up when the first pass is not enough
- extracts code blocks for code-focused questions
- supports local files as additional sources
- returns a structured result with citations and confidence metadata

## What it is not

- not a browser interaction tool
- not an offline knowledge base
- not a replacement for `browser_action`

Use `browser_action` for clicks, screenshots, DOM inspection, or page interaction.

## Install

### For Pi

```bash
pi install npm:pi-research
```

### For npm-based workflows

```bash
npm install pi-research
```

## Quick start

```text
What are the trade-offs between B-trees and LSM-trees?
```

```text
Show me the best way to add health checks to Docker Compose.
```

```text
Compare React Server Components with traditional SSR.
```

## Modes

| Mode | Best for |
| --- | --- |
| `fast` | quick answers with a quality floor |
| `deep` | broader retrieval with follow-up rounds |
| `code` | docs, READMEs, repositories, and code snippets |
| `academic` | scholarly sources and paper-heavy topics |

## Public tool parameters

- `query` — research question to answer
- `mode` — `fast`, `deep`, `code`, or `academic`
- `force` — bypass cached sufficiency checks
- `isolate` — run without session/query cache reuse
- `options.allowedSources` — restrict which source hints may be preferred
- `options.maxTurns` — limit follow-up rounds
- `options.maxSites` — limit how many sources are read
- `options.minYear` / `options.maxYear` — constrain source dates
- `options.preferRecent` — prefer newer sources
- `options.files` — include local files as sources
- `options.format` — output format: `markdown`, `json`, `table`, or `latex`
- `options.deepResearchConfig` — depth/breadth/concurrency tuning for deeper runs

## Example calls

### Fast mode

```text
query: What is the difference between HTTP and HTTPS?
mode: fast
```

### Deep mode

```text
query: Compare PostgreSQL and MySQL for multi-tenant SaaS
mode: deep
options:
  preferRecent: true
  maxTurns: 2
```

### Code mode

```text
query: How do I add retries to a Node.js fetch wrapper?
mode: code
```

### Academic mode

```text
query: Retrieval augmented generation evaluation methods
mode: academic
```

### Local files as sources

```text
query: Summarize the key points from these notes
mode: fast
options:
  files:
    - ./notes/project-notes.md
    - ./docs/spec.md
```

## Output

The tool returns structured data, including:

- `answer`
- `bullets`
- `sources`
- `citations`
- `codeBlocks`
- `confidence`
- `confidenceScore`
- `sufficient`
- `authoritativeSourcesFound`
- `openSubQuestions`
- `missingAspects`
- `conflictSummary`
- `unverifiedClaims`
- `sourceTypes`
- `meta`

## How it works

- **query-isolated caching**: repeated identical research can be skipped when the previous result was already sufficient
- **source scoring**: official docs, READMEs, papers, and local files are preferred over weak sources
- **follow-up planning**: unclear or conflicting results trigger a second round of research
- **conflict detection**: opposing claims are surfaced explicitly
- **fact checking**: unsupported answer sentences are marked as unverified
- **local source input**: files can be added directly to the research context

## Limitations

- it still depends on live web access for web research
- it does not browse pages like a human user
- it does not replace `browser_action`
- it is not fully offline unless you only use local files

## Package info

- Package name: `pi-research`
- Entry point: `extensions/pi-research.ts`
- GitHub: `https://github.com/endgegnerbert-tech/pi-research`

## Release notes

- Pi install: `pi install npm:pi-research`
- npm install: `npm install pi-research`
- Tool name: `pi-research`
```

- [ ] **Step 2: Verify the README reads cleanly and matches the public tool schema**

Run: `node -e "const p=require('./package.json'); console.log(p.pi.extensions[0])"`
Expected: prints `./extensions/pi-research.ts`

Run: `npm test --silent`
Expected: all tests pass

- [ ] **Step 3: Commit the documentation-only change**

```bash
git add README.md docs/superpowers/plans/2026-04-28-readme-refresh.md
git commit -m "docs: refresh pi-research README"
```
