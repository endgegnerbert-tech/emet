// Re-export barrel — split into research/{heuristics,ranking,coverage}.js
// Layer: base → all exports come from platform/base modules.
// Legacy consumers can keep importing from "../research.js" unchanged.

// From heuristics.js
export {
  parseStructuredSources,
  structuredSourceFromPage,
  structuredSourcesFromPages,
  extractQueryAspectFlags,
  normalizeUrl,
  hostnameFromUrl,
  isDocsLike,
  isSecondaryDocsHost,
  isLikelyOfficialDocsHost,
  isNewsSourceUrl,
  classifySourceType,
  isAuthoritativeUrl,
  queryTerms,
  queryBase,
  normalizePaperTitle,
  normalizeResearchFreshness,
  summarizeFreshness,
  classifyQueryIntent,
  defaultMode,
  inferOfficialDocsSite,
  buildFastQueries,
  buildDeepQueries,
  parseDeepQueryPlan,
  buildJinaReaderUrl,
  buildFallbackQueries,
  extractDuckDuckGoResults,
  extractDuckDuckGoLiteResults,
  extractJinaSearchResults,
  extractPublishDate,
  extractLastModified,
  selectRelevantChunks,
  extractCodeBlocks,
  compactResearchPayload,
  formatResearchResponse,
  sourceMetaFromSources,
  isAuthoritativeResearchSource,
  buildWebResearchGuidance,
} from "./research/heuristics.js";

// From ranking.js
export {
  scoreSearchResult,
  rankAndDeduplicateResults,
  rankSearchResults,
  scoreFetchedPage,
  rankFetchedPages,
  scoreSourceEntry,
  prioritizeSourceEntries,
} from "./research/ranking.js";

// From coverage.js
export {
  detectClaimConflicts,
  detectCoverageGaps,
  detectConflictSignals,
  detectResearchGaps,
  buildFollowUpQuery,
  buildActionBasedFollowUpQuery,
  factCheckAnswer,
  buildConfidenceSummary,
  evaluateSufficiency,
} from "./research/coverage.js";

// extractPageSnapshot — adapter layer (imports article-extractor)
export { extractPageSnapshot } from "./research/extraction.js";
