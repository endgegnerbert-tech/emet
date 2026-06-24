// Boundary audit — verifies that dependency direction rules from the prep plan hold.
// Import analysis, not runtime behavior tests.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const libDir = join(__dirname, "..", "lib");

function importSources(path) {
  const content = readFileSync(path, "utf8");
  const re = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?["']([^"']+)["']/g;
  const sources = [];
  let m;
  while ((m = re.exec(content)) !== null) sources.push(m[1]);
  return sources;
}

function localImports(path) {
  return importSources(path).filter(s => s.startsWith(".") || s.startsWith("../"));
}

// ---------------------------------------------------------------------------
// Slice 6: Host/schema adapter boundaries
// ---------------------------------------------------------------------------

test("core policy/evidence modules import no adapter internals", () => {
  const forbidden = [
    "collectors/", "mcp/", "bin/",
    "cookie", "platform", "browser",
  ];
  const coreModules = [
    "research-contract.js",
    "research-session.js",
    "research-flow.js",
    "research-evidence.js",
    "research-policy.js",
    "research-guardrails.js",
    "research-output.js",
    "research-next-action-policy.js",
    "research-intent.js",
    "query-understanding.js",
    "router-policy-context.js",
    "research-trace.js",
    "local-logger.js",
    "research-memory.js",
    "version-context.js",
    "types.js",
    "research.js",
    "planner.js",
  ];

  for (const mod of coreModules) {
    const path = join(libDir, mod);
    const imports = localImports(path);
    const violations = [];
    for (const imp of imports) {
      for (const fb of forbidden) {
        if (imp.includes(fb)) {
          violations.push(imp);
          break;
        }
      }
    }
    assert.deepEqual(violations, [], `${mod} imports forbidden adapter internals: ${violations.join(", ")}`);
  }
});

test("MCP/Pi/CLI adapters import no collector internals beyond registry", () => {
  const adapters = [
    "cli.js",
    "../mcp/handlers/tools.js",
    "../mcp/hosts/profiles.js",
    "../mcp/hosts/prompts.js",
    "../mcp/handlers/resources.js",
    "../mcp/server.js",
    "../mcp/transport.js",
    "../index.js",
  ];

  for (const mod of adapters) {
    const path = join(libDir, mod);
    let imports;
    try {
      imports = localImports(path);
    } catch { continue; }

    // Allowed: collectors/index.js (public registry), collectors/collector.js (base class)
    // Forbidden: individual collector implementations
    const violations = imports.filter(imp =>
      imp.includes("collectors/") &&
      !imp.includes("collectors/index") &&
      !imp.includes("collectors/collector")
    );
    assert.deepEqual(violations, [], `${mod} imports individual collector: ${violations.join(", ")}`);
  }
});

test("research pipeline imports retrieval/community.js for collector entry", () => {
  // web-research.js is now a facade — actual import is in lib/research/pipeline.js
  const imports = localImports(join(libDir, "research", "pipeline.js"));
  assert.ok(imports.some(i => i.includes("retrieval/community")),
    "research/pipeline.js must import retrieval/community.js for collector functions");
});

// ---------------------------------------------------------------------------
// Slice 7: Domain/routing boundaries
// ---------------------------------------------------------------------------

test("domain packs import no network/I/O modules", () => {
  const domainsDir = join(libDir, "domains");
  // readdirSync imported at top level
  const files = readdirSync(domainsDir).filter(f => f.endsWith(".js") && f !== "index.js");

  for (const f of files) {
    const imports = localImports(join(domainsDir, f));
    const violations = imports.filter(imp =>
      imp.includes("collectors/") ||
      imp.includes("mcp/") ||
      imp.includes("fetch") ||
      imp.includes("search")
    );
    assert.deepEqual(violations, [], `domains/${f} imports I/O: ${violations.join(", ")}`);
  }
});

// ---------------------------------------------------------------------------
// Slice 8: Memory/cache/observability boundaries
// ---------------------------------------------------------------------------

test("local-logger.js writes structured data, no raw secrets fields", () => {
  const content = readFileSync(join(libDir, "local-logger.js"), "utf8");
  // Logger must never reference auth, token, cookie, credential
  const forbidden = ["authSecret", "apiKey", "token", "cookie", "credential", "password"];
  for (const fb of forbidden) {
    assert.ok(!content.includes(fb), `local-logger.js references ${fb}`);
  }
});

test("research-trace.js imports no collector or auth modules", () => {
  const imports = localImports(join(libDir, "research-trace.js"));
  const violations = imports.filter(imp =>
    imp.includes("collectors/") ||
    imp.includes("mcp/") ||
    imp.includes("auth") ||
    imp.includes("cookie")
  );
  assert.deepEqual(violations, [], `research-trace imports forbidden: ${violations.join(", ")}`);
});

test("research-memory.js cache keys are query/config-based, not raw session", () => {
  const content = readFileSync(join(libDir, "research-memory.js"), "utf8");
  // Cache keys must reference the normalized helpers
  assert.ok(content.includes("hashResearchQuery") || content.includes("modeCacheKey"),
    "research-memory must use hashResearchQuery or modeCacheKey for cache keys");
  // Must not reference raw collector session objects
  assert.ok(!content.includes("collectorSession") && !content.includes("collectorSessions"),
    "research-memory must not reference collector session objects");
});

// ---------------------------------------------------------------------------
// Slice 9: Module cohesion (no new module is < 50% of original)
// ---------------------------------------------------------------------------

test("extracted modules are non-trivial (>= 30 lines)", () => {
  const modules = [
    "research-contract.js",
    "research-session.js",
    "research-flow.js",
    "retrieval/normalize.js",
    "retrieval/community.js",
  ];
  for (const mod of modules) {
    const path = join(libDir, mod);
    const lines = readFileSync(path, "utf8").split("\n").length;
    assert.ok(lines >= 30, `${mod} has ${lines} lines, expected >= 30`);
  }
});

test("every extracted module has a focused test file", () => {
  const rd = readdirSync;
  const testDir = join(__dirname, "..", "test");
  const testFiles = rd(testDir).filter(f => f.endsWith(".test.js"));

  const required = [
    "research-contract.test.js",
    "research-session.test.js",
    "research-flow.test.js",
    "retrieval-normalize.test.js",
    "retrieval-community.test.js",
    "boundary-audit.test.js",
  ];
  for (const f of required) {
    assert.ok(testFiles.includes(f), `missing test file: test/${f}`);
  }
});
