import test from "node:test";
import assert from "node:assert/strict";

import {
  extractConflictStructuredFeatures,
  extractConflictStructuredFeaturesFromPages,
  extractQueryAspectFlags,
  extractSufficiencyStructuredFeatures,
  extractSufficiencyStructuredFeaturesFromPages,
  parseStructuredSources,
  structuredSourceFromPage,
} from "../lib/router-structured-features.js";

test("parseStructuredSources extracts typed sources and blocked markers", () => {
  const sources = parseStructuredSources(`Query: x\n\nSources:\n[official_doc] Attention Required! | Cloudflare\n\n[paper] Attention Is All You Need`);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].blocked, true);
  assert.equal(sources[1].authoritative, true);
});

test("extractQueryAspectFlags detects temporal, versioned, comparison, and academic queries", () => {
  const flags = extractQueryAspectFlags("2025 bun vs node compatibility benchmark paper latest");
  assert.equal(flags.temporal, 1);
  assert.equal(flags.versioned, 1);
  assert.equal(flags.comparison, 1);
  assert.equal(flags.academic, 1);
});

test("extractConflictStructuredFeatures summarizes authority and polarity signals", () => {
  const features = extractConflictStructuredFeatures({
    query: "Python 3.12 support status",
    inputText: `Query: x\n\nSources:\n[official_doc] Python 3.12 is supported\n\n[blog] Python 3.12 is not supported`,
  });

  assert.equal(features.query_temporal, 1);
  assert.equal(features.official_doc_count, 1);
  assert.equal(features.blog_count, 1);
  assert.equal(features.positive_signal_sources >= 1, true);
  assert.equal(features.negative_signal_sources >= 1, true);
});

test("extractSufficiencyStructuredFeatures captures authority breadth and blocked sources", () => {
  const features = extractSufficiencyStructuredFeatures({
    query: "Current node LTS version",
    inputText: `Query: x\n\nSources:\n[official_doc] Attention Required! | Cloudflare\n\n[github_readme] Node README\n\n[other] Blog post`,
  });

  assert.equal(features.query_temporal, 1);
  assert.equal(features.blocked_source_count, 1);
  assert.equal(features.authoritative_source_count, 1);
  assert.equal(features.github_readme_count, 1);
});


test("structuredSourceFromPage keeps runtime authority and blocked state", () => {
  const source = structuredSourceFromPage({
    title: "Cloudflare block",
    sourceType: "official_doc",
    quality: { blocked: true },
    text: "Attention Required! | Cloudflare",
  });

  assert.equal(source.blocked, true);
  assert.equal(source.authoritative, false);
});


test("page-based structured features match runtime pages", () => {
  const conflictFeatures = extractConflictStructuredFeaturesFromPages("Python 3.12 support status", [
    { title: "Python docs", sourceType: "official_doc", authoritative: true, text: "Python 3.12 is supported." },
    { title: "Blog", sourceType: "blog", text: "Python 3.12 is not supported." },
  ]);
  const sufficiencyFeatures = extractSufficiencyStructuredFeaturesFromPages("Current node LTS version", [
    { title: "Node README", sourceType: "github_readme", authoritative: true, text: "Node.js release schedule." },
  ]);

  assert.equal(conflictFeatures.official_doc_count, 1);
  assert.equal(conflictFeatures.blog_count, 1);
  assert.equal(conflictFeatures.negative_signal_sources >= 1, true);
  assert.equal(sufficiencyFeatures.has_authority, 1);
  assert.equal(sufficiencyFeatures.github_readme_count, 1);
});


test("page-based structured features capture version coverage and changelog hints", () => {
  const features = extractSufficiencyStructuredFeaturesFromPages("GitHub REST apiVersion 2022-11-28 deprecated endpoint", [
    {
      title: "Breaking changes - GitHub Docs",
      sourceType: "official_doc",
      authoritative: true,
      text: "Breaking changes for API version 2022-11-28.",
      versionSignals: {
        pageKind: "breaking_changes",
        matchedTokens: ["2022-11-28"],
        exactVersionMatch: true,
        partialVersionMatch: false,
        mismatch: false,
      },
    },
    {
      title: "Current API Versions",
      sourceType: "official_doc",
      authoritative: true,
      text: "Current API version 2026-03-10.",
      versionSignals: {
        pageKind: "versioned_doc",
        matchedTokens: [],
        exactVersionMatch: false,
        partialVersionMatch: false,
        mismatch: true,
      },
    },
  ]);

  assert.equal(features.query_versioned, 1);
  assert.equal(features.query_explicit_version, 1);
  assert.equal(features.query_deprecated_intent, 1);
  assert.equal(features.query_prefers_changelog, 1);
  assert.equal(features.version_exact_match_source_count, 1);
  assert.equal(features.version_mismatch_source_count, 1);
  assert.equal(features.breaking_changes_source_count, 1);
  assert.equal(features.versioned_doc_source_count, 1);
});
