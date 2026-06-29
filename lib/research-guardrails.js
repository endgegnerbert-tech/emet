import { extractVersionContext } from "./version-context.js";

export const GUARDED_ROUTER_DOMAINS = new Set([
  "security",
  "papers",
  "specs",
  "changelog",
  "medical",
  "legal",
  "finance",
  "trading",
  "standards",
]);

export const GUARDRAIL_FLAG_NAMES = [
  "security_sensitive",
  "medical_sensitive",
  "legal_sensitive",
  "finance_sensitive",
  "version_sensitive",
  "recency_required",
  "official_source_required",
  "primary_source_required",
  "privacy_sensitive",
];

function lower(value = "") {
  return String(value || "").toLowerCase();
}

function emptyFlags() {
  return Object.fromEntries(GUARDRAIL_FLAG_NAMES.map((name) => [name, false]));
}

const GUARDRAIL_DECISION_BY_FLAG = {
  security_sensitive: "security_guardrail",
  medical_sensitive: "medical_guardrail",
  legal_sensitive: "legal_guardrail",
  finance_sensitive: "finance_guardrail",
  version_sensitive: "version_guardrail",
  recency_required: "recency_guardrail",
  official_source_required: "official_source_guardrail",
  primary_source_required: "primary_source_guardrail",
  privacy_sensitive: "privacy_guardrail",
};

function flagPattern(pattern, value) {
  return pattern.test(value);
}

function collectGuardrailDecisions(flags = {}) {
  return GUARDRAIL_FLAG_NAMES
    .filter((name) => flags[name])
    .map((name) => GUARDRAIL_DECISION_BY_FLAG[name])
    .filter(Boolean);
}

function hasHighRiskFlags(flags = {}) {
  return Boolean(flags.security_sensitive
    || flags.medical_sensitive
    || flags.legal_sensitive
    || flags.finance_sensitive
    || flags.privacy_sensitive);
}

export function buildResearchGuardrails(query = "", options = {}) {
  const q = lower(query);
  const versionContext = extractVersionContext(query);
  const flags = emptyFlags();

  flags.security_sensitive = flagPattern(/\b(cve-?\d{4}-\d+|cve\b|vulnerabilit(?:y|ies)|exploit|malware|ransomware|security advisory|security bulletin|zero[-\s]?day|csrf|xss|rce|privilege escalation)\b/i, q);
  flags.medical_sensitive = flagPattern(/\b(medical|medicine|clinical|diagnos(?:is|e)|treatment|dosage|drug interaction|patient|symptom|disease|therapy|prescription|hospital)\b/i, q);
  flags.legal_sensitive = flagPattern(/\b(legal|law|lawsuit|liability|contract|compliance|regulation|gdpr|hipaa|license|copyright|trademark|patent|court|attorney)\b/i, q);
  flags.finance_sensitive = flagPattern(/\b(finance|financial|investment|investing|tax|bank|banking|loan|mortgage|insurance|stock|crypto|portfolio|retirement|accounting)\b/i, q);
  flags.version_sensitive = Boolean(versionContext.versionSensitive)
    || flags.security_sensitive
    || flagPattern(/\b(changelog|release notes?|migration|upgrade|breaking changes?|version history|deprecat(?:e|ed|ion)|advisory)\b/i, q);
  flags.recency_required = Boolean(versionContext.temporalOnly || versionContext.prefersLatest)
    || flagPattern(/\b(current|latest|today|now|newest|recent|aktueller?|neueste|heute|status|supported|support status)\b/i, q);
  flags.primary_source_required = Boolean(options.requirePrimarySource)
    || flagPattern(/\b(primary source|official advisory|vendor advisory|publisher|doi|arxiv|pubmed|paper|study|clinical guideline|regulator|standard|rfc|specification)\b/i, q);
  flags.official_source_required = Boolean(options.requireAuthoritative)
    || flags.security_sensitive
    || flags.medical_sensitive
    || flags.legal_sensitive
    || flags.finance_sensitive
    || flags.version_sensitive
    || flags.primary_source_required
    || flagPattern(/\b(official|authoritative|docs?|documentation|reference|advisory|vendor|nist|cisa|mitre|regulator|government|gov\b)\b/i, q);
  flags.privacy_sensitive = flagPattern(/\b(ssn|social security|passport|credit card|api key|secret|token|password|private key|personal data|pii|patient data|bank account|iban)\b/i, q);

  const decisions = collectGuardrailDecisions(flags);
  const highRisk = hasHighRiskFlags(flags);

  const minimumEvidence = {
    minSources: highRisk ? 3 : (flags.version_sensitive || flags.recency_required || flags.official_source_required ? 2 : 1),
    minAuthoritativeSources: flags.official_source_required || flags.primary_source_required || highRisk ? 1 : 0,
    requireAuthoritative: flags.official_source_required || highRisk,
    requirePrimarySource: flags.primary_source_required,
    requireRecent: flags.recency_required,
  };

  return {
    schemaVersion: 1,
    guardrail_flags: flags,
    highRisk,
    decisions,
    minimumEvidence,
    versionContext,
  };
}

