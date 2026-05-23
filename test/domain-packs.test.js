import test from "node:test";
import assert from "node:assert/strict";
import { getDomainPack, listDomainPacks, resolveDomainConfig } from "../lib/domains/index.js";

test("listDomainPacks includes github and security", () => {
  const packs = listDomainPacks();
  assert.ok(packs.includes("github"));
  assert.ok(packs.includes("security"));
});

test("getDomainPack returns the web fallback pack", () => {
  assert.equal(getDomainPack("web").name, "web");
});

test("resolveDomainConfig applies security source controls", () => {
  const config = resolveDomainConfig("CVE-2024-3094 openssl advisory impact");
  assert.equal(config.domain, "security");
  assert.ok(config.allowedSources.includes("nvd.nist.gov"));
  assert.equal(config.requireAuthoritative, true);
});

test("resolveDomainConfig applies vendor status source controls", () => {
  const config = resolveDomainConfig("Any outage or incident reported?");
  assert.equal(config.domain, "vendor-status");
  assert.ok(config.allowedSources.includes("status"));
});

test("github pack advertises issue and discussion sources", () => {
  const pack = getDomainPack("github");
  assert.ok(pack.sourceHints.includes("issues"));
  assert.ok(pack.sourceHints.includes("discussions"));
});
