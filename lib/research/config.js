// Config resolution. Layer: base.
import profiles from "../research-profiles.json" with { type: "json" };
import { resolveDomainConfig } from "../domains/index.js";
import { resolveOutputFormat } from "../research-output.js";
import { MIN_PAGE_TEXT } from "./cache.js";
import { inferOfficialTargets } from "./official-targets.js";

export function normalizeResearchOptions(input = "fast") {
  if (typeof input === "string") return { mode: input };
  if (input && typeof input === "object") return input;
  return { mode: "fast" };
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

export function resolveResearchConfig(input = "fast") {
  const options = normalizeResearchOptions(input);
  const base = profiles[options.mode] || profiles.fast;
  const deep = options.deepResearchConfig || {};
  const officialTargets = inferOfficialTargets(options.query || options.question || "");
  const normalizedOptions = options.requirePrimarySource
    ? { ...options, requireAuthoritative: true, overlays: unique([...(Array.isArray(options.overlays) ? options.overlays : []), "primary-source-required"]) }
    : options;
  const domainConfig = resolveDomainConfig(normalizedOptions.domain || normalizedOptions.domainHint || normalizedOptions.familyHint || normalizedOptions.overlays || normalizedOptions.sourcePolicy
    ? normalizedOptions
    : "web");

  return {
    ...base,
    ...domainConfig,
    ...normalizedOptions,
    mode: base.mode,
    maxTurns: options.maxTurns ?? (deep.depth ? Math.max(base.maxTurns || 1, deep.depth) : (base.maxTurns || 1)),
    maxQueries: options.maxQueries ?? (deep.breadth ? Math.max(base.maxQueries || 2, deep.breadth * (deep.depth || 1)) : (base.maxQueries || 2)),
    maxPages: options.maxSites ?? options.maxPages ?? base.maxPages,
    allowedSourceTypes: options.allowedSourceTypes ?? (Array.isArray(domainConfig.allowedSourceTypes) && domainConfig.allowedSourceTypes.length ? domainConfig.allowedSourceTypes : base.allowedSourceTypes),
    allowedSources: options.allowedSources ?? (Array.isArray(domainConfig.allowedSources) && domainConfig.allowedSources.length ? domainConfig.allowedSources : base.allowedSources),
    hostAllowlist: Array.isArray(options.hostAllowlist) ? options.hostAllowlist : [],
    searchProvider: options.searchProvider ?? base.searchProvider,
    concurrentQueries: deep.concurrency ?? options.concurrentQueries ?? 3,
    depth: deep.depth ?? 1,
    breadth: deep.breadth ?? 2,
    pageTextLimit: options.pageTextLimit ?? base.pageTextLimit,
    minPageText: options.minPageText ?? base.minPageText ?? MIN_PAGE_TEXT,
    preferRecent: options.preferRecent ?? domainConfig.preferRecent ?? base.preferRecent ?? false,
    minYear: options.minYear ?? base.minYear,
    maxYear: options.maxYear ?? base.maxYear,
    cacheTtlMs: options.cacheTtlMs ?? base.cacheTtlMs ?? 24 * 60 * 60 * 1000,
    files: Array.isArray(options.files) ? options.files : [],
    isolate: Boolean(options.isolate || process.env.RESEARCH_ISOLATE === "1"),
    force: Boolean(options.force),
    format: resolveOutputFormat(options, domainConfig.format || "markdown"),
    queryHints: unique([
      ...(Array.isArray(options.queryHints) ? options.queryHints : []),
      ...(Array.isArray(domainConfig.queryHints) ? domainConfig.queryHints : []),
      ...officialTargets.queryHints,
    ]),
    requireAuthoritative: Boolean(normalizedOptions.requireAuthoritative ?? (domainConfig.requireAuthoritative || domainConfig.domain === "github")),
    domain: domainConfig.domain,
    domainFamily: domainConfig.domainFamily,
    overlays: domainConfig.overlays,
    sourcePolicy: domainConfig.sourcePolicy,
    officialTargets,
  };
}

export function getResearchConfig(mode = "fast") {
  return resolveResearchConfig(mode);
}

export function resolveResearchModel(ctx) {
  return process.env.WEB_RESEARCH_MODEL || ctx?.model || null;
}
