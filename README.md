# emet

![emet logo](docs/assets/emet-logo.png)

[![npm version](https://img.shields.io/npm/v/%40black-knight.dev%2Femet?color=blue)](https://www.npmjs.com/package/@black-knight.dev/emet)
[![package](https://img.shields.io/badge/package-pi%20%2B%20MCP-blueviolet)](https://www.npmjs.com/package/@black-knight.dev/emet)

**Zero-setup grounded research for AI coding agents.**

Pinned: [docs index](docs/README.md) · [tool reference](docs/tool-reference.md) · [host setup](docs/hosts/README.md) · [5-minute quickstarts](docs/quickstarts.md) · [examples](docs/examples.md) · [SECURITY](SECURITY.md) · [contributing](CONTRIBUTING.md) · [changelog](CHANGELOG.md) · [1.4.6 release notes](docs/releases/1.4.6.md)

`emet` gives agents live, cited answers from the web, docs, repositories, papers, and selected community/media sources — without adding tool sprawl.

> **Current shape:** public tools stay exactly `emet` + `web_fetch`. Community/media retrieval is read-only and explicit. Supported backends today: **Hacker News, V2EX, GitHub, RSS/Atom, YouTube**. Not every social network is supported, and factual/high-risk claims still require authoritative follow-up.

![emet in action](docs/assets/emet-demo.gif)

## Why emet

Most search tools return links. `emet` returns research the agent can use directly:

- live sources with citations
- authority-aware ranking for docs, security, versions, and changelogs
- conflict handling instead of silent averaging
- local repo grounding via `options.files`
- optional full page text via `web_fetch` or `options.rawPages: true`
- explicit community/media retrieval when web docs are not enough

## Public tool surface

| Tool | Use it for |
| --- | --- |
| `emet` | Live research, docs lookup, comparisons, papers, security checks, community/media retrieval, checkpointed sessions |
| `web_fetch` | Raw text for one known URL through emet's fetch/cache pipeline |

That is intentional: no `emet_search`, `emet_fetch`, or collector-specific public tools.

## Community and social/media support

`emet` is no longer web-only.

Supported read-only community/media backends today:

| Backend | What it is good for |
| --- | --- |
| `hn` | Hacker News discussions and launch reactions |
| `v2ex` | V2EX threads and community chatter |
| `github` | repos, issues, discussions, code search context |
| `rss` | feed-backed updates and mention tracking |
| `youtube` | metadata/transcript-oriented retrieval when available |

Use them explicitly with `options.platforms`, or ask with clear platform wording.

Important guardrail: community/social results are signals, not automatic truth. For CVEs, vendor status, deprecations, outages, medical/legal topics, and other high-risk claims, emet follows up with stronger sources.

## Quick start

### Pi

```bash
pi install npm:@black-knight.dev/emet
```

### MCP / CLI

```bash
npm install -g @black-knight.dev/emet
emet doctor
emet
```

- `emet doctor` checks the local install.
- plain `emet` starts the MCP stdio server.
- `emet fetch <url> [--json]` is the CLI equivalent of `web_fetch`.
- `emet init <host> --print|--write` writes known-good host configs.

## Host setup

| Host | Fastest setup | Config |
| --- | --- | --- |
| Claude Code | `claude mcp add emet -- emet` | [`configs/claude-code/mcp.json`](configs/claude-code/mcp.json) |
| Codex | `emet init codex --write` | [`configs/codex/config.toml`](configs/codex/config.toml) |
| Cursor | `emet init cursor --write` | [`configs/cursor/mcp.json`](configs/cursor/mcp.json) |
| VS Code / Copilot | `emet init vscode-copilot --write` | [`configs/vscode-copilot/mcp.json`](configs/vscode-copilot/mcp.json) |
| Gemini CLI | `emet init gemini --write` | [`configs/gemini/settings.json`](configs/gemini/settings.json) |
| Pi | `pi install npm:@black-knight.dev/emet` | extension entrypoint shipped in package |

More copy-paste setup lives in [docs/quickstarts.md](docs/quickstarts.md).

## Example calls

### Current docs / API lookup

```json
{
  "query": "current MCP sampling docs",
  "mode": "code",
  "options": { "requireAuthoritative": true }
}
```

### Community + GitHub research

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

### Full raw page text in the research result

```json
{
  "query": "MCP tool schema docs",
  "mode": "code",
  "options": { "rawPages": true }
}
```

### Raw text for one known URL

```json
{
  "url": "https://modelcontextprotocol.io/docs/develop/build-server"
}
```

More examples: [docs/examples.md](docs/examples.md)

## CLI helpers

```bash
emet doctor
emet init claude-code --print
emet init cursor --write
emet fetch https://example.com/docs --json
```

## Safety, privacy, and telemetry

- Security reporting lives in [SECURITY.md](SECURITY.md).
- `emet` is read-only.
- Queries, prompts, URLs, source contents, file paths, tokens, and secrets are not collected by the default telemetry described below.
- Anonymous runtime usage analytics are provided by [`pinglet`](https://github.com/endgegnerbert-tech/pinglet).

Opt out anytime:

```bash
DO_NOT_TRACK=1 emet
PINGLET_OPT_OUT=1 emet
emet --no-telemetry
```

## Docs

Start here:

- [docs/README.md](docs/README.md) — docs index
- [docs/quickstarts.md](docs/quickstarts.md) — host-by-host copy-paste setup
- [docs/hosts/README.md](docs/hosts/README.md) — shortest path per supported host
- [docs/tool-reference.md](docs/tool-reference.md) — modes, options, and best call patterns
- [docs/examples.md](docs/examples.md) — prompt and tool-call gallery
- [docs/pipeline.md](docs/pipeline.md) — maintainer pipeline/module overview
- [CHANGELOG.md](CHANGELOG.md) — release history
- [docs/releases/](docs/releases/) — pinned release notes

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

Local verification gate:

```bash
npm run check
```

## License

- MIT
- Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- Repo: <https://github.com/endgegnerbert-tech/emet>
