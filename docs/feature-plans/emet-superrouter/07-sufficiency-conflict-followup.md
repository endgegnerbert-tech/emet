# Phase 7: Sufficiency, Conflict, and Follow-up Models

## Goal

Replace brittle one-shot decisions with calibrated evidence-aware decisions over family + overlay aware evidence state.

Routing context for all three models:

```text
query understanding outputs
domain family
overlays
source-policy flags
manual hint / forced override marker
```

## Sufficiency model

### Question

```text
Can emet answer safely with current evidence?
```

### Labels

```text
sufficient
need_more_sources
need_authority
need_primary_source
need_recency
need_version_context
need_conflict_resolution
```

### Best model

Start with structured features + logistic regression/SVC/MLP. No TRM yet.

## Conflict model

### Question

```text
Do sources disagree, and can the disagreement be resolved?
```

### Labels

```text
no_conflict
needs_review
resolved_by_authority
resolved_by_recency
resolved_by_version
open_conflict
```

### Best model

Structured features first. Add claim-pair model later if needed.

## Follow-up model

### Question

```text
What missing evidence should the next search target?
```

### Labels

```text
stop
need_more_sources
need_authority
need_primary_source
need_recency
need_version_context
need_conflict_resolution
ask_clarifying_question
```

Best-practice note: keep this action space evidence-oriented. Do not explode it into topic labels. If the next search needs a different retrieval policy, encode that as family/overlay updates in the trace first, then let Phase 8 policy decide whether to switch family or add overlays.

## Training data

Only true emet labels should drive these models:

```text
reviewed emet traces
Pi/LLM-reviewed uncertain traces
human-reviewed high-risk traces
synthetic edge cases for tests only
```

External datasets can provide features, not final labels.

## Acceptance criteria

- Better than current heuristics on held-out emet traces.
- Abstains when confidence is low.
- High-risk queries require stronger evidence thresholds.
- Family/overlay-aware features beat flat-domain-only baselines before promotion.
