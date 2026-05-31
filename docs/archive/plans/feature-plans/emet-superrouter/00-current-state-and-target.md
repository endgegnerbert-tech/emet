# Phase 0: Current State and Target Architecture

## Current architecture

Current emet has three user-visible decisions and one extra internal one:

```text
Query
  -> deterministic rules
  -> Domain Router
  -> search/fetch/rank
  -> evidence features
  -> Conflict Router
  -> Sufficiency Router
  -> Follow-up Router
  -> answer or fetch more
```

Current routers:

| Router | Current job | Current weakness |
|---|---|---|
| Domain | pick broad source pack | many queries collapse to `web` |
| Sufficiency | decide if evidence is enough | label imbalance, weak minority classes |
| Conflict | detect/resolve source disagreement | too few real conflict examples |
| Follow-up | stop or fetch more/better sources | weak gold data, too heuristic-heavy |

## Target architecture

```text
User query
  -> Safety guardrails
  -> Query Understanding model
  -> Expanded Domain Pack Router
  -> Retrieval planner
  -> Retrieval/page adapter/cache
  -> Evidence graph
  -> Research Policy model
  -> optional TRM recursive policy refinement
  -> Answer composer
  -> Trace logger and active learning
```

## Best-practice decision

Keep the system hybrid:

- Rules for safety and obvious high-risk routing.
- Small models for cheap classification.
- Evidence-state models for source-aware decisions.
- TRM/HRM only for multi-step policy reasoning.
- LLM reviewer only for uncertain/offline labels, not every runtime decision.

## Phase 0 implementation status

Completed in code as the baseline architecture inventory and traceable runtime boundary:

- Current hybrid runtime remains intact: deterministic intent/domain rules, optional tiny-router classifiers, retrieval, evidence scoring, conflict, sufficiency, follow-up, synthesis.
- Target seam is explicit: guardrails run before learned routing; runtime traces now carry the decision boundary needed by later phases.
- No TRM/HRM or policy replacement is introduced in this phase.

## Expected gains

| Area | Gain |
|---|---|
| Domain routing | fewer wrong source packs, less generic `web` fallback |
| Source quality | more official/primary sources, less blogspam |
| Recency/version | fewer stale answers |
| Sufficiency | fewer premature answers and less over-fetching |
| Conflict handling | clearer disagreement detection and resolution |
| Cost/latency | stop earlier when evidence is genuinely enough |
