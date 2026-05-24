function text(value = "") {
  return String(value || "");
}

function lower(value = "") {
  return text(value).toLowerCase();
}

function uniqueBy(items = [], keyFn = (item) => item) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function majorOf(token = "") {
  return String(token).replace(/^v/i, "").split(/[.-]/)[0] || "";
}

function classifyToken(raw = "") {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^v\d+(?:\.\d+){0,2}$/i.test(value)) {
    const normalized = value.replace(/^v/i, "");
    return { raw: value, normalized, kind: normalized.includes(".") ? "semver" : "major" };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { raw: value, normalized: value, kind: "date_api" };
  if (/^(20\d{2})(0[1-9]|1[0-2])$/.test(value)) return { raw: value, normalized: value, kind: "yyyymm" };
  if (/^\d+\.\d+\.\d+$/.test(value)) return { raw: value, normalized: value, kind: "semver" };
  if (/^\d+\.\d+$/.test(value)) return { raw: value, normalized: value, kind: "semver" };
  return null;
}

function extractCandidateTokens(input = "") {
  const value = text(input);
  return [
    ...value.matchAll(/\bapiVersion\s*=\s*(\d{4}-\d{2}-\d{2})\b/gi),
    ...value.matchAll(/\bapiVersion\s*(\d{4}-\d{2}-\d{2})\b/gi),
    ...value.matchAll(/\b(v\d+(?:\.\d+){0,2})\b/gi),
    ...value.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g),
    ...value.matchAll(/\b((?:20\d{2})(?:0[1-9]|1[0-2]))\b/g),
    ...value.matchAll(/\b(\d+\.\d+\.\d+)\b/g),
    ...value.matchAll(/\b(\d+\.\d+)\b/g),
  ].map((match) => match[1]);
}

function collectNormalizedTokens(input = "") {
  return uniqueBy(extractCandidateTokens(input).map(classifyToken).filter(Boolean), (token) => `${token.kind}:${token.normalized}`);
}

function hasExplicitVersion(tokens = []) {
  return Array.isArray(tokens) && tokens.length > 0;
}

function sameVersionFamily(queryToken, sourceToken) {
  if (!queryToken || !sourceToken) return false;
  if (queryToken.kind === "major" || sourceToken.kind === "major") return majorOf(queryToken.normalized) === majorOf(sourceToken.normalized);
  if (queryToken.kind === "semver" && sourceToken.kind === "semver") {
    const [qMajor, qMinor] = queryToken.normalized.split(".");
    const [sMajor, sMinor] = sourceToken.normalized.split(".");
    return qMajor === sMajor && (!qMinor || !sMinor || qMinor === sMinor);
  }
  if (queryToken.kind === "date_api" && sourceToken.kind === "date_api") return queryToken.normalized.slice(0, 7) === sourceToken.normalized.slice(0, 7);
  if (queryToken.kind === "yyyymm" && sourceToken.kind === "yyyymm") return queryToken.normalized.slice(0, 4) === sourceToken.normalized.slice(0, 4);
  if (queryToken.kind === "date_api" && sourceToken.kind === "yyyymm") return queryToken.normalized.slice(0, 4) === sourceToken.normalized.slice(0, 4);
  if (queryToken.kind === "yyyymm" && sourceToken.kind === "date_api") return queryToken.normalized.slice(0, 4) === sourceToken.normalized.slice(0, 4);
  return false;
}

export function extractVersionContext(query = "") {
  const value = text(query);
  const q = lower(query);
  const normalizedTokens = collectNormalizedTokens(value);
  const explicitVersion = hasExplicitVersion(normalizedTokens);
  const deprecatedIntent = /\b(deprecated?|deprecation|legacy|sunset)\b/i.test(value);
  const removedIntent = /\b(removed?|retired|no longer available|end of life|eol)\b/i.test(value);
  const migrationIntent = /\b(migration|migrate|upgrade|upgrading)\b/i.test(value);
  const breakingChangeIntent = /\b(breaking changes?|breaking-changes?)\b/i.test(value);
  const releaseIntent = /\b(changelog|release notes?|releases?|version history)\b/i.test(value);
  const prefersLatest = /\b(current|latest|today|newest|recent)\b/i.test(value) && !explicitVersion;
  const temporalOnly = prefersLatest && !explicitVersion;
  const versionSensitive = explicitVersion
    || deprecatedIntent
    || removedIntent
    || migrationIntent
    || breakingChangeIntent
    || releaseIntent
    || /\b(api\s*version|apiversion|version|versions|compatibility|compatible|support|supported|lts)\b/i.test(value);

  return {
    schemaVersion: 1,
    query: value,
    normalizedQuery: q,
    versionSensitive,
    explicitVersion,
    temporalOnly,
    prefersLatest,
    prefersPinnedDocs: explicitVersion,
    prefersChangelog: explicitVersion || deprecatedIntent || removedIntent || migrationIntent || breakingChangeIntent || releaseIntent,
    prefersMigrationGuide: migrationIntent || deprecatedIntent || removedIntent,
    prefersBreakingChanges: breakingChangeIntent || deprecatedIntent || removedIntent,
    deprecatedIntent,
    removedIntent,
    migrationIntent,
    breakingChangeIntent,
    rawTokens: normalizedTokens.map((token) => token.raw),
    normalizedTokens,
  };
}

