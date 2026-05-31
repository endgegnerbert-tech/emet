# Phase 11: Evaluation, Promotion, and Rollout Gates

## Goal

Prevent clever models from making emet worse.

## Required eval sets

```text
family + overlay aware domain holdout
query-understanding holdout
source-authority holdout
sufficiency holdout
conflict holdout
follow-up/action holdout
end-to-end research eval cases
high-risk regression suite
```

## Metrics

| Model | Primary metric | Safety metric |
|---|---|---|
| Query Understanding | macro-F1 / calibration | abstain on low confidence |
| Domain Router | family macro-F1 + overlay F1 / calibration | high-risk downgrades = 0 |
| Source Authority | precision on authoritative | no primary-source false discard |
| Page Quality | blocked/thin detection | no official-doc loss |
| Sufficiency | action macro-F1 | premature-stop rate down |
| Conflict | conflict recall | open conflicts not hidden |
| Research Policy/TRM | next-action F1 + cost/quality | high-risk downgrade = 0 |

## Promotion rules

A model can promote only if:

```text
held-out eval improves
calibration is acceptable
high-risk downgrades are zero
runtime latency budget holds
rollback flag exists
trace explains decision
family/overlay outputs remain backwards-compatible with legacy flat aliases
```

## Rollout order

```text
shadow mode
feature flag for internal runs
low-risk families only
all families with guardrail veto
production default
```

## Rollback

Every model must have:

```text
env flag disable
rules fallback
previous model artifact
metrics comparison report
family/overlay alias compatibility path
```

## Implementation

Run the Phase 11 gate audit before promoting any router model:

```bash
node scripts/router/audit-promotion-gates.mjs
```

The audit writes `metrics/router/promotion-gates.json` and fails closed when any required eval set, held-out metric, safety metric, latency report, rollback flag, rules fallback, or model artifact is missing.

## Acceptance criteria

- Required holdout/eval sets are present and non-empty.
- Promotion metrics improve or pass the existing task-specific promotion gate.
- High-risk downgrades and high-risk false-sufficient counts are zero.
- Source-authority and page-quality safety rows prove no authoritative/official-source loss.
- p95 latency is within budget.
- Rollback flags, rules fallback, and model artifacts are present before rollout.
