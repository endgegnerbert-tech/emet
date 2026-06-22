import web from "./web.js";
import github from "./github.js";
import forums from "./forums.js";
import security from "./security.js";
import packageRegistry from "./package-registry.js";
import changelog from "./changelog.js";
import papers from "./papers.js";
import specs from "./specs.js";
import vendorStatus from "./vendor-status.js";
import legal from "./legal.js";
import medical from "./medical.js";
import finance from "./finance.js";
import trading from "./trading.js";
import cloudDocs from "./cloud-docs.js";
import aiMl from "./ai-ml.js";
import ecommerce from "./ecommerce.js";
import quantum from "./quantum.js";
import shopify from "./shopify.js";
import standards from "./standards.js";
import newsCurrentEvents from "./news-current-events.js";
import localHowto from "./local-howto.js";
import { classifyQuestionDomain } from "../research-intent.js";

const FAMILY_PACKS = {
  web: {
    ...web,
    name: "web",
    sourceHints: ["official docs", "readme", "overview"],
  },
  "developer-docs": {
    name: "developer-docs",
    sourceHints: ["official docs", "reference", "readme", "changelog"],
    allowedSourceTypes: ["official_doc", "github_readme", "github_repo", "news", "other", "file"],
    queryHints: ["official docs", "reference"],
    requireAuthoritative: true,
  },
  academic: {
    name: "academic",
    sourceHints: ["papers", "doi", "publisher", "scholar"],
    allowedSourceTypes: ["paper", "official_doc", "github_readme", "github_repo", "news", "other", "file"],
    queryHints: ["site:arxiv.org", "site:semanticscholar.org", "doi"],
    requireAuthoritative: true,
  },
  regulated: {
    name: "regulated",
    sourceHints: ["official guidance", "regulator", "primary source"],
    allowedSourceTypes: ["official_doc", "paper", "news", "file"],
    queryHints: ["official guidance", "regulator", "primary source"],
    requireAuthoritative: true,
  },
  "current-events": {
    name: "current-events",
    sourceHints: ["recent news", "official statement", "status"],
    allowedSourceTypes: ["news", "official_doc", "other"],
    queryHints: ["official statement", "latest"],
    preferRecent: true,
  },
  commerce: {
    name: "commerce",
    sourceHints: ["official product", "pricing", "store policy"],
    allowedSourceTypes: ["official_doc", "news", "other"],
    queryHints: ["official product", "pricing", "official store"],
    preferRecent: true,
  },
  community: {
    name: "community",
    sourceHints: ["forum", "discussion", "community", "complaints", "feature requests", "sentiment"],
    allowedSourceTypes: ["forum", "github_repo", "github_readme", "blog", "video", "other"],
    queryHints: ["forum", "discussion", "community", "comments", "issues"],
  },
  "local-government": {
    name: "local-government",
    sourceHints: ["city", "county", "government", "permit"],
    allowedSourceTypes: ["official_doc", "other"],
    queryHints: ["site:gov", "official city", "official county"],
    requireAuthoritative: true,
    preferRecent: true,
  },
};

const OVERLAY_PACKS = {
  security,
  github,
  forums,
  "package-registry": packageRegistry,
  changelog,
  papers,
  specs,
  "vendor-status": vendorStatus,
  legal,
  medical,
  finance,
  trading,
  "cloud-docs": cloudDocs,
  "ai-ml": aiMl,
  ecommerce,
  quantum,
  shopify,
  standards,
  "news-current-events": newsCurrentEvents,
  "local-howto": localHowto,
  "official-only": {
    name: "official-only",
    sourceHints: ["official", "primary source"],
    queryHints: ["official"],
    requireAuthoritative: true,
  },
  "primary-source-required": {
    name: "primary-source-required",
    sourceHints: ["primary source"],
    queryHints: ["primary source", "official"],
    requireAuthoritative: true,
  },
  "recency-required": {
    name: "recency-required",
    sourceHints: ["current", "latest"],
    queryHints: [String(new Date().getFullYear()), "latest"],
    preferRecent: true,
  },
  "version-sensitive": {
    name: "version-sensitive",
    sourceHints: ["version", "release notes", "migration"],
    queryHints: ["release notes", "changelog", "migration guide"],
    requireAuthoritative: true,
    preferRecent: true,
  },
  "community-sentiment": {
    name: "community-sentiment",
    sourceHints: ["opinion", "sentiment", "discussion"],
    queryHints: ["opinions", "discussion", "reviews"],
  },
  "community-complaints": {
    name: "community-complaints",
    sourceHints: ["complaints", "bugs", "pain points"],
    queryHints: ["complaints", "problems", "issues"],
  },
  "feature-requests": {
    name: "feature-requests",
    sourceHints: ["feature requests", "wishes", "missing features"],
    queryHints: ["feature request", "missing", "wish"],
  },
  "social-verify": {
    name: "social-verify",
    sourceHints: ["community claim", "official confirmation"],
    queryHints: ["official", "confirmed", "source"],
    requireAuthoritative: true,
  },
  "video-transcript": {
    name: "video-transcript",
    sourceHints: ["video", "transcript", "captions"],
    queryHints: ["transcript", "captions", "video"],
  },
};

