// Heuristic feature extraction — rescued from router-structured-features.js after ML removal.
// Layer: base — no fetch, no filesystem, no process.env.

import { PLACEHOLDER_PATTERNS } from "../research-policy.js";
import { extractVersionContext } from "../version-context.js";

const AUTHORITATIVE_TYPES = new Set(["official_doc", "paper", "github_readme", "github_repo", "file"]);
const POSITIVE_PATTERN = /\b(supported|works|available|recommended|stable|benchmark|comprehensive|practical)\b/i;
const NEGATIVE_PATTERN = /\b(not supported|unsupported|does not|no support|broken|incompatible|removed|blocked|denied)\b/i;
const KNOWN_SOURCE_TYPES = new Set(["official_doc", "paper", "github_readme", "github_repo", "forum", "blog", "news", "other", "file"]);

export function parseStructuredSources(inputText = "") {
  const marker = "Sources:";
  const index = String(inputText).indexOf(marker);
  if (index === -1) return [];
  const body = String(inputText).slice(index + marker.length).trim();
  if (!body) return [];

  return body
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, idx) => {
      const match = chunk.match(/^\[([^\]]+)\]\s*(.*)$/s);
      const sourceType = match?.[1] || "other";
      const text = (match?.[2] || chunk).replace(/\s+/g, " ").trim();
      return {
        index: idx,
        sourceType,
        title: text,
        text,
        authoritative: AUTHORITATIVE_TYPES.has(sourceType),
        blocked: PLACEHOLDER_PATTERNS.some((p) => p.test(text)),
        positive: POSITIVE_PATTERN.test(text),
        negative: NEGATIVE_PATTERN.test(text),
      };
    });
}

export function structuredSourceFromPage(page = {}, index = 0) {
  const sourceType = KNOWN_SOURCE_TYPES.has(page.sourceType) ? page.sourceType : "other";
  const text = `${page.title || ""} ${page.snippet || page.text_sample || page.text || ""}`.replace(/\s+/g, " ").trim();
  const blocked = Boolean(page.quality?.blocked) || PLACEHOLDER_PATTERNS.some((p) => p.test(text));
  const authoritative = !blocked && (Boolean(page.authoritative) || AUTHORITATIVE_TYPES.has(sourceType));

  return {
    index,
    sourceType,
    title: page.title || text,
    text,
    authoritative,
    blocked,
    positive: POSITIVE_PATTERN.test(text),
    negative: NEGATIVE_PATTERN.test(text),
    versionSignals: page.versionSignals || null,
    domain_family: page.domain_family || page.domainFamily || null,
    domainFamily: page.domainFamily || page.domain_family || null,
    overlays: Array.isArray(page.overlays) ? page.overlays : [],
    source_policy_flags: Array.isArray(page.source_policy_flags) ? page.source_policy_flags : (Array.isArray(page.sourcePolicyFlags) ? page.sourcePolicyFlags : []),
    sourcePolicyFlags: Array.isArray(page.sourcePolicyFlags) ? page.sourcePolicyFlags : (Array.isArray(page.source_policy_flags) ? page.source_policy_flags : []),
  };
}

export function structuredSourcesFromPages(pages = []) {
  return Array.isArray(pages) ? pages.map((page, index) => structuredSourceFromPage(page, index)) : [];
}

export function extractQueryAspectFlags(query = "") {
  const text = String(query || "");
  const versionContext = extractVersionContext(query);
  return {
    temporal: /\b(current|latest|today|status|support|supported|lts|2024|2025|2026|release)\b/i.test(text) ? 1 : 0,
    versioned: versionContext.versionSensitive ? 1 : 0,
    explicitVersion: versionContext.explicitVersion ? 1 : 0,
    deprecatedIntent: versionContext.deprecatedIntent ? 1 : 0,
    prefersChangelog: versionContext.prefersChangelog ? 1 : 0,
    comparison: /\b(vs\.?|versus|compare|comparison|compared to)\b/i.test(text) ? 1 : 0,
    academic: /\b(paper|papers|study|studies|arxiv|doi|research|benchmark)\b/i.test(text) ? 1 : 0,
    procedural: /\b(readme|issue|repo|repository|docs|documentation|file|csv|json|run|how to|api)\b/i.test(text) ? 1 : 0,
  };
}
