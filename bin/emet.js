#!/usr/bin/env node

import { handleTelemetryCli } from "../lib/telemetry-cli.js";
import { startMcpServer } from "../mcp/index.js";

if (!(await handleTelemetryCli(process.argv.slice(2)))) {
  startMcpServer();
}
