# Phase 12: Implementation Roadmap

## Principle

Build in small slices. Every slice must be testable, measurable, and reversible.

## Slice 1: schemas and docs

- Finalize canonical training row schema.
- Add trace schema.
- Add dataset manifest.
- Add audit checks for review provenance.

## Slice 2: stronger domain router

- Merge safe reviewed domain rows.
- Add 5-10 new domain packs only where source policy changes.
- Train calibrated Model2Vec + SVC/LR.
- Promote only if high-risk downgrade = 0.

## Slice 3: query-understanding model

- Train on NQ/ASQA/DL-HARD auxiliary examples.
- Add predictions to trace and planner as non-veto features.
- Evaluate against hand-labeled emet queries.

## Slice 4: source authority + page quality

- Convert existing authority rules into weak labels.
- Review uncertain source examples.
- Add source score trace output.
- Use for ranking first, not hard rejection.

## Slice 5: evidence graph

- Serialize source/claim/version/evidence state per turn.
- Use the same state for sufficiency/conflict/follow-up.
- Add replay script for traces.

## Slice 6: sufficiency/conflict/follow-up models

- Label more real emet traces.
- Train structured-feature baselines.
- Keep heuristics as fallback.
- Promote only when safer than rules.

## Slice 7: unified research policy baseline

- Train next-action model over evidence states.
- Compare with separate routers.
- Shadow mode first.

## Slice 8: TRM policy experiment

- Implement TRM only for next-action policy.
- Train on reviewed multi-turn traces.
- Compare against MLP baseline.
- Do not promote unless it clearly wins.

## Slice 9: active-learning loop

- Queue uncertain traces.
- Pi/LLM review high-volume cases.
- Human review high-risk/disagreement cases.
- Audit before every train run.

## Slice 10: production hardening

- Add dashboards/reports.
- Add rollback flags.
- Add eval gate to release process.
- Document model cards for every promoted model.

## Final target

```text
emet = evidence-routing engine

rules protect safety
models understand queries and sources
policy decides next actions
TRM optionally refines multi-step decisions
logs keep improving the system
```
