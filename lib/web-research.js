// web-research.js — thin re-export facade.
// All implementation moved to lib/research/*.js modules.
// Layer: workbench/facade — documented public re-exports only.

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

export { compactResearchPayload } from "./research.js";
export { clearResearchMemory } from "./research-memory.js";
