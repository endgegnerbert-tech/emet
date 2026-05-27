# emet Superrouter Feature Plans

Goal: evolve emet from a generic web-search helper into an evidence-routing engine.

Core idea:

```text
safety rules
+ query understanding
+ expanded domain packs
+ source authority scoring
+ evidence graph
+ research policy
+ active learning
+ optional TRM/HRM recursive policy
```

Use these files in order. Each phase is intentionally small enough to build, test, and roll back independently.

## Phases

0. [Current state and target architecture](./00-current-state-and-target.md)
1. [Safety foundations and non-negotiable guardrails](./01-safety-foundations.md)
2. [Data governance, schemas, and labels](./02-data-governance-labels.md)
3. [Query Understanding model](./03-query-understanding-model.md)
4. [Expanded Domain Pack Router](./04-expanded-domain-router.md)
5. [Source Authority and Page Quality models](./05-source-authority-page-quality.md)
6. [Evidence Graph and claim state](./06-evidence-graph.md)
7. [Sufficiency, Conflict, and Follow-up models](./07-sufficiency-conflict-followup.md)
8. [Research Policy baseline](./08-research-policy-baseline.md)
9. [TRM/HRM recursive policy experiment](./09-trm-hrm-policy-experiment.md)
10. [Active Learning and review loop](./10-active-learning-review-loop.md)
11. [Evaluation, promotion, and rollout gates](./11-evaluation-promotion-rollout.md)
12. [Implementation roadmap](./12-implementation-roadmap.md)

## Rule of thumb

Do not replace a simple rule or calibrated classifier with TRM/HRM unless the recursive policy beats the simpler baseline on held-out emet traces and preserves zero high-risk downgrades.
