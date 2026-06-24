# 5-minute quickstarts

Need the option semantics after setup? See [tool-reference.md](./tool-reference.md). Need host-specific setup? See [hosts/README.md](./hosts/README.md).

Install once:

```bash
npm install -g @black-knight.dev/emet
emet doctor
```

## Claude Code

```bash
claude mcp add emet -- emet
claude mcp list
```

Try: `Use emet to check the current MCP server docs.`

## Codex

```bash
emet init codex --write
```

Try: `Use emet for the latest Node.js test runner docs.`

## Cursor

```bash
emet init cursor --write
```

Restart Cursor and enable the `emet` MCP server in settings.

Try: `Use emet to compare current Vite and Next.js docs.`

## VS Code / Copilot

```bash
emet init vscode-copilot --write
```

Try: `Use emet to verify the current GitHub Actions syntax for permissions.`

## Gemini CLI

```bash
emet init gemini --write
```

Try: `Use emet to find the latest Gemini CLI MCP configuration docs.`

## Pi Coding Agent

```bash
pi install npm:@black-knight.dev/emet
```

Try: `Use emet when you are unsure about current package docs.`

## Community/media example

Tool call:

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

Supported read-only backends today: `hn`, `v2ex`, `github`, `rss`, `youtube`.

## Useful commands

```bash
emet doctor
emet init claude-code --print
emet fetch https://modelcontextprotocol.io/docs/develop/build-server --json
```
