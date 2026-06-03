import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Pinglet } from "@black-knight.dev/pinglet";
import packageJson from "../package.json" with { type: "json" };

const DEFAULT_TELEMETRY_ENDPOINT = "https://pinglet-production.up.railway.app/ping";
const DEFAULT_ENABLE_LEVEL = 1;
const PACKAGE_NAME = packageJson.name || "@black-knight.dev/emet";
const PACKAGE_VERSION = packageJson.version || "0.0.0";

let analytics;
let analyticsEndpoint;
let runTracked = false;

function getConfigDir() {
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

function getPingletDir() {
  const dir = join(getConfigDir(), "pinglet");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function getPingletStatePath(packageName) {
  const safe = packageName.replace(/[^a-z0-9@/_.-]/gi, "_").replace(/[/]/g, "_");
  return join(getPingletDir(), `${safe}.json`);
}

function loadConsentState() {
  const path = getPingletStatePath(PACKAGE_NAME);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function saveConsentState(level) {
  const normalizedLevel = normalizeLevel(level, DEFAULT_ENABLE_LEVEL);
  writeFileSync(getPingletStatePath(PACKAGE_NAME), JSON.stringify({
    consent: normalizedLevel > 0,
    level: normalizedLevel,
  }, null, 2), { encoding: "utf-8", mode: 0o600 });
}

function normalizeEndpoint(value) {
  if (typeof value !== "string") return undefined;
  const endpoint = value.trim();
  return endpoint.length > 0 ? endpoint : undefined;
}

function normalizeLevel(value, fallback = DEFAULT_ENABLE_LEVEL) {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : fallback;
}

function resolveTelemetryEndpoint() {
  return normalizeEndpoint(process.env.EMET_TELEMETRY_ENDPOINT) || DEFAULT_TELEMETRY_ENDPOINT;
}

function telemetryLabel(level) {
  if (level <= 0) return "off";
  if (level === 1) return "basic";
  if (level === 2) return "standard";
  return "extended";
}

function shouldOptOut() {
  return (
    process.env.PINGLET_OPT_OUT === "1" ||
    process.env.DO_NOT_TRACK === "1" ||
    process.argv.includes("--no-telemetry") ||
    process.argv.includes("--disable-telemetry")
  );
}

function getConfiguredLevel() {
  const state = loadConsentState();
  if (!state || typeof state.level !== "number") return null;
  return normalizeLevel(state.level, DEFAULT_ENABLE_LEVEL);
}

function getAnalytics() {
  const endpoint = resolveTelemetryEndpoint();
  if (!endpoint || shouldOptOut()) return undefined;

  if (analytics && analyticsEndpoint === endpoint) return analytics;

  analyticsEndpoint = endpoint;
  analytics = new Pinglet({
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    endpoint,
    silent: true,
    timeoutMs: 1000,
    meta: { app: "emet" },
  });
  return analytics;
}

/** MCP startup must never prompt because stdio is reserved for transport. */
export async function setupTelemetry() {
  return;
}

export function getTelemetryStatus() {
  const level = getConfiguredLevel();
  const endpoint = resolveTelemetryEndpoint();
  const hardOptOut = shouldOptOut();
  return {
    enabled: Boolean(level && level > 0 && endpoint) && !hardOptOut,
    level: level ?? 0,
    mode: telemetryLabel(level ?? 0),
    endpoint: endpoint || null,
    hardOptOut,
    source: level === null ? "unset" : "configured",
  };
}

export function enableTelemetry({ level = DEFAULT_ENABLE_LEVEL } = {}) {
  saveConsentState(level);
  analytics = undefined;
  analyticsEndpoint = undefined;
  return getTelemetryStatus();
}

export function disableTelemetry() {
  saveConsentState(0);
  analytics = undefined;
  analyticsEndpoint = undefined;
  return getTelemetryStatus();
}

export async function trackEmetRunOnce(properties = {}) {
  if (runTracked) return;
  await trackEmetEvent("run", properties);
  runTracked = true;
}

export async function trackEmetEvent(event, properties = {}) {
  if (shouldOptOut()) return;
  if (getConfiguredLevel() === null) return;

  const client = getAnalytics();
  if (!client) return;
  await client.track(event, properties).catch(() => {});
}
