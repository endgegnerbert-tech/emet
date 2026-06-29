import test from "node:test";
import assert from "node:assert/strict";
import {
  getDomainPack,
  listDomainFamilies,
  listDomainOverlays,
  listDomainPacks,
  resolveDomainConfig,
} from "../lib/domains/index.js";

test("listDomainPacks keeps legacy aliases while families expose the new architecture", () => {
  const packs = listDomainPacks();
  const families = listDomainFamilies();
  const overlays = listDomainOverlays();

  assert.ok(packs.includes("github"));
  assert.ok(packs.includes("security"));
  assert.ok(packs.includes("medical"));
  assert.ok(packs.includes("cloud-docs"));
  assert.ok(packs.includes("news-current-events"));
  assert.ok(families.includes("developer-docs"));
  assert.ok(families.includes("regulated"));
  assert.ok(families.includes("current-events"));
  assert.ok(overlays.includes("official-only"));
  assert.ok(overlays.includes("recency-required"));
  assert.ok(overlays.includes("community-complaints"));
  assert.ok(overlays.includes("social-verify"));
});

test("getDomainPack returns the web fallback pack", () => {
  assert.equal(getDomainPack("web").name, "web");
});

test("resolveDomainConfig applies security source controls", () => {
  const config = resolveDomainConfig("CVE-2024-3094 openssl advisory impact");
  assert.equal(config.domain, "security");
  assert.equal(config.domainFamily, "regulated");
  assert.ok(config.overlays.includes("security"));
  assert.ok(config.allowedSources.includes("nvd.nist.gov"));
  assert.equal(config.requireAuthoritative, true);
});

test("resolveDomainConfig applies vendor status source controls", () => {
  const config = resolveDomainConfig("Any outage or incident reported?");
  assert.equal(config.domain, "vendor-status");
  assert.equal(config.domainFamily, "current-events");
  assert.ok(config.allowedSources.includes("status"));
  assert.equal(config.preferRecent, true);
});

test("github pack advertises issue and discussion sources", () => {
  const pack = getDomainPack("github");
  assert.ok(pack.sourceHints.includes("issues"));
  assert.ok(pack.sourceHints.includes("discussions"));
});

test("resolveDomainConfig maps medical guidance to authoritative primary sources", () => {
  const config = resolveDomainConfig("clinical guideline for asthma treatment");
  assert.equal(config.domain, "medical");
  assert.equal(config.domainFamily, "regulated");
  assert.ok(config.allowedSources.includes("pubmed.ncbi.nlm.nih.gov"));
  assert.equal(config.requireAuthoritative, true);
});

test("resolveDomainConfig maps cloud docs queries to provider documentation", () => {
  const config = resolveDomainConfig("AWS IAM role trust policy reference");
  assert.equal(config.domain, "cloud-docs");
  assert.equal(config.domainFamily, "developer-docs");
  assert.ok(config.overlays.includes("cloud-docs"));
  assert.ok(config.allowedSources.includes("docs.aws.amazon.com"));
  assert.ok(config.allowedSourceTypes.includes("official_doc"));
});

test("resolveDomainConfig uses recent-news policy for current events", () => {
  const config = resolveDomainConfig("latest OpenAI announcement headlines");
  assert.equal(config.domain, "news-current-events");
  assert.equal(config.domainFamily, "current-events");
  assert.equal(config.preferRecent, true);
  assert.ok(config.allowedSourceTypes.includes("news"));
});

test("manual hints compose family and overlays without forcing a flat pack", () => {
  const config = resolveDomainConfig({
    query: "Shopify webhook migration",
    familyHint: "developer-docs",
    domainHint: "shopify",
    overlays: ["changelog"],
  });

  assert.equal(config.domainFamily, "developer-docs");
  assert.ok(config.overlays.includes("shopify"));
  assert.ok(config.overlays.includes("changelog"));
  assert.ok(config.allowedSources.includes("shopify.dev"));
  assert.equal(config.requireAuthoritative, true);
});

test("forceDomain keeps expert overrides explicit", () => {
  const config = resolveDomainConfig({
    query: "generic product pricing",
    domain: "github",
    forceDomain: true,
  });

  assert.equal(config.domain, "github");
  assert.equal(config.domainFamily, "developer-docs");
  assert.deepEqual(config.sourcePolicy.decisionSource, "forced");
});

test("resolveDomainConfig exposes community extraction overlays", () => {
  const complaints = resolveDomainConfig({ query: "complaints about React 19", domain: "community-complaints" });
  assert.equal(complaints.domainFamily, "community");
  assert.ok(complaints.overlays.includes("community-complaints"));
  assert.ok(complaints.queryHints.includes("complaints"));

  const verify = resolveDomainConfig({ query: "HN says package is deprecated verify", domain: "social-verify" });
  assert.equal(verify.domainFamily, "community");
  assert.ok(verify.overlays.includes("official-only"));
  assert.equal(verify.requireAuthoritative, true);
});

test("package-registry pack allows official zero-setup API fallbacks", () => {
  const config = resolveDomainConfig({ query: "serde crate latest version", domain: "package-registry" });

  assert.ok(config.allowedSources.includes("registry.npmjs.org"));
  assert.ok(config.allowedSources.includes("pypi.org"));
  assert.ok(config.allowedSources.includes("crates.io"));
  assert.ok(config.allowedSources.includes("docs.rs"));
  assert.ok(config.allowedSources.includes("search.maven.org"));
  assert.ok(config.allowedSources.includes("api.github.com"));
  assert.ok(config.allowedSourceTypes.includes("official_doc"));
  assert.ok(config.allowedSourceTypes.includes("github_repo"));
});
