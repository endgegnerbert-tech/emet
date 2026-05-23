# pi-research QA report

## Scope
- Core runtime wiring
- Domain packs: github, security, papers, specs, changelog, forums, package-registry, vendor-status
- Output modes: markdown, json, table
- `requireAuthoritative` behavior
- Community pack starter example

## Smoke results
- `github`: good domain routing, strong sources, conflict summary visible
- `security`: routes correctly; sources are still mostly generic official advisory pages, not a true CVE API integration
- `papers`: strongest pack; finds real paper sources and returns authoritative results
- `specs`: good RFC/datatracker bias
- `changelog`: routes correctly; still mostly general release-note sources
- `forums`: routing works; source quality is still weak and often falls back to generic blog/forum-adjacent pages
- `package-registry`: routes correctly; registry bias works, but results can still drift to secondary docs
- `vendor-status`: routes correctly; source quality remains the weakest and often misses real status-page feeds

## Critical findings
1. `format` was previously a no-op; now fixed.
2. `requireAuthoritative` was previously only partial; now it affects sufficiency.
3. Domain packs were previously hints only; now they affect routing and source controls.
4. `security`, `forums`, `package-registry`, and `vendor-status` still lack deep native provider integrations.
5. `vendor-status` remains the weakest pack for real-world outage/status lookup.

## Regression risk
- Routing heuristics are better, but still heuristic-based and can misclassify short vague queries.
- Conflict detection can still be noisy on broad or contradictory searches.

## Recommendation
- **Mergeable, but conservative.**
- Acceptable for main if the goal is a stronger research runtime with documented extension points.
- Not “done done” for domains that need real APIs; those should be next-stage follow-up work.

## Follow-up candidates
- native status-page providers
- native CVE/advisory providers
- stronger forum source adapters
- tighter conflict filtering for broad queries
- richer template validation for community packs
