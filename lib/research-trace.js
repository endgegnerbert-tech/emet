import { createHash } from "node:crypto";

import { classifySourceType, normalizeResearchFreshness, sourceMetaFromSources } from "./research.js";
import {
  extractConflictStructuredFeaturesFromPages,
  extractQueryAspectFlags,
  extractSufficiencyStructuredFeaturesFromPages,
  structuredSourcesFromPages,
} from "./router-structured-features.js";
import { extractVersionContext, scoreVersionMatch, summarizeVersionCoverage } from "./version-context.js";

export function hashText(text) {
  return createHash("sha1").update(String(text || "")).digest("hex");
}

export function jsonSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

export function snapshotSearchResult(result = {}) {
  return {
    title: result.title || "",
    url: result.url || "",
    snippet: result.snippet || "",
    sourceType: result.sourceType || classifySourceType(result.url, result.title),
    ...(result.publishDate ? { publishDate: result.publishDate } : {}),
    ...(typeof result.score === "number" ? { score: result.score } : {}),
    ...(result.versionSignals ? { versionSignals: result.versionSignals } : {}),
  };
}

export function annotateVersionSignals(entry = {}, versionContext) {
  if (!versionContext?.versionSensitive) return entry;
  return {
    ...entry,
    versionSignals: entry.versionSignals || scoreVersionMatch(entry, versionContext),
  };
}

export function snapshotPageForTrace(page = {}) {
  const freshness = normalizeResearchFreshness(page.freshness, page.publishDate);
  return {
    title: page.title || "",
    url: page.url || "",
    snippet: page.snippet || "",
    text: page.text || "",
    textLength: page.text?.length || 0,
    textHash: hashText(page.text || ""),
    codeBlocks: Array.isArray(page.codeBlocks) ? page.codeBlocks : [],
    sourceType: page.sourceType || classifySourceType(page.url, page.title),
    ...(typeof page.authoritative === "boolean" ? { authoritative: page.authoritative } : {}),
    ...(typeof page.score === "number" ? { score: page.score } : {}),
    freshness,
    ...(page.publishDate ? { publishDate: page.publishDate } : {}),
    ...(page.quality ? { quality: page.quality } : {}),
    ...(typeof page.local === "boolean" ? { local: page.local } : {}),
    ...(typeof page.expensive === "boolean" ? { expensive: page.expensive } : {}),
    ...(page.versionSignals ? { versionSignals: page.versionSignals } : {}),
  };
}

export function buildTraceSourceSummary(query, pages = []) {
  const versionContext = extractVersionContext(query);
  const versionedPages = pages.map((page) => annotateVersionSignals(page, versionContext));
  const structuredSources = structuredSourcesFromPages(versionedPages);
  const queryFlags = extractQueryAspectFlags(query);
  const distinctDomains = new Set(versionedPages.map((page) => {
    try {
      return new URL(page.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }).filter(Boolean));

  const normalizedFreshness = versionedPages.map((page) => normalizeResearchFreshness(page.freshness, page.publishDate));
  return {
    queryFlags,
    versionSummary: summarizeVersionCoverage(versionContext, versionedPages),
    structuredSources,
    distinctDomainCount: distinctDomains.size,
    followupInput: sourceMetaFromSources(versionedPages),
    freshnessCounts: {
      today: normalizedFreshness.filter((freshness) => freshness === "today").length,
      this_week: normalizedFreshness.filter((freshness) => freshness === "this_week").length,
      this_year: normalizedFreshness.filter((freshness) => freshness === "this_year").length,
      older: normalizedFreshness.filter((freshness) => freshness === "older").length,
      unknown: normalizedFreshness.filter((freshness) => freshness === "unknown").length,
    },
    conflictStructuredFeatures: extractConflictStructuredFeaturesFromPages(query, versionedPages, versionedPages.length > 1 ? "candidate_conflict" : ""),
    sufficiencyStructuredFeatures: extractSufficiencyStructuredFeaturesFromPages(query, versionedPages),
  };
}
