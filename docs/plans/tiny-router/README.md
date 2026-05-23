# Tiny Router / Structured TRM Plan

Status: implemented for domain routing plus conservative structured hooks; follow-up TRM work remains optional.

Goal: replace the slow BitNet/JSON local-planner idea with small local decision modules. Use the right model per decision:

- **Model2Vec + classifier** for one-shot routing.
- **Structured TRM** only where the problem can be represented as iterative evidence reasoning.
- Current heuristics remain fallback until measured replacement is safe.

## Master order

1. [Code map and insertion points](./00-code-map.md)
2. [Data, labels, and gold eval](./01-data-and-labels.md)
3. [Domain router: Model2Vec first](./02-domain-router-model2vec.md)
4. [Structured TRM for conflict, sufficiency, coverage](./03-structured-trm-reasoning.md)
5. [Training server runbook: 2 GB GPU / 20 GB RAM](./04-training-server-runbook.md)
6. [Runtime integration and feature flags](./05-runtime-integration.md)
7. [BitNet / JSON deprecation path](./06-bitnet-json-deprecation.md)
8. [Acceptance, stop, rollback criteria](./07-acceptance-stop-rollback.md)

## Core thesis

TRM should not be used as a generic classifier. Domain routing is not recursive. Conflict resolution, sufficiency, source coverage, and claim verification can become recursive if represented as structured evidence matrices.

## First ship target

Shipped first slice:

```text
Domain routing: calibrated Model2Vec + classifier
Fallback: current classifyQuestionDomain()
```

Structured conflict/sufficiency hooks are feature-flagged and conservative. TRM remains optional, not a blocker for the shipped domain router.