export function applyGuardrailsToResearchConfig(config = {}, guardrails = buildResearchGuardrails("")) {
  const evidence = guardrails?.minimumEvidence || {};
  return {
    ...config,
    minSources: Math.max(Number(config.minSources || 0), Number(evidence.minSources || 0)),
    minAuthoritativeSources: Math.max(Number(config.minAuthoritativeSources || 0), Number(evidence.minAuthoritativeSources || 0)),
    requireAuthoritative: Boolean(config.requireAuthoritative || evidence.requireAuthoritative),
    preferRecent: Boolean(config.preferRecent || evidence.requireRecent),
    guardrails: snapshotGuardrails(guardrails),
  };
}

export function guardrailVetoesDomainDowngrade(heuristicDomain = "", tinyDomain = "", guardrails = null) {
  if (!tinyDomain || tinyDomain !== "web") return false;
  if (GUARDED_ROUTER_DOMAINS.has(heuristicDomain)) return true;
  const flags = guardrails?.guardrail_flags || {};
  return Boolean((flags.official_source_required || flags.primary_source_required || guardrails?.highRisk) && heuristicDomain && heuristicDomain !== "web");
}

export function canUseFastSingleAuthority(config = {}) {
  return config.mode === "fast"
    && !config.guardrails?.highRisk
    && !config.guardrails?.minimumEvidence?.requireAuthoritative
    && !config.guardrails?.minimumEvidence?.requirePrimarySource
    && !config.guardrails?.minimumEvidence?.requireRecent;
}

export function resolveGuardrailedMinSources(config = {}, pages = []) {
  if (config.mode !== "fast") return config.minSources || 3;
  const hasAuthoritativePage = pages.some((page) => page.authoritative);
  return hasAuthoritativePage && canUseFastSingleAuthority(config)
    ? 1
    : Math.max(3, config.minSources || 3);
}

export function snapshotGuardrails(guardrails = {}) {
  return {
    schemaVersion: guardrails.schemaVersion || 1,
    guardrail_flags: { ...emptyFlags(), ...(guardrails.guardrail_flags || {}) },
    highRisk: Boolean(guardrails.highRisk),
    decisions: Array.isArray(guardrails.decisions) ? [...guardrails.decisions] : [],
    minimumEvidence: {
      minSources: Number(guardrails.minimumEvidence?.minSources || 1),
      minAuthoritativeSources: Number(guardrails.minimumEvidence?.minAuthoritativeSources || 0),
      requireAuthoritative: Boolean(guardrails.minimumEvidence?.requireAuthoritative),
      requirePrimarySource: Boolean(guardrails.minimumEvidence?.requirePrimarySource),
      requireRecent: Boolean(guardrails.minimumEvidence?.requireRecent),
    },
  };
}