export function classifyVersionedSource(url = "", title = "", textContent = "") {
  const corpus = `${lower(url)}\n${lower(title)}\n${lower(String(textContent || "").slice(0, 2000))}`;
  if (/breaking[-\s]?changes?/.test(corpus)) return "breaking_changes";
  if (/\bmigration\b|\bupgrade\b|upgrading|migrate from/.test(corpus)) return "migration_guide";
  if (/release notes?|\/releases(?:\/|$)|version history/.test(corpus)) return "release_notes";
  if (/\bchangelog\b/.test(corpus)) return "changelog";
  if (/\bapiversion\b|api-versions?|versioning|\/v\d+(?:[./-]|$)/.test(corpus) || collectNormalizedTokens(corpus).length > 0) return "versioned_doc";
  return "generic_doc";
}

export function scoreVersionMatch(sourceLike = {}, versionContext = extractVersionContext()) {
  const context = versionContext && typeof versionContext === "object" ? versionContext : extractVersionContext("");
  const url = text(sourceLike.url || "");
  const title = text(sourceLike.title || "");
  const snippet = text(sourceLike.snippet || sourceLike.text || "");
  const sourceTokens = collectNormalizedTokens(`${url}\n${title}\n${snippet}`);
  const pageKind = classifyVersionedSource(url, title, snippet);
  const matchedTokens = [];
  let exactVersionMatch = false;
  let partialVersionMatch = false;

  for (const queryToken of context.normalizedTokens || []) {
    for (const sourceToken of sourceTokens) {
      if (queryToken.normalized === sourceToken.normalized) {
        exactVersionMatch = true;
        matchedTokens.push(queryToken.normalized);
        continue;
      }
      if (sameVersionFamily(queryToken, sourceToken)) partialVersionMatch = true;
    }
  }

  if (!exactVersionMatch && context.normalizedTokens.some((queryToken) => queryToken.kind === "major" && sourceTokens.some((sourceToken) => majorOf(queryToken.normalized) === majorOf(sourceToken.normalized)))) {
    exactVersionMatch = true;
    matchedTokens.push(...context.normalizedTokens.filter((queryToken) => queryToken.kind === "major").map((queryToken) => queryToken.normalized));
  }

  const hasOtherVersionToken = sourceTokens.length > 0;
  const currentLike = /\b(current|latest|newest|stable)\b/i.test(`${title} ${snippet}`);
  const mismatch = Boolean(context.explicitVersion && !exactVersionMatch && !partialVersionMatch && (hasOtherVersionToken || currentLike));

  let score = 0;
  if (exactVersionMatch) score += 14;
  else if (partialVersionMatch) score += 7;
  if (mismatch) score -= 7;

  if (context.prefersPinnedDocs && pageKind === "versioned_doc") score += 4;
  if (context.prefersChangelog && pageKind === "changelog") score += 6;
  if (context.prefersChangelog && pageKind === "release_notes") score += 5;
  if (context.prefersBreakingChanges && pageKind === "breaking_changes") score += 7;
  if (context.prefersMigrationGuide && pageKind === "migration_guide") score += 6;
  if (context.explicitVersion && currentLike && !exactVersionMatch) score -= 3;

  return {
    score,
    pageKind,
    matchedTokens: [...new Set(matchedTokens)].filter(Boolean),
    exactVersionMatch,
    partialVersionMatch,
    mismatch,
  };
}

export function summarizeVersionCoverage(versionContext = extractVersionContext(), pages = []) {
  const context = versionContext && typeof versionContext === "object" ? versionContext : extractVersionContext("");
  const signals = Array.isArray(pages) ? pages.map((page) => page?.versionSignals || scoreVersionMatch(page, context)) : [];

  return {
    versionSensitive: Boolean(context.versionSensitive),
    explicitVersion: Boolean(context.explicitVersion),
    temporalOnly: Boolean(context.temporalOnly),
    normalizedTokens: Array.isArray(context.normalizedTokens) ? context.normalizedTokens.map((token) => token.normalized) : [],
    deprecatedIntent: Boolean(context.deprecatedIntent),
    removedIntent: Boolean(context.removedIntent),
    migrationIntent: Boolean(context.migrationIntent),
    breakingChangeIntent: Boolean(context.breakingChangeIntent),
    exactMatchSources: signals.filter((signal) => signal?.exactVersionMatch).length,
    partialMatchSources: signals.filter((signal) => signal?.partialVersionMatch).length,
    mismatchSources: signals.filter((signal) => signal?.mismatch).length,
    changelogSources: signals.filter((signal) => signal?.pageKind === "changelog").length,
    releaseNotesSources: signals.filter((signal) => signal?.pageKind === "release_notes").length,
    breakingChangeSources: signals.filter((signal) => signal?.pageKind === "breaking_changes").length,
    migrationGuideSources: signals.filter((signal) => signal?.pageKind === "migration_guide").length,
    versionedDocSources: signals.filter((signal) => signal?.pageKind === "versioned_doc").length,
    genericDocSources: signals.filter((signal) => signal?.pageKind === "generic_doc").length,
  };
}
