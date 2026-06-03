import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

function pingletConsentPath(configHome, packageName = "@black-knight.dev/emet") {
  const safe = packageName.replace(/[^a-z0-9@/_.-]/gi, "_").replace(/[/]/g, "_");
  return join(configHome, "pinglet", `${safe}.json`);
}

function listen(server) {
  return new Promise((resolvePort) => {
    server.listen(0, "127.0.0.1", () => resolvePort(server.address().port));
  });
}

function close(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

test("trackEmetEvent sends telemetry when emet consent is granted", async () => {
  const root = await mkdtemp(join(tmpdir(), "emet-analytics-"));
  const configHome = join(root, ".config");
  await mkdir(join(configHome, "pinglet"), { recursive: true });

  const received = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      received.push(JSON.parse(body));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  const port = await listen(server);

  const previous = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    EMET_TELEMETRY_ENDPOINT: process.env.EMET_TELEMETRY_ENDPOINT,
    PINGLET_OPT_OUT: process.env.PINGLET_OPT_OUT,
    DO_NOT_TRACK: process.env.DO_NOT_TRACK,
  };

  process.env.XDG_CONFIG_HOME = configHome;
  process.env.EMET_TELEMETRY_ENDPOINT = `http://127.0.0.1:${port}/ping`;
  delete process.env.PINGLET_OPT_OUT;
  delete process.env.DO_NOT_TRACK;
  await writeFile(pingletConsentPath(configHome), JSON.stringify({ consent: true, level: 3 }));

  const analyticsUrl = `${pathToFileURL(resolve("lib/analytics.js")).href}?test=${Date.now()}`;
  const { trackEmetEvent } = await import(analyticsUrl);
  await trackEmetEvent("tool:success", { mode: "fast", host: "test-host" });

  await close(server);
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  assert.equal(received.length, 1);
  assert.equal(received[0].pkg, "@black-knight.dev/emet");
  assert.equal(received[0].event, "tool:success");
  assert.notEqual(received[0].clientId, "internal");
  assert.equal(received[0].properties.mode, "fast");
  assert.equal(received[0].properties.host, "test-host");
});

test("telemetry CLI enables, reports, and disables consent without starting MCP", async () => {
  const root = await mkdtemp(join(tmpdir(), "emet-telemetry-cli-"));
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, ".config") };
  delete env.EMET_TELEMETRY_ENDPOINT;

  const defaultStatus = await execFile(process.execPath, ["bin/emet.js", "telemetry", "status"], { env });
  assert.match(defaultStatus.stdout, /Level:\s+0 \(off\)/);
  assert.match(defaultStatus.stdout, /Source:\s+unset/);

  const enabled = await execFile(process.execPath, ["bin/emet.js", "telemetry", "enable", "--level", "3"], { env });
  assert.match(enabled.stdout, /Telemetry: enabled/);
  assert.match(enabled.stdout, /Level:\s+3 \(extended\)/);
  assert.match(enabled.stdout, /Endpoint:\s+https:\/\/pinglet-production\.up\.railway\.app\/ping/);

  const status = await execFile(process.execPath, ["bin/emet.js", "telemetry", "status"], { env });
  assert.match(status.stdout, /Source:\s+configured/);

  const disabled = await execFile(process.execPath, ["bin/emet.js", "telemetry", "disable"], { env });
  assert.match(disabled.stdout, /Telemetry: disabled/);
  assert.match(disabled.stdout, /Level:\s+0 \(off\)/);
});

test("without telemetry consent emet sends nothing", async () => {
  const root = await mkdtemp(join(tmpdir(), "emet-default-telemetry-"));
  const configHome = join(root, ".config");

  const received = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      received.push(JSON.parse(body));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  const port = await listen(server);

  const previous = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    EMET_TELEMETRY_ENDPOINT: process.env.EMET_TELEMETRY_ENDPOINT,
    PINGLET_OPT_OUT: process.env.PINGLET_OPT_OUT,
    DO_NOT_TRACK: process.env.DO_NOT_TRACK,
  };

  process.env.XDG_CONFIG_HOME = configHome;
  process.env.EMET_TELEMETRY_ENDPOINT = `http://127.0.0.1:${port}/ping`;
  delete process.env.PINGLET_OPT_OUT;
  delete process.env.DO_NOT_TRACK;

  const analyticsUrl = `${pathToFileURL(resolve("lib/analytics.js")).href}?default=${Date.now()}`;
  const { trackEmetEvent } = await import(analyticsUrl);
  await trackEmetEvent("run", { mode: "fast", host: "test-host" });
  await trackEmetEvent("tool:call", { mode: "fast", host: "test-host" });

  await close(server);
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  assert.equal(received.length, 0);
});

test("level 1 emet telemetry sends run only", async () => {
  const root = await mkdtemp(join(tmpdir(), "emet-level1-telemetry-"));
  const configHome = join(root, ".config");
  await mkdir(join(configHome, "pinglet"), { recursive: true });

  const received = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      received.push(JSON.parse(body));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  const port = await listen(server);

  const previous = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    EMET_TELEMETRY_ENDPOINT: process.env.EMET_TELEMETRY_ENDPOINT,
    PINGLET_OPT_OUT: process.env.PINGLET_OPT_OUT,
    DO_NOT_TRACK: process.env.DO_NOT_TRACK,
  };

  process.env.XDG_CONFIG_HOME = configHome;
  process.env.EMET_TELEMETRY_ENDPOINT = `http://127.0.0.1:${port}/ping`;
  delete process.env.PINGLET_OPT_OUT;
  delete process.env.DO_NOT_TRACK;
  await writeFile(pingletConsentPath(configHome), JSON.stringify({ consent: true, level: 1 }));

  const analyticsUrl = `${pathToFileURL(resolve("lib/analytics.js")).href}?level1=${Date.now()}`;
  const { trackEmetEvent } = await import(analyticsUrl);
  await trackEmetEvent("run", { mode: "fast", host: "test-host" });
  await trackEmetEvent("tool:call", { mode: "fast", host: "test-host" });

  await close(server);
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  assert.equal(received.length, 1);
  assert.equal(received[0].event, "run");
  assert.equal(received[0].properties, undefined);
});
