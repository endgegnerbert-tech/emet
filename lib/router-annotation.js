export const ANNOTATION_LABELS = {
  conflict: ["no_conflict", "resolved_by_authority", "resolved_by_recency", "needs_review"],
  sufficiency: ["sufficient", "need_authority", "need_more_sources", "need_recency", "need_version_context", "insufficient"],
};

export function parseJsonl(text = "") {
  return String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function stableHash(input = "") {
  let hash = 2166136261;
  const text = String(input);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function deriveAnnotationId(task, row = {}) {
  return stableHash(JSON.stringify([task || "unknown", row.query || "", row.inputText || "", row.meta?.mode || null]));
}

function isTemporalQuery(query = "") {
  return /\b(current|latest|today|status|support|supported|lts|2024|2025|2026|release)\b/i.test(query);
}

function isVersionQuery(query = "") {
  return /\b(version|v\d+|migration|upgrade|compatibility|compatible|build flag)\b/i.test(query);
}

function isProceduralDocQuery(query = "") {
  return /\b(readme|issue|repo|repository|docs|documentation|file|csv|json|run|how to|how evaluation works|spreadsheet|columns|api|abortcontroller|promise\.all|browsecomp_eval\.py)\b/i.test(query);
}

function hasBlockedMarker(text = "") {
  return /attention required!|cloudflare|access denied|temporarily unavailable/i.test(text);
}

function sourceTypeCounts(text = "") {
  const tags = ["official_doc", "paper", "github_readme", "github_repo", "forum", "blog", "other"];
  const counts = Object.fromEntries(tags.map((tag) => [tag, 0]));
  for (const tag of tags) {
    const matches = text.match(new RegExp(`\\[${tag}\\]`, "gi"));
    counts[tag] = matches ? matches.length : 0;
  }
  return counts;
}

function hasAuthorityMarkers(text = "") {
  const counts = sourceTypeCounts(text);
  return counts.official_doc + counts.paper + counts.github_readme + counts.github_repo > 0;
}

function hasFreshnessMarkers(text = "") {
  return /\b(current|latest|today|2024|2025|2026|lts|release|support status)\b/i.test(text);
}

function countStrongAuthority(counts) {
  return counts.official_doc + counts.paper + counts.github_readme;
}

export function suggestAnnotation(task, row = {}) {
  const query = String(row.query || "");
  const candidateLabel = String(row.candidateLabel || row.label || "");
  const inputText = String(row.inputText || "");
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const sourceCount = Number(meta.sourceCount || 0);
  const counts = sourceTypeCounts(inputText);
  const blocked = hasBlockedMarker(inputText);
  const authoritative = !blocked && (Boolean(meta.authoritativeSourcesFound) || hasAuthorityMarkers(inputText));
  const strongAuthority = countStrongAuthority(counts);
  const temporal = isTemporalQuery(query);
  const versioned = isVersionQuery(query);
  const procedural = isProceduralDocQuery(query);
  const freshness = hasFreshnessMarkers(inputText);

  if (task === "conflict") {
    if (candidateLabel === "no_conflict") {
      return { label: "no_conflict", rationale: "The snippets do not show a clear factual contradiction on the same claim." };
    }
    if (procedural && authoritative) {
      return { label: "no_conflict", rationale: "Repository, README, and documentation sources are more likely complementary than contradictory here." };
    }
    if (temporal && authoritative) {
      return { label: "resolved_by_recency", rationale: "This looks time-sensitive, so the more current authoritative source should decide the conflict." };
    }
    if (authoritative) {
      return { label: "resolved_by_authority", rationale: "Prefer the authoritative source over weaker secondary evidence." };
    }
    return { label: "needs_review", rationale: "The snippets suggest disagreement, but there is no clear authoritative or fresher winner." };
  }

  if (!authoritative) {
    return { label: "need_authority", rationale: "The available sources are not authoritative enough to treat this as fully answered." };
  }
  if (temporal && !freshness) {
    return { label: "need_recency", rationale: "This query is time-sensitive, but the snippets do not clearly establish current status." };
  }
  if (versioned) {
    return { label: "need_version_context", rationale: "This answer depends on version-specific behavior that should be confirmed explicitly." };
  }
  if (candidateLabel === "insufficient" && sourceCount <= 1) {
    return { label: "need_more_sources", rationale: "There is some evidence, but a single source is not enough for a robust answer here." };
  }
  if (candidateLabel === "insufficient" && strongAuthority >= 2 && sourceCount >= 3 && !temporal && !versioned) {
    return { label: "sufficient", rationale: "The sources appear authoritative enough and broad enough to answer the query reliably." };
  }
  if (sourceCount <= 2 && !procedural) {
    return { label: "need_more_sources", rationale: "There is some evidence, but not enough independent coverage yet." };
  }
  return { label: "sufficient", rationale: "The sources appear authoritative enough and broadly cover the query." };
}

export function buildAnnotationItems(task, draftRows = [], reviewedRows = []) {
  const reviewedById = new Map(
    reviewedRows.map((row) => [deriveAnnotationId(task, row), row]),
  );

  return draftRows.map((row) => {
    const id = deriveAnnotationId(task, row);
    const reviewed = reviewedById.get(id);
    const finalLabel = reviewed?.label || "";
    const rationale = reviewed?.rationale || row.rationale || "";
    const suggestion = suggestAnnotation(task, row);

    return {
      id,
      task,
      query: row.query || "",
      candidateLabel: row.candidateLabel || row.label || "",
      finalLabel,
      rationale,
      suggestedLabel: suggestion.label,
      suggestedRationale: suggestion.rationale,
      inputText: row.inputText || "",
      meta: row.meta && typeof row.meta === "object" ? row.meta : {},
      status: finalLabel ? "reviewed" : "pending",
    };
  });
}

export function upsertAnnotationReview(items = [], id, patch = {}) {
  return items.map((item) => {
    if (item.id !== id) return item;
    const finalLabel = patch.finalLabel ?? item.finalLabel ?? "";
    const rationale = patch.rationale ?? item.rationale ?? "";
    return {
      ...item,
      finalLabel,
      rationale,
      status: finalLabel ? "reviewed" : "pending",
    };
  });
}

export function summarizeAnnotationProgress(items = []) {
  const byLabel = {};
  let reviewed = 0;

  for (const item of items) {
    if (item?.status === "reviewed" && item.finalLabel) {
      reviewed += 1;
      byLabel[item.finalLabel] = (byLabel[item.finalLabel] || 0) + 1;
    }
  }

  return {
    total: items.length,
    reviewed,
    pending: Math.max(0, items.length - reviewed),
    byLabel,
  };
}

export function exportReviewedJsonl(items = []) {
  return items
    .filter((item) => item?.status === "reviewed" && item.finalLabel)
    .map((item) => JSON.stringify({
      query: item.query,
      label: item.finalLabel,
      rationale: item.rationale || "",
      inputText: item.inputText,
      candidateLabel: item.candidateLabel,
      meta: item.meta && typeof item.meta === "object" ? item.meta : {},
    }))
    .join("\n");
}
