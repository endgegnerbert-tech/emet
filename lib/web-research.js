// web-research.js — thin re-export facade.
// All implementation moved to lib/research/*.js modules.
// Layer: workbench/facade — re-exports for backward compat.

// Config
export { resolveResearchConfig, getResearchConfig, resolveResearchModel } from "./research/config.js";

// Queries
export { buildQueries } from "./research/queries.js";

// Search
export { searchDuckDuckGo } from "./research/search.js";

// Fetch
export { fetchPageSource } from "./research/fetch.js";

// Synthesis
export { synthesizeResearch, webFetch } from "./research/synthesis.js";

// Pipeline
export { runWebResearch } from "./research/pipeline.js";

// Backward compat re-exports
export { compactResearchPayload } from "./research.js";
export { clearResearchMemory } from "./research-memory.js";
export { collectorSessions } from "./research-session.js";
export { shouldRunCollectorInteractive, runCollectorInteractive } from "./retrieval/community.js";
