import { buildDeepQueries, buildFastQueries, classifyQueryIntent, inferOfficialDocsSite } from "./research.js";

export function planResearch(query, mode = "fast") {
  const intent = classifyQueryIntent(query);
  const docsSite = inferOfficialDocsSite(query || "");

  if (mode === "academic" || intent === "academic") {
    const subqueries = buildDeepQueries(query, 4);
    return {
      subqueries,
      expectedSources: ["paper", "official_doc"],
    };
  }

  if (mode === "code") {
    const base = String(query || "").trim();
    const comparisonFallback = intent === "comparison" ? `${base} benchmark comparison` : null;
    const subqueries = [...new Set([
      `${base} site:github.com`,
      `${base} official docs`,
      docsSite ? `${base} site:${docsSite}` : `${base} README`,
      comparisonFallback,
      ...buildFastQueries(query, 2),
    ])].filter(Boolean).slice(0, 4);

    return {
      subqueries,
      expectedSources: ["github_readme", "github_repo", "official_doc"],
    };
  }

  return {
    subqueries: buildFastQueries(query, 2),
    expectedSources: intent === "comparison" ? ["official_doc", "other"] : ["official_doc"],
  };
}