const DOMAIN_ALIASES = {
  web: { family: "web", overlays: [], primaryDomain: "web" },
  github: { family: "developer-docs", overlays: ["github"], primaryDomain: "github" },
  forums: { family: "community", overlays: ["forums"], primaryDomain: "forums" },
  "community-sentiment": { family: "community", overlays: ["community-sentiment"], primaryDomain: "community-sentiment" },
  "community-complaints": { family: "community", overlays: ["community-complaints"], primaryDomain: "community-complaints" },
  "feature-requests": { family: "community", overlays: ["feature-requests"], primaryDomain: "feature-requests" },
  "social-verify": { family: "community", overlays: ["social-verify", "official-only"], primaryDomain: "social-verify" },
  "video-transcript": { family: "community", overlays: ["video-transcript"], primaryDomain: "video-transcript" },
  security: { family: "regulated", overlays: ["security", "official-only"], primaryDomain: "security" },
  "package-registry": { family: "developer-docs", overlays: ["package-registry", "official-only"], primaryDomain: "package-registry" },
  changelog: { family: "developer-docs", overlays: ["changelog", "version-sensitive", "recency-required"], primaryDomain: "changelog" },
  papers: { family: "academic", overlays: ["papers", "primary-source-required"], primaryDomain: "papers" },
  specs: { family: "developer-docs", overlays: ["specs", "official-only"], primaryDomain: "specs" },
  "vendor-status": { family: "current-events", overlays: ["vendor-status", "recency-required", "official-only"], primaryDomain: "vendor-status" },
  legal: { family: "regulated", overlays: ["legal", "official-only"], primaryDomain: "legal" },
  medical: { family: "regulated", overlays: ["medical", "primary-source-required"], primaryDomain: "medical" },
  finance: { family: "regulated", overlays: ["finance", "official-only"], primaryDomain: "finance" },
  trading: { family: "regulated", overlays: ["finance", "trading", "recency-required", "official-only"], primaryDomain: "trading" },
  "cloud-docs": { family: "developer-docs", overlays: ["cloud-docs", "official-only"], primaryDomain: "cloud-docs" },
  "ai-ml": { family: "developer-docs", overlays: ["ai-ml", "official-only"], primaryDomain: "ai-ml" },
  ecommerce: { family: "commerce", overlays: ["ecommerce", "recency-required"], primaryDomain: "ecommerce" },
  quantum: { family: "academic", overlays: ["quantum", "papers", "primary-source-required"], primaryDomain: "quantum" },
  shopify: { family: "developer-docs", overlays: ["shopify", "official-only"], primaryDomain: "shopify" },
  standards: { family: "regulated", overlays: ["standards", "official-only"], primaryDomain: "standards" },
  "news-current-events": { family: "current-events", overlays: ["news-current-events", "recency-required"], primaryDomain: "news-current-events" },
  "local-howto": { family: "local-government", overlays: ["local-howto", "official-only", "recency-required"], primaryDomain: "local-howto" },
};

const FAMILY_NAMES = Object.keys(FAMILY_PACKS);
const OVERLAY_NAMES = Object.keys(OVERLAY_PACKS);
const DOMAIN_NAMES = Object.keys(DOMAIN_ALIASES);

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeName(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeName).filter(Boolean);
  return String(value).split(",").map(normalizeName).filter(Boolean);
}

function union(...groups) {
  return unique(groups.flatMap((group) => Array.isArray(group) ? group : []));
}

function resolveAlias(name) {
  const normalized = normalizeName(name);
  if (DOMAIN_ALIASES[normalized]) return DOMAIN_ALIASES[normalized];
  if (FAMILY_PACKS[normalized]) return { family: normalized, overlays: [], primaryDomain: normalized === "web" ? "web" : normalized };
  if (OVERLAY_PACKS[normalized]) return { family: null, overlays: [normalized], primaryDomain: normalized };
  return null;
}

function parseRouteInput(input = {}) {
  const query = input.query || input.question || input.q || "";
  const explicitDomain = normalizeName(input.domain);
  const domainHint = normalizeName(input.domainHint || input.packHint);
  const familyHint = normalizeName(input.familyHint || input.domainFamily || input.family);
  const forceDomain = Boolean(input.forceDomain || input.forcePack);
  const explicitOverlays = normalizeList(input.overlays || input.policyOverlays);
  const sourcePolicy = normalizeName(input.sourcePolicy);
  const explicitAlias = explicitDomain && explicitDomain !== "auto" ? resolveAlias(explicitDomain) : null;
  const hintAlias = domainHint && domainHint !== "auto" ? resolveAlias(domainHint) : null;
  const autoAlias = resolveAlias(classifyQuestionDomain(query));

  return {
    query,
    familyHint,
    forceDomain,
    explicitOverlays,
    sourcePolicy,
    explicitAlias,
    hintAlias,
    autoAlias,
  };
}

