# Claude Code

## Install

```bash
npm install -g @black-knight.dev/emet
claude mcp add emet -- emet
claude mcp list
```

## Config file

Repo example: [`configs/claude-code/mcp.json`](../../configs/claude-code/mcp.json)

## Verify

```bash
emet doctor
claude mcp get emet
```

Expected: connected `emet` MCP server exposing `emet` and `web_fetch`.
