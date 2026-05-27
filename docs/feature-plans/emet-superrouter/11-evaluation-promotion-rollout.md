# Phase 11: Evaluation, Promotion, and Rollout Gates

## Goal

Prevent clever models from making emet worse.

## Required eval sets

```text
domain gold holdout
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
| Domain Router | macro-F1 | high-risk downgrades = 0 |
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
```

## Rollout order

```text
shadow mode
feature flag for internal runs
low-risk domains only
all domains with guardrail veto
production default
```

## Rollback

Every model must have:

```text
env flag disable
rules fallback
previous model artifact
metrics comparison report
```
