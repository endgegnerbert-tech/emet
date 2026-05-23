# emet

![emet logo](docs/assets/emet-logo.png)

[![npm version](https://img.shields.io/npm/v/emet?color=blue)](https://www.npmjs.com/package/emet)
[![tests](https://img.shields.io/badge/tests-121%2F121-brightgreen)](https://github.com/tomsej/emet)
[![Pi package](https://img.shields.io/badge/pi-package-blueviolet)](https://pi.ai)

**The Zero-Setup Research Engine for Autonomous AI Agents.**

`emet` is an advanced grounding tool designed specifically for AI coding agents. It prevents agents from hallucinating API endpoints, guessing library versions, or inventing CVE details by injecting real-time, highly authoritative, and conflict-resolved web research directly into their context window.

![community packs](docs/assets/emet-community.png)

## 💡 Why `emet`?

The world does not need just another "AI Search Engine"—there are plenty of massive, standalone research tools out there. 

Instead, `emet` was built specifically to solve a crucial problem in the **Agentic Workflow**: When an autonomous agent is deep in a coding loop, compiling errors, or debugging, it needs hard facts instantly without losing focus. Calling out to heavy external search services or trying to execute brittle Playwright scripts breaks the agent's flow, wastes context window tokens, and leads to hallucinations.

`emet` solves this by providing a lightweight, internal **cognitive research loop** directly into the agent harness:
1. **Agent-Centric Routing:** It knows exactly where developers look (GitHub, NPM, NIST, arXiv).
2. **Authority First:** It prioritizes official documentation over random SEO-optimized tutorials.
3. **Self-Awareness:** It extracts structured features to know when it lacks information, safely triggering follow-up questions *before* returning an answer to the agent.

Best of all? **Zero setup.** No external search API keys to configure, no heavy local LLMs to run, and no flaky browser automation scripts to maintain. It's built to run silently and reliably alongside your agent.

---

## ✨ Features

- 🚀 **Lightning Fast:** Powered by a Hybrid Tiny-Router Architecture (Model2Vec + SVC), routing queries in **< 0.6 milliseconds**.
- 🛡️ **Anti-Hallucination:** Built-in Veto-Power for high-risk queries. If a security question only finds blog posts, the system forces a follow-up to find authoritative NIST/CVE data.
- 🕸️ **Resilient Fetching:** Pre-emptively escalates blocked, JS-heavy, or thin pages through an integrated, robust Python `Scrapling` daemon (via IPC JSON-RPC 2.0).
- 🧩 **Domain Packs:** Built-in heuristics for `github`, `security`, `papers`, `package-registry`, and more.
- 📊 **Structured Outputs:** Returns citations, code blocks, missing aspects, confidence scores, and conflict summaries (e.g., "Source A contradicts Source B").
- 📂 **Local Context:** Ingests local files (`options.files`) to ground web research in your current repository context.

---

## 📦 Installation

### Pi Coding Agent (Extension)
If you are using the Pi Agent harness, install the extension directly:
```bash
pi install npm:@black-knight.dev/emet
```

### Node.js / NPM (Standalone Server)
Install it globally to expose the MCP (Model Context Protocol) server for any compatible AI agent:
```bash
npm install -g @black-knight.dev/emet
emet
```
*(The MCP server identifies itself as `emet-mcp`, exposing the tool `emet`)*

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
- **GitHub:** [https://github.com/tomsej/emet](https://github.com/tomsej/emet)