# 5-minute quickstarts

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

## Useful commands

```bash
emet doctor
emet init claude-code --print
emet fetch https://modelcontextprotocol.io/docs/develop/build-server --json
```
