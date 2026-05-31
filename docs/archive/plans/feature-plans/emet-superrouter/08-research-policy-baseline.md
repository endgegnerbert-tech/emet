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

## Implementation notes

Phase 8 is implemented as a conservative unified rule baseline in `lib/research-next-action-policy.js`:

- one canonical action set chooses `stop`, targeted fetches, conflict resolution, clarifying questions, or composable routing controls;
- the policy state is built from evidence state plus query-understanding, family, overlays, source-policy flags, previous actions, quality, conflict, version, recency, and high-risk signals;
- runtime research now records `turn.policy` and applies next-turn family/overlay/source-policy controls through `activeConfig` before planning follow-up retrieval;
- legacy sufficiency/conflict/follow-up routers remain visible in trace as inputs/shadow signals, but policy stop/fetch decisions are centralized;
- high-risk contexts cannot stop unless stricter confidence and authority requirements are met.

Best-practice basis from current RAG/evidence-verification and ML-baseline guidance: gate answering on set-level evidence sufficiency; abstain or fetch when evidence is insufficient, conflicting, stale, or version-mismatched; keep small explicit action spaces; and compare simple rule/classical baselines before promoting MLP or recursive policies.
