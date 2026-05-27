# Phase 9: TRM/HRM Recursive Policy Experiment

## Goal

Test whether recursive reasoning improves emet's next-action policy.

## Recommendation

Start with TRM. Consider HRM only after TRM and baselines are measured.

```text
Use TRM for: research policy refinement
Do not use TRM for: simple domain routing, page quality, one-shot query type
```

## Why TRM first

- Simpler than HRM.
- Fewer parameters.
- Easier to debug.
- Better fit for limited trace data.

## Where TRM sits

```text
evidence state_0
  -> recursive refine
  -> evidence state_1
  -> recursive refine
  -> evidence state_2
  -> next action
```

## TRM input vector

```text
query embedding
query_understanding logits
domain one-hot
guardrail flags
source counts
authority/primary/recent counts
quality stats
conflict score
version score
turn index
previous action embedding
```

## TRM output

Same action space as policy baseline:

```text
stop
fetch_more
fetch_authority
fetch_primary_source
fetch_recent
fetch_version_context
resolve_conflict
switch_domain_pack
ask_clarifying_question
```

## HRM option

HRM may be useful when traces become long and hierarchical:

```text
high-level module: research strategy
low-level module: next retrieval/action decision
```

Do not start with HRM unless we have enough multi-turn trace labels.

## Training setup

1. Freeze query encoder or use static embeddings.
2. Train TRM on reviewed traces.
3. Compare against logistic/SVC/MLP baselines.
4. Calibrate confidence.
5. Deploy only as advisory behind feature flag.

## Acceptance criteria

- Beats MLP baseline on action macro-F1.
- Reduces premature stops and over-fetching.
- No high-risk downgrade.
- Provides an abstain/low-confidence path.
- Guardrails can veto all actions.
