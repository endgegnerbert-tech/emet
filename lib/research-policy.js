import { classifyQuestionDomain } from "./research-intent.js";
import { extractVersionContext } from "./version-context.js";

export const WEAK_PAGE_POLICY = {
  blockedTextLimit: 1200,
  weakTextLimit: 400,
  thinTextLimit: 1200,
  minQueryTermMatches: 2,
  minNegativeSignals: 2,
};

export const DOMAIN_AUTHORITY_RULES = {
  security: {
    hosts: ["nvd.nist.gov", "cisa.gov", "mitre.org", "github.com", "ubuntu.com", "redhat.com", "debian.org", "suse.com"],
    type: "official_doc",
  },
  "vendor-status": {
    hosts: ["statuspage.io", "status.github.com"],
    type: "official_doc",
  },
  "package-registry": {
    hosts: ["npmjs.com", "pypi.org", "crates.io", "mvnrepository.com"],
    type: "official_doc",
  },
  github: {
    hosts: ["github.com"],
    type: "github_repo",
  },
  papers: {
    hosts: ["arxiv.org", "semanticscholar.org", "doi.org", "pubmed.ncbi.nlm.nih.gov", "nature.com", "science.org"],
    type: "paper",
  },
  web: {
    hosts: [],
    type: "official_doc",
  },
};

export const PLACEHOLDER_PATTERNS = [
  /cloudflare/i,
  /access denied/i,
  /temporarily unavailable/i,
  /attention required/i,
  /verify you are human/i,
  /security check/i,
  /captcha/i,
  /turnstile/i,
  /challenge-platform/i,
];

const VENDOR_RESEARCH_HOSTS = [
  "research.ibm.com",
  "research.google",
];

function baseQuery(query = "") {
  return String(query || "")
    .trim()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ");
}

function meaningfulTerms(text = "") {
  return [...new Set(String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !["the", "and", "for", "with", "from", "that", "this", "what", "which", "best", "official", "docs"].includes(term)))];
}

export function normalizeHostname(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostMatches(hostname, candidate) {
  return hostname === candidate || hostname.endsWith(`.${candidate}`);
}

function countOverlap(query = "", title = "", text = "") {
  const terms = meaningfulTerms(query);
  const haystack = `${title} ${String(text || "").slice(0, 1200)}`.toLowerCase();
  return terms.filter((term) => haystack.includes(term)).length;
}

export function resolvePolicyDomain(query = "", explicitDomain = "") {
  return explicitDomain || classifyQuestionDomain(query || "");
}

export function pageQualitySignals({ title = "", text = "", status = 200, contentType = "", url = "", query = "" } = {}) {
  const plain = String(text || "").replace(/\s+/g, " ").trim();
  const corpus = `${title}\n${plain}\n${url}`;
  const placeholder = PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(corpus));
  const queryTermMatches = countOverlap(query, title, plain);
  const negativeSignals = [];

  if (plain.length < WEAK_PAGE_POLICY.weakTextLimit) negativeSignals.push("weak_text");
  else if (plain.length < WEAK_PAGE_POLICY.thinTextLimit) negativeSignals.push("thin_text");
  if (placeholder) negativeSignals.push("placeholder");
  if (contentType && !/text\/(html|plain)/i.test(contentType)) negativeSignals.push("unsupported_content_type");
  if (query && queryTermMatches < WEAK_PAGE_POLICY.minQueryTermMatches) negativeSignals.push("query_overlap_low");

  const blocked = status === 403
    || status === 429
    || (placeholder && plain.length < WEAK_PAGE_POLICY.blockedTextLimit);
  const weak = blocked
    || negativeSignals.includes("weak_text")
    || negativeSignals.length >= WEAK_PAGE_POLICY.minNegativeSignals;

  return {
    blocked,
    weak,
    placeholder,
    plainLength: plain.length,
    queryTermMatches,
    negativeSignals,
  };
}

export function isUsableContent(page, config = {}) {
  if (!page || !page.text) return false;
  const quality = page.quality || pageQualitySignals({
    title: page.title,
    text: page.text,
    url: page.url,
    query: config.query || "",
    status: page.fetchStatus ?? 200,
    contentType: page.contentType || "text/html",
  });
  const minPageText = config.minPageText ?? WEAK_PAGE_POLICY.weakTextLimit;
  return !quality.blocked && !quality.placeholder && !quality.weak && quality.plainLength >= minPageText;
}

