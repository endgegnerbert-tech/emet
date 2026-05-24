#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { startMcpServer } from "./mcp/index.js";

export * from "./mcp/index.js";

function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
}

if (isMainModule(import.meta.url)) {
  process.stderr.write("mcp-server.js is deprecated; use mcp/index.js instead.\n");
  startMcpServer();
}
