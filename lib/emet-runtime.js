import { hashResearchQuery, shouldSkipResearch, setResearchMemory } from "./research-memory.js";
import { compactResearchPayload, classifyQueryIntent, inferOfficialDocsSite } from "./research.js";

function formatRawPages(pageTexts) {
  if (!Array.isArray(pageTexts) || pageTexts.length === 0) return [];
  return pageTexts.slice(0, 3).flatMap((page, index) => {
    const lines = [
      `## Raw page ${index + 1}`,
      `URL: ${page.url || ""}`,
      `Title: ${page.title || ""}`,
      "",
      String(page.text || "").trim(),
    ];
    return [lines.join("\n"), ""];
  });
}

export class EmetRuntime {
  constructor() {
    this.researchState = new Map();
    this.latestResearch = null;
  }

  hashQuery(query) {
    return hashResearchQuery(query);
  }

  getState(queryHash) {
    if (!this.researchState.has(queryHash)) {
      this.researchState.set(queryHash, {
        count: 0,
        lastHash: null,
        lastSufficient: false,
        fastRecoveryAllowed: false,
      });
    }
    return this.researchState.get(queryHash);
  }

  clear() {
    this.researchState.clear();
    this.latestResearch = null;
  }

  buildFastRecoveryQuery(query) {
    const docsSite = inferOfficialDocsSite(query || "");
    return docsSite ? `site:${docsSite} ${query}` : `${query} official docs`;
  }

  /**
   * Pre-execution hook for pi-agent and MCP to handle skipping and fast recovery
   */
  interceptCall(input) {
    const query = input.query || "";
    const queryHash = this.hashQuery(query);
    const state = this.getState(queryHash);
    
    const isolate = Boolean(input.isolate || process.env.RESEARCH_ISOLATE === "1");
    const force = Boolean(input.force);
    const mode = input.mode;

    if (shouldSkipResearch({ queryHash, lastHash: state.lastHash, lastWasSufficient: state.lastSufficient, force, isolate })) {
      return {
        skip: true,
        reason: "Recent emet result was already sufficient for this exact query.",
        message: "This query was already answered sufficiently. Review previous context.",
        state
      };
    }

    if (mode === "fast" && state.count === 1 && state.fastRecoveryAllowed && !force && !isolate) {
      input.query = this.buildFastRecoveryQuery(query);
      state.fastRecoveryAllowed = false;
    }

    state.count += 1;
    state.lastHash = queryHash;
    
    return { skip: false, state, modifiedInput: input };
  }

  /**
   * Post-execution hook to update the state from the returned payload
   */
  interceptResult(input, payload) {
    if (!payload?.ok) return;
    
    const query = input?.query || "";
    const queryHash = this.hashQuery(query);
    const state = this.getState(queryHash);
    
    state.lastHash = queryHash;
    state.lastSufficient = Boolean(payload.sufficient);
    
    state.fastRecoveryAllowed = !payload.sufficient
      && !payload.authoritativeSourcesFound
      && ["best_practice", "temporal", "definition"].includes(classifyQueryIntent(query));
      
    this.latestResearch = {
      query,
      queryHash,
      createdAt: new Date().toISOString(),
      payload,
    };

    setResearchMemory(`last:${queryHash}`, payload);
  }

  getLatestResearch() {
    return this.latestResearch;
  }

  /**
   * Formats the tool result into a compacted context-friendly representation
   */
  formatResponse(payload) {
    if (!payload?.ok || payload.action !== "final") {
      return {
        text: JSON.stringify(payload, null, 2),
        structuredContent: payload
      };
    }

    if (payload.format === "json") {
      return {
        text: payload.contentText && String(payload.contentText).trim().startsWith("{")
          ? payload.contentText
          : JSON.stringify(payload, null, 2),
        structuredContent: payload,
      };
    }

    const compact = compactResearchPayload(payload);
    const citationLines = Array.isArray(compact.citations)
      ? compact.citations.map((citation, index) => `${index + 1}. ${citation.text} [source ${citation.sourceIndex}]`)
      : [];
    const rawPageBlocks = formatRawPages(payload.pageTexts);

    const text = [
      payload.contentText,
      "",
      "## Citations",
      "",
      ...(citationLines.length ? citationLines : ["None"]),
      "",
      "## Status",
      "",
      `sufficient: ${compact.sufficient}`,
      `authoritativeSourcesFound: ${compact.authoritativeSourcesFound}`,
      ...(compact.conflictSummary ? [`conflictSummary: ${compact.conflictSummary}`] : []),
      ...(rawPageBlocks.length ? ["", ...rawPageBlocks] : []),
    ].join("\n");

    return {
      text,
      structuredContent: payload.pageTexts ? { ...compact, pageTexts: payload.pageTexts } : compact,
    };
  }
}