export function sourceAuthorityProfile({ url = "", title = "", text = "", query = "", domain = "" } = {}) {
  const hostname = normalizeHostname(url);
  const resolvedDomain = resolvePolicyDomain(query, domain);
  const quality = pageQualitySignals({ title, text, url, query });

  if (hostMatches(hostname, "researchgate.net")) {
    if (quality.blocked || quality.placeholder) {
      return { sourceType: "other", authoritative: false, domainBoost: -8, reasons: ["researchgate_placeholder"] };
    }
    return { sourceType: "other", authoritative: false, domainBoost: resolvedDomain === "papers" ? 2 : 0, reasons: ["researchgate_secondary"] };
  }

  if (VENDOR_RESEARCH_HOSTS.some((host) => hostMatches(hostname, host))) {
    return { sourceType: "official_doc", authoritative: true, domainBoost: 8, reasons: ["vendor_research_host"] };
  }

  const rule = DOMAIN_AUTHORITY_RULES[resolvedDomain] || DOMAIN_AUTHORITY_RULES.web;
  if (rule.hosts.some((host) => hostMatches(hostname, host))) {
    const reason = resolvedDomain === "github" && /\/(issues|pull|pulls|discussions)\//.test(url)
      ? "github_state_page"
      : "domain_authority_host";
    const authoritative = !(resolvedDomain === "github" && /\/(issues|pull|pulls|discussions)\//.test(url)) || /#readme|\/releases|\/blob\//.test(url);
    return { sourceType: rule.type, authoritative, domainBoost: authoritative ? 10 : 4, reasons: [reason] };
  }

  return { sourceType: null, authoritative: false, domainBoost: 0, reasons: [] };
}

function followUpSiteExclusions(seenUrls = []) {
  const sites = [...new Set(seenUrls.map((url) => normalizeHostname(url)).filter(Boolean))];
  return sites.length ? ` ${sites.map((site) => `-site:${site}`).join(" ")}` : "";
}

function buildVersionAwareFollowUpQueries(base, exclusions, versionContext, fallbackQuery) {
  if (!versionContext?.versionSensitive) return null;
  return [
    versionContext.prefersBreakingChanges ? `${base} breaking changes official${exclusions}` : null,
    versionContext.prefersChangelog ? `${base} release notes changelog${exclusions}` : null,
    versionContext.prefersMigrationGuide ? `${base} migration guide official${exclusions}` : null,
    fallbackQuery,
  ].filter(Boolean);
}

export function buildAuthorityFollowUpQueries(query = "", explicitDomain = "", options = {}) {
  const resolvedDomain = resolvePolicyDomain(query, explicitDomain);
  const base = baseQuery(query);
  const exclusions = followUpSiteExclusions(options.seenUrls);
  const versionContext = extractVersionContext(query);
  const versionAwareQueries = buildVersionAwareFollowUpQueries(base, exclusions, versionContext, `${base} official docs${exclusions}`);

  if (versionAwareQueries) return versionAwareQueries;

  switch (resolvedDomain) {
    case "security":
      return [`${base} cve advisory vendor${exclusions}`, `${base} nvd cisa mitre${exclusions}`];
    case "vendor-status":
      return [`${base} status page incident${exclusions}`, `${base} official outage status${exclusions}`];
    case "package-registry":
      return [`${base} npm pypi crates readme${exclusions}`, `${base} official package docs${exclusions}`];
    case "github":
      return [`${base} github readme releases${exclusions}`, `${base} site:github.com readme docs${exclusions}`];
    case "papers":
      return [`${base} arxiv doi publisher${exclusions}`, `${base} semanticscholar arxiv doi${exclusions}`];
    default:
      return [`${base} official docs${exclusions}`, `${base} documentation reference${exclusions}`];
  }
}

export function buildConflictFollowUpQueries(query = "", explicitDomain = "", options = {}) {
  const resolvedDomain = resolvePolicyDomain(query, explicitDomain);
  const base = baseQuery(query);
  const exclusions = followUpSiteExclusions(options.seenUrls);
  const versionContext = extractVersionContext(query);
  const versionAwareQueries = buildVersionAwareFollowUpQueries(base, exclusions, versionContext, `${base} official docs version history${exclusions}`);

  if (versionAwareQueries) return versionAwareQueries;

  switch (resolvedDomain) {
    case "security":
      return [`${base} vendor advisory official${exclusions}`, `${base} cve mitigation official${exclusions}`];
    case "vendor-status":
      return [`${base} incident status official${exclusions}`, `${base} status page postmortem${exclusions}`];
    case "package-registry":
      return [`${base} release notes changelog${exclusions}`, `${base} maintainer docs${exclusions}`];
    case "github":
      return [`${base} github releases readme${exclusions}`, `${base} canonical repo docs${exclusions}`];
    case "papers":
      return [`${base} arxiv doi compare${exclusions}`, `${base} publisher abstract official${exclusions}`];
    default:
      return [`${base} official docs support status${exclusions}`, `${base} official comparison reference${exclusions}`];
  }
}
