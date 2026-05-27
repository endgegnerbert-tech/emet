# Phase 6: Evidence Graph and Claim State

## Goal

Represent the research state explicitly so later models reason over evidence, not just query text.

## Evidence graph nodes

```text
query
source
claim
version
publisher/domain
action/turn
```

## Evidence graph edges

```text
source_supports_claim
source_contradicts_claim
source_mentions_version
source_is_primary_for_domain
source_is_recent_for_query
claim_requires_more_evidence
```

## Per-source fields

```json
{
  "url": "...",
  "host": "...",
  "source_type": "official_doc|paper|github_repo|news|forum|other",
  "authority_score": 0.0,
  "quality_score": 0.0,
  "freshness": "today|this_week|this_year|older|unknown",
  "version_match_score": 0.0,
  "claims": [],
  "text_hash": "..."
}
```

## Best-practice decision

Do not ask policy models to infer evidence quality from raw text every time. Precompute structured evidence state.

## Acceptance criteria

- Every research turn has a serializable evidence state.
- Sufficiency/conflict/follow-up models use this state.
- Trace logs can recreate why emet fetched more or stopped.
