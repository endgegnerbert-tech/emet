import { createHash } from "node:crypto";

export const TRAINING_SCHEMA_VERSION = 1;

export const TRAINING_MODES = new Set(["fast", "deep", "code", "academic"]);

export const CANONICAL_REVIEW_SOURCES = new Set([
  "human",
  "pi_review",
  "llm_review",
  "weak_label",
  "synthetic",
]);

export const REVIEWED_LEGACY_SOURCES = new Set([
  "human",
  "human_gold",
  "human_review",
  "reviewed",
  "ai_accepted",
  "pi_review",
  "llm_review",
]);

export const PRELABEL_REVIEW_SOURCES = new Set([
  "ai_prelabel",
  "heuristic_prelabel",
  "observed_prelabel",
  "candidate_heuristic",
  "candidate_only",
]);

export const TASK_LABEL_FIELD = {
  domain: "domain",
  sufficiency: "sufficiency",
  conflict: "conflict",
  followup: "next_action",
  query_understanding: "query_shape",
};

function stableHash(value = "") {
  return createHash("sha1").update(String(value)).digest("hex");
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value, fallback = 0) {
  return Math.max(0, Math.min(1, finiteNumber(value, fallback)));
}

function countSourceMarkers(inputText = "") {
  const text = String(inputText || "");
  const matches = text.match(/^\[[^\]]+\]/gm);
  return matches ? matches.length : 0;
}

function canonicalReviewSource(source = "") {
  if (source === "human_gold" || source === "human_review" || source === "reviewed") return "human";
  if (source === "ai_accepted") return "llm_review";
  if (CANONICAL_REVIEW_SOURCES.has(source)) return source;
  if (PRELABEL_REVIEW_SOURCES.has(source)) return source;
  return source || "";
}

export function canonicalReviewFromRow(row = {}) {
  const review = asObject(row.review);
  const source = canonicalReviewSource(review.source || row.reviewSource || row.labelSource || "");
  const rawConfidence = review.confidence ?? row.confidence;
  const hasConfidence = rawConfidence !== undefined && rawConfidence !== null && rawConfidence !== "";
  return {
    source,
    confidence: hasConfidence ? clamp01(rawConfidence) : null,
    needs_human_review: Boolean(review.needs_human_review ?? row.needs_human_review ?? false),
    reviewer_model: review.reviewer_model || row.reviewerModel || null,
    reviewed_at: review.reviewed_at || row.reviewedAt || null,
  };
}

export function sourceStateFromRow(row = {}) {
  const meta = asObject(row.meta);
  const existing = asObject(row.source_state);
  const sourceCount = existing.source_count ?? meta.sourceCount ?? countSourceMarkers(row.inputText || row.input_text || "");
  const authorityCount = existing.authority_count ?? meta.authorityCount ?? (meta.authoritativeSourcesFound ? 1 : 0);
  const versionCoverage = asObject(meta.versionCoverage);
  return {
    source_count: finiteNumber(sourceCount),
    authority_count: finiteNumber(authorityCount),
    primary_count: finiteNumber(existing.primary_count ?? meta.primaryCount ?? 0),
    recent_count: finiteNumber(existing.recent_count ?? meta.recentCount ?? 0),
    distinct_domain_count: finiteNumber(existing.distinct_domain_count ?? meta.distinctDomainCount ?? 0),
    conflict_score: finiteNumber(existing.conflict_score ?? meta.conflictScore ?? (meta.conflictSummary ? 1 : 0)),
    version_match_score: finiteNumber(
      existing.version_match_score
        ?? meta.versionMatchScore
        ?? versionCoverage.exactMatchSources
        ?? 0,
    ),
  };
}

export function labelsFromRow(task, row = {}) {
  const labels = asObject(row.labels);
  const field = TASK_LABEL_FIELD[task];
  if (!field) return labels;
  return {
    ...labels,
    [field]: labels[field] || row.label || row.finalLabel || row.candidateLabel || "",
  };
}

export function canonicalTrainingId(task, row = {}) {
  const mode = row.mode || row.meta?.mode || "fast";
  return stableHash(JSON.stringify([TRAINING_SCHEMA_VERSION, task, row.query || "", row.inputText || row.input_text || "", mode]));
}

