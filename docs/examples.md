# emet examples gallery

Copy-paste prompts for common jobs.

## Current facts

Prompt: `Use emet to verify the current stable Node.js version and cite official sources.`
Mode: `fast`
Result shape: short answer, official source, citations.

## API docs

Prompt: `Use emet in code mode for the current MCP server tool schema.`
Mode: `code`
Result shape: current docs, code-oriented citations.

## Version/deprecation

Prompt: `Use emet to check whether GitHub REST API version 2022-11-28 changed this endpoint.`
Mode: `code`
Result shape: version-aware answer with changelog/release sources.

## Package research

Prompt: `Use emet to compare the current install paths for npm package CLIs.`
Mode: `deep`
Result shape: npm docs plus package metadata notes.

## Security

Prompt: `Use emet to verify this CVE from NVD/CISA/vendor sources before answering.`
Mode: `deep`
Result shape: authority-first answer; weak blogs do not satisfy the result alone.

## Changelogs

Prompt: `Use emet to find the official changelog for React 19 and summarize breaking changes.`
Mode: `deep`
Result shape: official release/changelog citations.

## Academic

Prompt: `Use emet academic mode to find the original Transformer paper and authoritative metadata.`
Mode: `academic`
Result shape: paper sources, publication metadata, citations.

## Raw page text

Prompt/tool call: `web_fetch({ url: "https://example.com/docs" })`
Result shape: raw extracted text, title, source type, code blocks.

## Full raw pages from a research run

Tool call: `emet({ query: "MCP sampling docs", mode: "code", options: { rawPages: true } })`
Result shape: synthesized answer plus `pageTexts[]` with full source text.

## Local repo grounding

Tool call: `emet({ query: "best current API for this dependency", mode: "code", options: { files: ["package.json"] } })`
Result shape: answer grounded in local dependency evidence plus live docs.

## Official-only docs lookup

Tool call: `emet({ query: "current Stripe webhook signature docs", mode: "code", options: { sourcePolicy: "official-only" } })`
Result shape: official docs prioritized, lower-authority sources demoted.

## Comparison

Prompt: `Use emet deep mode to compare Playwright and Puppeteer current browser support.`
Mode: `deep`
Result shape: multi-source comparison with conflict notes if sources disagree.
