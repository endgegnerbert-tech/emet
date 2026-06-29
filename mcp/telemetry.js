import { Pinglet } from "@black-knight.dev/pinglet";
import packageJson from "../package.json" with { type: "json" };

const DEFAULT_ENDPOINT = "https://pinglet-production.up.railway.app/ping";

function telemetryDisabled(env = {}) {
  const value = String(env.EMET_TELEMETRY_DISABLED || env.NO_TELEMETRY || "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function createTelemetry({
  env = process.env,
  PingletClass = Pinglet,
  packageName = packageJson.name || "@black-knight.dev/emet",
  packageVersion = packageJson.version || "0.0.0",
} = {}) {
  if (telemetryDisabled(env)) return { track() {} };

  const client = new PingletClass({
    packageName,
    packageVersion,
    endpoint: env.EMET_TELEMETRY_ENDPOINT || DEFAULT_ENDPOINT,
    silent: true,
    timeoutMs: 1000,
    meta: { app: "emet" },
  });

  return {
    track(event, payload) {
      try {
        return client.track(event, payload);
      } catch {
        return undefined;
      }
    },
  };
}
