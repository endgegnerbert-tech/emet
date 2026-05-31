# 07 — Acceptance, Stop, and Rollback Criteria

## Global acceptance

A slice is accepted only if:

1. It is feature-flagged or safely fallback-backed.
2. It has deterministic tests.
3. It has offline metrics.
4. It has latency numbers.
5. It does not worsen high-risk behavior.
6. `npm test` passes.

## Domain router acceptance

Accept Model2Vec domain router if:

- accuracy within 5 percentage points of heuristic or better,
- macro-F1 acceptable across domains,
- no systematic `security|papers|specs -> web` downgrade,
- p95 latency acceptable,
- fallback equals current `classifyQuestionDomain()` behavior.

Ship decision:

- If accepted, ship domain router and pause TRM for domain permanently.

## Sufficiency acceptance

Accept only conservative use if:

- false-sufficient count is zero or below explicitly approved threshold,
- high-risk domains require authority,
- model can veto premature sufficient decisions,
- model is not sole reason to skip fetching in V1.

Ship decision:

- V1 can use model to block/continue, not to skip aggressively.

## Conflict acceptance

Accept TRM conflict module only if:

- manual gold conflict set exists,
- missed-conflict count is lower than heuristic,
- false conflict rate improves or stays acceptable,
- model handles anti-heuristic cases:
  - version mismatch,
  - authority resolution,
  - recency resolution,
  - terminology-only differences.

Ship decision:

- V1 may escalate to `needs_review`.
- V1 may not clear heuristic conflicts unless explicitly approved after metrics.

## TRM experiment stop criteria

Stop TRM work if any are true:

- structured MLP matches or beats TRM,
- TRM does not beat baseline on gold eval within one day of server experimentation,
- TRM exceeds memory budget,
- TRM only learns source-count/authority heuristics,
- labels are too weak to evaluate honestly.

## Model2Vec stop criteria

Stop or revise if:

- domain performance is worse than heuristic by more than 5 percentage points,
- high-risk downgrade appears,
- model adds runtime complexity without speed/safety benefit.

## Rollback criteria

Disable tiny-router immediately if:

- false `sufficient: true` increases,
- conflicts are missed,
- security/spec/paper queries route to generic `web`,
- model load slows startup,
- memory exceeds server limit,
- any model error escapes fallback path.

## Final V1 definition

V1 is successful even if TRM never ships, as long as:

- domain routing becomes faster/simpler than BitNet,
- BitNet/JSON becomes optional legacy,
- structured TRM experiment gives clear evidence for or against conflict/sufficiency use.
