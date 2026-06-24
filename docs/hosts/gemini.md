# Gemini CLI

## Install

```bash
npm install -g @black-knight.dev/emet
emet init gemini --write
```

## Config file

Repo example: [`configs/gemini/settings.json`](../../configs/gemini/settings.json)

## Verify

```bash
gemini mcp list
```

Expected: `emet` appears in the configured MCP server list. In untrusted folders, Gemini may keep it configured but disabled until the workspace is trusted.
