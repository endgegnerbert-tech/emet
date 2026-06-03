# emet

![emet logo](docs/assets/emet-logo.png)

[![npm version](https://img.shields.io/npm/v/emet?color=blue)](https://www.npmjs.com/package/@black-knight.dev/emet)
[![tests](https://img.shields.io/badge/tests-187%2F187-brightgreen)](https://github.com/endgegnerbert-tech/emet)
[![Pi package](https://img.shields.io/badge/pi-package-blueviolet)](https://pi.ai)

**The Zero-Setup Research Engine for Autonomous AI Agents.**

`emet` is a grounded research layer for autonomous AI coding agents. It lets the agent decide when to verify facts, resolve source conflicts, or pull current documentation—without leaving the workflow.

![emet in action](docs/assets/emet-demo.gif)

![community packs](docs/assets/emet-community.png)

## 💡 Why `emet`?

Most search tools give links. `emet` gives the agent live, cited, conflict-aware answers it can use directly.

It fits the agent loop naturally: when the model sees uncertainty, version drift, API confusion, or security questions, it can autonomously call `emet` for grounding before it answers.

`emet` is designed to stay out of the way:
1. **Autonomous grounding:** the agent can decide when live verification is worth it.
2. **Authority first:** it prefers official docs and strong sources.
3. **Conflict-aware:** it surfaces contradictions instead of hiding them.

Best of all? **Zero setup.** No external search API keys, no heavy local LLMs, and no brittle browser scripts.

## ✅ What it does

`emet` helps agents:
- verify current facts against live sources
- avoid hallucinated endpoints, versions, and CVE details
- compare conflicting claims
- ground answers in local repo context when needed

## 🎯 Core use cases

- Check library/API versions
- Pull current official docs
- Compare conflicting sources
- Validate security/CVE claims
- Ground repo-specific questions from local files
- Retrieve code or README-backed documentation

---

## ✨ Features

- 🚀 **Lightning Fast:** Powered by a Hybrid Tiny-Router Architecture (Model2Vec + SVC), routing queries in **< 0.6 milliseconds**.
- 🛡️ **Anti-Hallucination:** Built-in Veto-Power for high-risk queries. If a security question only finds blog posts, the system forces a follow-up to find authoritative NIST/CVE data.
- 🕸️ **Resilient Fetching:** Pre-emptively escalates blocked, JS-heavy, or thin pages through an integrated, robust Python `Scrapling` daemon (via IPC JSON-RPC 2.0).
- 🧩 **Domain Families + Overlays:** Routes through stable retrieval families with composable overlays such as `security`, `github`, `changelog`, `shopify`, and `official-only`.
- 📊 **Structured Outputs:** Returns citations, code blocks, missing aspects, confidence scores, and conflict summaries (e.g., "Source A contradicts Source B").
- 📂 **Local Context:** Ingests local files (`options.files`) to ground web research in your current repository context.

---

## 📦 Installation

### Pi Coding Agent (Extension)
If you are using the Pi Agent harness, the Pi install path stays the same:

```bash
pi install npm:@black-knight.dev/emet
```

**Pi compatibility note:** the public Pi extension contract is unchanged. It still exports `extensions/emet.ts`, registers the `emet` tool, and keeps the same modes (`fast`, `deep`, `code`, `academic`). The new host-profile layer only affects MCP server surfaces.

### How to install the MCP server
For MCP hosts, prefer a real binary over `npx`. `emet` ships bin aliases (`emet`, `emet-mcp`), and explicit installation is the most reliable cross-host setup.

**Recommended global install**
```bash
npm install -g @black-knight.dev/emet
emet
```

**Project-local install**
```bash
npm install @black-knight.dev/emet
node ./node_modules/@black-knight.dev/emet/emet.js
```

**Local dev / repo checkout**
```bash
node ./mcp/server.js
```

The MCP server identifies itself as `emet-mcp` and exposes the tool `emet`.

### Optional anonymous usage analytics

`emet` can send anonymous runtime analytics through [`pinglet`](https://www.npmjs.com/package/pinglet), but it is **off by default**.

Enable it only by setting a pinglet endpoint:

```bash
EMET_TELEMETRY_ENDPOINT=https://your-pinglet-server.example/ping emet
```

Collected:
- package name/version
- event name: `run`, `tool:call`, `tool:success`, `tool:error`, `tool:skip`
- mode: `fast`, `deep`, `code`, or `academic`
- broad host profile, e.g. `claude-code`, `codex`, `generic`
- Node.js version, platform, CI flag
- anonymous random client id

Not collected:
- research queries
- prompts
- URLs
- source contents
- file paths
- environment variables
- API keys, secrets, tokens
- logs or stack traces

Opt out:

```bash
EMET_TELEMETRY_ENDPOINT= emet
PINGLET_OPT_OUT=1 emet
DO_NOT_TRACK=1 emet
emet --no-telemetry
```

### Host install matrix

| Host | Install command | Config example |
| --- | --- | --- |
| Claude Code | `npm install -g @black-knight.dev/emet` or plugin marketplace install | [`configs/claude-code/mcp.json`](./configs/claude-code/mcp.json) |
| Cursor | `npm install -g @black-knight.dev/emet` | [`configs/cursor/mcp.json`](./configs/cursor/mcp.json) |
| VS Code / Copilot | `npm install -g @black-knight.dev/emet` | [`configs/vscode-copilot/mcp.json`](./configs/vscode-copilot/mcp.json) |
| Codex | `npm install -g @black-knight.dev/emet` or plugin marketplace install | [`configs/codex/config.toml`](./configs/codex/config.toml) |
| Gemini CLI | `npm install -g @black-knight.dev/emet` | [`configs/gemini/settings.json`](./configs/gemini/settings.json) |

**Verified in real CLIs:** Claude Code, Codex, and Gemini CLI were tested with temporary installs. Claude and Codex connected successfully; Gemini registered successfully and was then gated by workspace trust, which is expected behavior.

### Host-specific setup
Ready-to-copy examples live in [`configs/`](./configs).

<details open>
<summary><strong>Claude Code</strong></summary>

**MCP install**
```bash
npm install -g @black-knight.dev/emet
claude mcp add emet -- emet
```

**Project config**
- Copy [`configs/claude-code/mcp.json`](./configs/claude-code/mcp.json) to `.mcp.json`

**Plugin / marketplace files**
- [`./.claude-plugin/plugin.json`](./.claude-plugin/plugin.json)
- [`./.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)

**Marketplace install**
```bash
claude plugin marketplace add https://github.com/endgegnerbert-tech/emet
claude plugin install emet@emet
```

**Local marketplace install (repo checkout)**
```bash
claude plugin marketplace add .
claude plugin install emet@emet
```

The Claude marketplace plugin runs the repo-bundled MCP entrypoint directly, so it does not require a separate global `emet` install.

**Verify**
```bash
claude mcp list
claude mcp get emet
```

For direct `claude mcp add ...`, expect `emet` with `Status: ✓ Connected`.
For marketplace installs, Claude prefixes the server name, so `claude mcp list` should show `plugin:emet:emet` as connected.

**Local marketplace validation**
```bash
claude plugin validate ./.claude-plugin/plugin.json
```

**Repo checkout alternative**
```bash
claude mcp add emet -- node ./mcp/server.js
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

**Install**
```bash
npm install -g @black-knight.dev/emet
```

Copy [`configs/cursor/mcp.json`](./configs/cursor/mcp.json) to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "emet": {
      "command": "emet"
    }
  }
}
```

**Verify**
Restart Cursor and confirm `emet` appears in MCP settings/tools and exposes the `emet` tool.

</details>

<details>
<summary><strong>VS Code / GitHub Copilot</strong></summary>

**Install**
```bash
npm install -g @black-knight.dev/emet
```

Copy [`configs/vscode-copilot/mcp.json`](./configs/vscode-copilot/mcp.json) to `.vscode/mcp.json`:

```json
{
  "servers": {
    "emet": {
      "type": "stdio",
      "command": "emet"
    }
  }
}
```

**Verify**
Restart VS Code and confirm the MCP server is available from Copilot Chat and exposes the `emet` tool.

</details>

<details>
<summary><strong>Codex</strong></summary>

**MCP install**
```bash
npm install -g @black-knight.dev/emet
```

Merge [`configs/codex/config.toml`](./configs/codex/config.toml) into `~/.codex/config.toml` or your project-level Codex config:

```toml
[mcp_servers.emet]
command = "emet"
```

**Plugin / marketplace files**
- [`./.codex-plugin/plugin.json`](./.codex-plugin/plugin.json)
- [`./.codex-plugin/mcp.json`](./.codex-plugin/mcp.json)
- [`./.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json)
- [`./plugins/emet`](./plugins/emet) (local marketplace source path)

**Marketplace install**
```bash
codex plugin marketplace add https://github.com/endgegnerbert-tech/emet
codex plugin add emet@emet
```

**Local marketplace install (repo checkout)**
```bash
codex plugin marketplace add .
codex plugin add emet@emet
```

The Codex marketplace plugin bootstraps `@black-knight.dev/emet` on first run from the plugin bundle in `plugins/emet`, so it does not require a separate global `emet` install.

**Verify**
```bash
codex mcp list
codex mcp get emet
```

Expected: `enabled: true` and `transport: stdio`.

**Marketplace usage**
Codex reads local plugin marketplaces from `.agents/plugins/marketplace.json`. This repo now ships that file plus a dedicated `plugins/emet` bundle for local marketplace workflows and future marketplace packaging.

</details>

<details>
<summary><strong>Gemini CLI</strong></summary>

**Install**
```bash
npm install -g @black-knight.dev/emet
```

Merge [`configs/gemini/settings.json`](./configs/gemini/settings.json) into `~/.gemini/settings.json` or `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "emet": {
      "command": "emet"
    }
  }
}
```

**Verify**
```bash
gemini mcp list
```

Expected: `emet` should appear in the configured MCP server list. In untrusted folders Gemini may show the server as configured but disabled until the workspace is trusted.

</details>

---

## 🚀 Quick Start / Usage

Once installed, your agent has access to the `emet` tool. It accepts a `query`, a `mode`, and various `options`.

### Modes
| Mode | Best for |
| --- | --- |
| `fast` | Quick factual lookups (e.g., "What is the latest LTS version of Node.js?"). Stops fetching early if authoritative sources are found. |
| `deep` | Broader retrieval with automatic follow-up rounds. Perfect for comparisons, conflicts, or unclear architecture questions. |
| `code` | Docs, repositories, README-driven answers, and retrieving actual code snippets. |
| `academic` | Scholarly sources, DOI links, and paper-heavy topics. |

### Example Tool Calls (For Agents)
**Factual Lookup:**
```json
{
  "query": "React 19 RC release notes",
  "mode": "fast",
  "options": { "requireAuthoritative": true }
}
```

**Architecture Research:**
```json
{
  "query": "Compare PostgreSQL and MySQL for multi-tenant SaaS",
  "mode": "deep",
  "options": { "preferRecent": true, "maxTurns": 2 }
}
```

---

## 🧠 Under the Hood: The Agentic Router Update (v1.4.0)

With `1.4.0`, `emet` shifted from heavy, generative JSON-planners to a **Hybrid Tiny-Router Architecture**.

- **Model2Vec & SVC:** Queries are classified via locally embedded features. Security and paper queries have a 0% downgrade rate.
- **Structured ML:** Instead of asking a heavy LLM "Is this enough data?", the system extracts deterministic features (`has_authority`, `conflict_state`) and uses an ultra-fast Logistic Regression model to evaluate sufficiency and follow-up actions with 100% evaluated accuracy.
- **Node.js-to-Python IPC:** Operates entirely locally using a highly optimized, line-delimited JSON-RPC daemon to manage Python dependencies (`Scrapling`, `Model2Vec`) without memory leaks.

---

## 🛣️ Future Roadmap

We are actively working on scaling the reasoning capabilities:
- **LLM Data Augmentation (Weak Supervision):** Generating synthetic training data for underconfident domains to boost zero-shot accuracy to >95% without manual labeling.
- **Active Learning Telemetry Loop:** Clustering low-confidence predictions from cache logs into a weakly-supervised retraining pipeline to let the system "self-heal."
- **Cross-Encoder for Conflict Detection:** Transitioning to a fine-tuned Cross-Encoder (e.g., MiniLM + Natural Language Inference) to detect deep semantic contradiction across differing texts (e.g., recognizing that "Node 20 is stable" contradicts "Node 20 is broken").

---

## 📝 License & Notices
- **License:** MIT
- **Third-party notices:** See `THIRD_PARTY_NOTICES.md`
- **GitHub:** [https://github.com/endgegnerbert-tech/emet](https://github.com/endgegnerbert-tech/emet)