function routeFromParsedInput(parsed = {}) {
  const base = parsed.forceDomain && parsed.explicitAlias
    ? parsed.explicitAlias
    : parsed.explicitAlias || parsed.hintAlias || parsed.autoAlias || DOMAIN_ALIASES.web;

  const family = FAMILY_PACKS[parsed.familyHint] ? parsed.familyHint : base.family || "web";
  const overlayInputs = [
    ...(base.overlays || []),
    ...(parsed.hintAlias && parsed.hintAlias !== base ? parsed.hintAlias.overlays || [] : []),
    ...(parsed.explicitOverlays || []),
    ...(parsed.sourcePolicy && OVERLAY_PACKS[parsed.sourcePolicy] ? [parsed.sourcePolicy] : []),
  ];

  return {
    family,
    overlays: unique(overlayInputs.filter((overlay) => OVERLAY_PACKS[overlay])),
    primaryDomain: base.primaryDomain || family || "web",
    decisionSource: parsed.explicitAlias ? (parsed.forceDomain ? "forced" : "explicit") : parsed.hintAlias ? "hint" : "auto",
  };
}

function routeFromOptions(input = {}) {
  return routeFromParsedInput(parseRouteInput(input));
}

function mergePacks(family, overlays = []) {
  const familyPack = FAMILY_PACKS[family] || FAMILY_PACKS.web;
  const overlayPacks = overlays.map((name) => OVERLAY_PACKS[name]).filter(Boolean);
  const packs = [familyPack, ...overlayPacks];

  const allowedSourceTypes = overlayPacks.some((pack) => Array.isArray(pack.allowedSourceTypes) && pack.allowedSourceTypes.length)
    ? union(...overlayPacks.map((pack) => pack.allowedSourceTypes || []))
    : union(familyPack.allowedSourceTypes || []);

  return {
    allowedSources: union(...packs.map((pack) => pack.allowedSources || [])),
    allowedSourceTypes,
    queryHints: union(...packs.map((pack) => pack.queryHints || [])),
    sourceHints: union(...packs.map((pack) => pack.sourceHints || [])),
    requireAuthoritative: packs.some((pack) => Boolean(pack.requireAuthoritative)),
    preferRecent: packs.some((pack) => Boolean(pack.preferRecent)),
    format: packs.find((pack) => pack.format)?.format || "markdown",
  };
}

export function listDomainPacks() {
  return [...DOMAIN_NAMES];
}

export function listDomainFamilies() {
  return [...FAMILY_NAMES];
}

export function listDomainOverlays() {
  return [...OVERLAY_NAMES];
}

export function getDomainPack(name = "web") {
  const normalized = normalizeName(name);
  return OVERLAY_PACKS[normalized] || FAMILY_PACKS[normalized] || OVERLAY_PACKS[DOMAIN_ALIASES[normalized]?.primaryDomain] || FAMILY_PACKS.web;
}

export function resolveDomainSelection(input = {}) {
  const parsed = parseRouteInput(input && typeof input === "object" ? input : {});
  const route = routeFromParsedInput(parsed);
  return {
    ...route,
    explicitDomainRequested: Boolean(parsed.explicitAlias),
    shouldBypassLearnedRouter: Boolean(parsed.explicitAlias && (parsed.forceDomain || !parsed.hintAlias)),
  };
}

export function resolveDomainRoute(input = "web") {
  if (typeof input === "string") {
    const alias = resolveAlias(input);
    if (alias) return { ...alias, decisionSource: "explicit" };
    return { ...routeFromOptions({ query: input }), decisionSource: "auto" };
  }
  return resolveDomainSelection(input && typeof input === "object" ? input : {});
}

export function resolveDomainConfig(input = "web") {
  const route = resolveDomainRoute(input);
  const merged = mergePacks(route.family, route.overlays);

  return {
    domain: route.primaryDomain,
    domainFamily: route.family,
    overlays: route.overlays,
    sourcePolicy: {
      family: route.family,
      overlays: route.overlays,
      decisionSource: route.decisionSource,
    },
    allowedSources: merged.allowedSources,
    allowedSourceTypes: merged.allowedSourceTypes,
    queryHints: merged.queryHints,
    sourceHints: merged.sourceHints,
    requireAuthoritative: merged.requireAuthoritative,
    preferRecent: merged.preferRecent,
    format: merged.format,
  };
}
