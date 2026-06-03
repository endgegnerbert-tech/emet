import { disableTelemetry, enableTelemetry, getTelemetryStatus } from "./analytics.js";

function usage() {
  return `Usage:
  emet telemetry status
  emet telemetry enable [--level <1|2|3>]
  emet telemetry disable

This uses pinglet-native levels:
  0 = off
  1 = basic (run only)
  2 = standard
  3 = extended`;
}

function readArg(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function printStatus(status) {
  console.log(`Telemetry: ${status.enabled ? "enabled" : "disabled"}`);
  console.log(`Level:     ${status.level} (${status.mode})`);
  console.log(`Source:    ${status.source}`);
  console.log(`Endpoint:  ${status.endpoint || "not configured"}`);
  if (status.hardOptOut) console.log("Override:  disabled by DO_NOT_TRACK/PINGLET_OPT_OUT/--no-telemetry");
}

export async function handleTelemetryCli(args) {
  if (args[0] !== "telemetry") return false;

  const command = args[1] || "status";
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return true;
  }

  if (command === "status") {
    printStatus(getTelemetryStatus());
    return true;
  }

  if (command === "enable") {
    const levelArg = Number(readArg(args, "--level") || 1);
    printStatus(enableTelemetry({ level: levelArg }));
    return true;
  }

  if (command === "disable") {
    printStatus(disableTelemetry());
    return true;
  }

  console.error(`Unknown telemetry command: ${command}`);
  console.error(usage());
  process.exitCode = 1;
  return true;
}
