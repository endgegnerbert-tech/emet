# Codex

## Install

```bash
npm install -g @black-knight.dev/emet
emet init codex --write
```

## Config file

Repo example: [`configs/codex/config.toml`](../../configs/codex/config.toml)

Rendered shape:

```toml
[mcp_servers.emet]
command = "emet"
```

## Verify

```bash
codex mcp list
codex mcp get emet
```
