# Phase 8: Research Policy Baseline

## Goal

Unify sufficiency/follow-up/conflict into one next-action policy.

## Policy question

```text
Given the current research state, what is the next best action?
```

## Action labels

```text
stop
fetch_more
fetch_authority
fetch_primary_source
fetch_recent
fetch_version_context
resolve_conflict
switch_family
add_overlay
tighten_source_policy
ask_clarifying_question
```

## Input state

```text
query understanding features
domain family
overlays
source-policy flags
turn index
previous actions
source count
authority count
primary source count
recent source count
distinct domain count
quality stats
conflict score
version match score
recency requirement
high-risk guardrail flags
```

## Best baseline models

Best-practice guardrail: keep the action space small and composable. Prefer `switch_family`, `add_overlay`, and `tighten_source_policy` over inventing many flat topic-specific actions.

Train in this order:

1. Rule baseline.
2. Logistic regression/SVC over structured features.
3. Small MLP over structured features + query embedding.
4. Sequence-aware baseline using last N actions.

## Why baseline first

TRM/HRM is only useful if recursive reasoning beats simple baselines. If a small MLP performs equally well, use the simpler model.

## Acceptance criteria

- Lower premature-stop rate.
- Lower unnecessary-fetch rate.
- No high-risk downgrade.
- Better action accuracy/F1 than separate heuristic routers.
- Policy changes retrieval through family/overlay/source-policy controls, not by reintroducing flat pack sprawl.
