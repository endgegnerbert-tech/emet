# emet retrieval policy

## Purpose
This document freezes the retrieval policy so authority, weak-page handling, and follow-up behavior do not drift into ad-hoc heuristics.

## Authority policy

### High-risk domains
These domains require domain-appropriate authoritative evidence before a result can be considered sufficient:
- `security`
- `vendor-status`
- `package-registry`
- `github`
- `papers`

### Domain matrix
- `security`
  - primary: vendor advisories, NVD/NIST, CISA, MITRE, official project security pages
  - secondary: blogs, mirrors, forums
- `vendor-status`
  - primary: official status pages, vendor incident posts, trust centers
  - secondary: aggregators, social posts
- `package-registry`
  - primary: package registries, maintainer docs, canonical repo README/releases
  - secondary: blog posts, issue mirrors
- `github`
  - primary: canonical repo, README/docs, releases
  - secondary: issues, PRs, discussions unless the question is explicitly about issue state
- `papers`
  - primary: arXiv, DOI, publisher pages, Semantic Scholar, institutional pages
  - secondary: summaries, mirrors, readable ResearchGate pages
  - never primary: blocked or placeholder ResearchGate access walls
- `web`
  - primary: official docs, vendor research portals, official references
  - secondary: generic blogs/news/forums

### Vendor research hosts
Hosts such as `research.ibm.com` and `research.google` must rank above generic `other` pages for relevant technical topics.

## Weak/blocked page policy

### Hard-blocked
A page is blocked if any of these hold:
- HTTP `403` or `429`
- anti-bot / access-wall markers with extracted text `< 1200` chars
- placeholders such as `Cloudflare`, `Access denied`, `Temporarily Unavailable`, `Verify you are human`

### Weak-page thresholds
- `weak_text`: extracted text `< 400` chars and intrinsically weak
- `thin_text`: extracted text `400-1199` chars
- `query_overlap_low`: fewer than `2` meaningful query-term matches in title + first chunk
- a page is not demoted on thin text alone; at least `2` independent negative signals are required unless it is hard-blocked or falls into `weak_text`

### Cache policy
- blocked placeholders must not be cached as normal successful pages
- unsupported content types may attempt a fallback path first
- if fallback still fails, the page remains unreadable and should not pollute final evidence

## Follow-up policy
- follow-up queries must be search-oriented, not question-oriented
- no `Which authoritative source...` phrasing
- preserve root topic/entity terms
- if a follow-up query returns zero results, reformulate once
- if the reformulation also returns zero, stop looping and surface the gap

## Eval policy
Phase 1 evals are deterministic.

Required checks:
- no question-style follow-ups
- lower-bound token overlap with the root query
- authority expectations per domain
- blocked-page contamination absent from final sources when alternatives exist
- turn / empty-follow-up budget respected

Note: token overlap is a lower-bound heuristic for continuity, not proof of semantic quality.

## Explicit technical debt
- full PDF/publisher ingestion is not solved in this phase
- targeted fallback is allowed, but `papers` recall may still be limited for some document-only sources
