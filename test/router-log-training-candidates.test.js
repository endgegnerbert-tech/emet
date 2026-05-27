import test from "node:test";
import assert from "node:assert/strict";

import {
  assessSessionForTraining,
  buildCandidateSets,
  buildQueryCounts,
  parseResearchSessionsFromLogEvents,
  prelabelRows,
} from "../scripts/router/build-log-training-candidates.mjs";

test("parseResearchSessionsFromLogEvents keeps first-turn pages before followup", () => {
  const events = [
    { ts: "1", pid: 1, cwd: "/work/app", type: "research_start", data: { query: "React 19 migration", mode: "deep" } },
    { ts: "2", pid: 1, cwd: "/work/app", type: "page_fetch_results", data: { query: "React 19 migration", pages: [{ title: "Docs", url: "https://react.dev/blog", sourceType: "official_doc" }] } },
    { ts: "3", pid: 1, cwd: "/work/app", type: "pipeline_stage", data: { query: "React 19 migration", stage: "followup" } },
    { ts: "4", pid: 1, cwd: "/work/app", type: "page_fetch_results", data: { query: "React 19 migration", pages: [{ title: "Followup", url: "https://react.dev/followup", sourceType: "official_doc" }] } },
    { ts: "5", pid: 1, cwd: "/work/app", type: "research_end", data: { query: "React 19 migration", ok: true, sufficient: false, conflictDetected: false, sources: [{ title: "Docs", url: "https://react.dev/blog", sourceType: "official_doc" }], meta: { versionContext: { versionSensitive: true }, versionCoverage: { exactMatchSources: 0 } }, followupRounds: 1 } },
  ];

  const sessions = parseResearchSessionsFromLogEvents(events);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].firstTurnPages.length, 1);
  assert.equal(sessions[0].firstTurnPages[0].title, "Docs");
});

test("assessSessionForTraining rejects fixtures, fake sources, cache hits, and internal test cwd", () => {
  const base = {
    cwd: "/Users/me/project",
    query: "real production query",
    result: { ok: true, sources: [{ url: "https://docs.github.com", title: "GitHub", sourceType: "official_doc" }] },
    firstTurnPages: [],
  };
  const counts = buildQueryCounts([base]);

  assert.equal(assessSessionForTraining(base, counts).keep, true);
  assert.equal(assessSessionForTraining({ ...base, result: { ...base.result, cacheHit: true } }, counts).reason, "cache_hit");
  assert.equal(assessSessionForTraining({ ...base, query: "cache probe unique" }, counts).reason, "known_fixture_query");
  assert.equal(assessSessionForTraining({ ...base, cwd: "/Users/me/github/emet" }, counts).reason, "internal_test_cwd");
  assert.equal(assessSessionForTraining({ ...base, result: { ok: true, sources: [{ url: "https://example.com/docs" }] } }, counts).reason, "fake_source_domain");
});

test("buildCandidateSets creates review-required candidates without gold labels", () => {
  const sessions = [{
    pid: 7,
    ts: "2026-01-01T00:00:00.000Z",
    cwd: "/work/app",
    query: "React 19 migration guide",
    mode: "deep",
    firstTurnPages: [{ title: "React Docs", url: "https://react.dev/blog/2024/04/25/react-19", sourceType: "official_doc", publishDate: "2024-04-25" }],
    result: {
      ok: true,
      sufficient: false,
      conflictDetected: false,
      authoritativeSourcesFound: true,
      followupRounds: 1,
      followupQuery: "React 19 migration guide changelog",
      sources: [
        { title: "React 19", url: "https://react.dev/blog/2024/04/25/react-19", sourceType: "official_doc", snippet: "React 19 migration notes" },
        { title: "Upgrade", url: "https://react.dev/blog/2024/04/25/react-19-upgrade-guide", sourceType: "official_doc", snippet: "Upgrade guide" },
      ],
    },
  }];

  const sets = buildCandidateSets(sessions);
  assert.equal(sets.report.keptSessions, 1);
  assert.equal(sets.domainDraft.length, 1);
  assert.equal(sets.sufficiencyDraft.length, 1);
  assert.equal(sets.conflictDraft.length, 1);
  assert.equal(sets.followupDraft.length, 1);
  assert.equal(sets.domainDraft[0].reviewSource, "candidate_heuristic");
  assert.equal(sets.sufficiencyDraft[0].meta.labelSource, "pipeline_candidate");
  assert.equal(sets.conflictDraft[0].meta.labelSource, "candidate_only");
});

test("prelabelRows marks generated labels as prelabels only", () => {
  const rows = [{ query: "latest package status", candidateLabel: "insufficient", inputText: "Query: latest package status\n\nSources:\n[blog] old post", meta: { sourceCount: 1 } }];
  const labeled = prelabelRows("sufficiency", rows);
  assert.equal(labeled.length, 1);
  assert.equal(labeled[0].reviewSource, "ai_prelabel");
  assert.equal(labeled[0].label, "need_authority");
});
