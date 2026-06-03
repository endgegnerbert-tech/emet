import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

import { Pinglet } from "pinglet";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");

let analytics;
let disabled = false;

function getConfigDir() {
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

function getEmetConfigPath() {
  const dir = join(getConfigDir(), "emet");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return join(dir, "config.json");
}

function loadConfig() {
  const path = getEmetConfigPath();
  if (!existsSync(path)) return { telemetryConsent: null };
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { telemetryConsent: null };
  }
}

function saveConfig(config) {
  writeFileSync(getEmetConfigPath(), JSON.stringify(config, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function shouldOptOut() {
  return (
    process.env.PINGLET_OPT_OUT === "1" ||
    process.env.DO_NOT_TRACK === "1" ||
    process.argv.includes("--no-telemetry") ||
    process.argv.includes("--disable-telemetry")
  );
}

async function askConsent() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("");
  console.log("  emet can send anonymous usage data to help improve the tool.");
  console.log("  Collected:");
  console.log("    - event name (run, tool:call, tool:success)");
  console.log("    - mode (fast, deep, code, academic)");
  console.log("    - package version, Node version, platform, CI flag");
  console.log("  NOT collected:");
  console.log("    - research queries, prompts, URLs, source contents");
  console.log("    - file paths, environment variables, secrets, API keys");
  console.log("    - logs, stack traces, or any user data");
  console.log("  Data goes to your own server (EMET_TELEMETRY_ENDPOINT).");
  console.log("  Opt out anytime with DO_NOT_TRACK=1 or --no-telemetry.");
  console.log("");
  const answer = await rl.question("  Allow anonymous usage telemetry? [Y/n] ");
  rl.close();
  return answer.trim().toLowerCase() !== "n";
}

function getAnalytics() {
  if (disabled) return undefined;
  if (analytics) return analytics;

  const endpoint = process.env.EMET_TELEMETRY_ENDPOINT;
  if (!endpoint) {
    disabled = true;
    return undefined;
  }

  // Hard opt-out via env / CLI flag
  if (shouldOptOut()) {
    disabled = true;
    return undefined;
  }

  analytics = new Pinglet({
    packageName: packageJson.name || "@black-knight.dev/emet",
    packageVersion: packageJson.version || "0.0.0",
    endpoint,
    askConsent: false,
    silent: true,
    timeoutMs: 1000,
    meta: {
      app: "emet",
    },
  });

  return analytics;
}

/**
 * Call once at startup. Handles consent prompt on first run in TTY.
 * Non-TTY starts (MCP background) wait until someone explicitly consents.
 */
export async function setupTelemetry() {
  if (!process.env.EMET_TELEMETRY_ENDPOINT) return;
  if (shouldOptOut()) return;

  const config = loadConfig();

  // Already decided
  if (config.telemetryConsent !== null) return;

  // Non-TTY → skip, don't track until someone consents in a terminal
  if (!isInteractive()) return;

  // Ask
  const allowed = await askConsent();
  saveConfig({ telemetryConsent: allowed });
}

export function trackEmetEvent(event, properties = {}) {
  if (shouldOptOut()) return;

  const config = loadConfig();

  // No consent given yet → don't track
  if (config.telemetryConsent !== true) return;

  const client = getAnalytics();
  if (!client) return;

  const safeProperties = {};
  if (typeof properties.mode === "string") safeProperties.mode = properties.mode.slice(0, 32);
  if (typeof properties.host === "string") safeProperties.host = properties.host.slice(0, 32);
  if (typeof properties.reason === "string") safeProperties.reason = properties.reason.slice(0, 64);

  void client.track(event, safeProperties).catch(() => {});
}
