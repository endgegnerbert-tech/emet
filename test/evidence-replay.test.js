import test from "node:test";
import assert from "node:assert/strict";

import { extractEvidenceStatesFromResult, summarizeEvidenceStates } from "../scripts/router/replay-evidence-trace.mjs";

test("extractEvidenceStatesFromResult replays turn and final evidence states", () => {
  const states = extractEvidenceStatesFromResult({
    query: "Shopify API",
    runtimeTrace: {
      config: {
        domainFamily: "developer-docs",
        overlays: ["shopify", "official-only"],
        sourcePolicy: { family: "developer-docs", overlays: ["shopify", "official-only"] },
      },
      turns: [{
        turn: 1,
        mergedPages: [{
          title: "Shopify Docs",
          url: "https://shopify.dev/docs/api",
          text: "Shopify API docs",
          sourceType: "official_doc",
          authoritative: true,
        }],
        stopReason: "sufficient",
      }],
      final: {
        mergedPages: [{
          title: "Shopify Docs",
          url: "https://shopify.dev/docs/api",
          text: "Shopify API docs",
          sourceType: "official_doc",
          authoritative: true,
        }],
      },
    },
  });

  assert.equal(states.length, 2);
  assert.equal(states[0].domain_family, "developer-docs");
  assert.ok(states[0].edges.some((edge) => edge.type === "source_matches_overlay"));
  assert.equal(summarizeEvidenceStates(states)[0].source_count, 1);
});