export function toCanonicalTrainingRow(row = {}, options = {}) {
  const task = options.task || row.task || "domain";
  const mode = row.mode || row.meta?.mode || "fast";
  return {
    schema_version: TRAINING_SCHEMA_VERSION,
    id: row.id || canonicalTrainingId(task, row),
    task,
    split: options.split || row.split || null,
    query: String(row.query || "").trim(),
    mode: TRAINING_MODES.has(mode) ? mode : "fast",
    input_text: String(row.input_text || row.inputText || row.query || ""),
    labels: labelsFromRow(task, row),
    source_state: sourceStateFromRow(row),
    review: canonicalReviewFromRow(row),
    provenance: {
      source: row.meta?.source || row.provenance?.source || row.labelSource || row.reviewSource || null,
      log_path: row.meta?.logPath || row.provenance?.log_path || null,
      cache_key: row.meta?.cacheKey || row.provenance?.cache_key || null,
      original_review_source: row.reviewSource || row.review?.source || null,
      label_quality_tier: options.labelQualityTier ?? row.label_quality_tier ?? null,
    },
  };
}

export function validateCanonicalTrainingRow(row = {}, options = {}) {
  const allowHoldoutWithoutReview = Boolean(options.allowHoldoutWithoutReview);
  const errors = [];
  const warnings = [];

  if (row.schema_version !== TRAINING_SCHEMA_VERSION) errors.push("invalid_schema_version");
  if (!row.id || typeof row.id !== "string") errors.push("missing_id");
  if (!row.query || typeof row.query !== "string") errors.push("missing_query");
  if (!TRAINING_MODES.has(row.mode)) errors.push("invalid_mode");

  const labelField = TASK_LABEL_FIELD[row.task];
  if (!labelField) errors.push("invalid_task");
  else if (!row.labels?.[labelField]) errors.push("missing_task_label");

  const review = canonicalReviewFromRow(row);
  if (!review.source) {
    if (allowHoldoutWithoutReview) warnings.push("missing_review_source_holdout_only");
    else errors.push("missing_review_source");
  }
  if (PRELABEL_REVIEW_SOURCES.has(review.source)) errors.push("prelabel_not_trainable");
  if (review.confidence === null) {
    if (allowHoldoutWithoutReview) warnings.push("missing_confidence_holdout_only");
    else errors.push("missing_review_confidence");
  }
  if (review.needs_human_review) errors.push("needs_human_review");
  if (review.source && !CANONICAL_REVIEW_SOURCES.has(review.source) && !PRELABEL_REVIEW_SOURCES.has(review.source)) {
    errors.push("unknown_review_source");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function isTrainableReview(row = {}) {
  const review = canonicalReviewFromRow(row);
  return Boolean(
    review.source
      && CANONICAL_REVIEW_SOURCES.has(review.source)
      && review.confidence !== null
      && !review.needs_human_review,
  );
}

export function summarizeReviewProvenance(rows = []) {
  const reviewSources = {};
  let reviewedRows = 0;
  let trainableRows = 0;
  let prelabelRows = 0;
  let missingReviewRows = 0;
  let missingConfidenceRows = 0;
  let needsHumanRows = 0;

  for (const row of rows) {
    const review = canonicalReviewFromRow(row);
    const sourceKey = review.source || "<missing>";
    reviewSources[sourceKey] = (reviewSources[sourceKey] || 0) + 1;

    const trainable = isTrainableReview(row);
    if (REVIEWED_LEGACY_SOURCES.has(row.reviewSource) || trainable) reviewedRows += 1;
    if (trainable) trainableRows += 1;
    if (PRELABEL_REVIEW_SOURCES.has(review.source)) prelabelRows += 1;
    if (!review.source) missingReviewRows += 1;
    if (review.confidence === null) missingConfidenceRows += 1;
    if (review.needs_human_review) needsHumanRows += 1;
  }

  return {
    reviewSources,
    reviewedRows,
    trainableRows,
    prelabelRows,
    missingReviewRows,
    missingConfidenceRows,
    needsHumanRows,
  };
}
