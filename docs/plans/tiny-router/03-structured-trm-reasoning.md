# 03 — Structured TRM Reasoning

## Core correction

TRM is not a better generic MLP. TRM is useful when the task has an internal state that can improve over recursive steps.

So we do not feed TRM raw text and ask for a boolean. We feed TRM a structured evidence state and let it refine the decision.

## Good TRM targets in pi-research

### Target 1: conflict resolution

Current code:

```js
// lib/research.js
detectConflictSignals(pages)
```

Current behavior:

- Regex detects positive/negative wording across pages.
- Fails on version/context/authority/date nuance.

TRM reformulation:

```text
Given source A, source B, and relation features,
iteratively converge on:
  no_conflict
  open_conflict
  resolved_by_authority
  resolved_by_recency
  needs_review
```

Why recursive:

1. Surface contradiction?
2. Same version/context?
3. Same claim/aspect?
4. Which source has authority?
5. Is recency relevant?
6. Final state: resolved/open/review.

### Target 2: sufficiency / coverage

Current code:

```js
// lib/research.js
evaluateSufficiency(input)
```

Current behavior:

- Source count + authoritative count + domain count + conflict penalty.

TRM reformulation:

```text
Given query aspects × sources,
iteratively converge on:
  sufficient
  insufficient_need_authority
  insufficient_need_version
  insufficient_need_conflict_resolution
  insufficient_need_more_sources
```

Why recursive:

- Sufficiency is not source count.
- It is coverage of critical aspects under authority/freshness constraints.

### Target 3: follow-up action selection

Current code:

```js
// lib/research.js
buildFollowUpQuery()
// lib/web-research.js
planSubqueries()
```

TRM should not generate text. It can choose an action:

```text
need_authority
need_conflict_resolution
need_recency
need_version_context
need_primary_source
need_more_sources
stop
```

Then deterministic templates generate the query.

### Target 4: claim/source verification

Current code:

```js
// lib/research.js
factCheckAnswer(answer, sources)
```

Current behavior:

- Term overlap.

TRM reformulation:

```text
claim × source evidence grid
-> supported / unsupported / contradicted / needs_source
```

This is a later target, after conflict/sufficiency.

### Target 5: chunk coverage selection

Current code:

```js
// lib/research.js
selectRelevantChunks(text, query, limit)
```

Current behavior:

- top-k term overlap.

TRM reformulation:

```text
query aspects × chunks
-> choose compact set covering all aspects
```

Later target only, because labels are harder.

## Structured input design

### Common source feature vector

For each source:

```text
source_type_id
source_score
authoritative_bool
freshness_bucket
host_match_score
query_overlap
text_embedding
snippet_embedding
publish_age_bucket
blocked_or_weak_bool
```

### Conflict pair grid

For a pair of sources A/B:

```text
row 1: source A features
row 2: source B features
row 3: relation features
row 4: claim/aspect similarity features
```

Relation features:

```text
same_host
same_domain
same_source_type
version_match
version_gap
publish_date_gap
query_aspect_overlap
authority_delta
recency_delta
positive_signal_A
negative_signal_A
positive_signal_B
negative_signal_B
```

Text input:

- Use Model2Vec embeddings first for low memory.
- Optional MiniLM embeddings only if Model2Vec cannot represent pair semantics.

Output labels:

```text
no_conflict
open_conflict
resolved_by_authority
resolved_by_recency
needs_review
```

V1 runtime safety:

- TRM may escalate to conflict/review.
- TRM may not clear a heuristic conflict by itself until gold eval is strong.

### Sufficiency coverage grid

Rows:

```text
query aspect 1
query aspect 2
query aspect 3
source A
source B
source C
coverage relations
```

Columns/features:

```text
aspect_embedding
source_embedding
aspect_source_similarity
authority
freshness
source_type
query_overlap
conflict_state
```

How to get query aspects without LLM:

V1 deterministic aspect extraction:

- important nouns/terms from query
- comparison sides if query contains `vs|versus|compared to`
- temporal marker if query asks current/latest/status
- domain-required aspect:
  - security → advisory/vendor/CVE
  - package-registry → version/release/registry
  - papers → paper/source/benchmark
  - github → repo/issue/release/readme

Output labels:

```text
sufficient
need_authority
need_more_sources
need_recency
need_version_context
need_conflict_resolution
```

V1 runtime safety:

- TRM can block premature `sufficient: true`.
- TRM cannot be the only reason to skip fetches unless false-sufficient rate is proven very low.

## TRM architecture adaptation

Do not start from full official config.

Start:

```text
hidden_size=128
seq_len=64
L_layers=1
H_cycles=2
L_cycles=3
batch_size=4
```

Input layer:

```text
structured numeric/token features
  + embedding vectors
  -> Linear(input_dim, hidden_size)
```

No free-text generation.

Heads:

```text
conflict_head: 5 classes
sufficiency_head: 6 classes
followup_action_head: 7 classes
```

## Offline-first rule

TRM is not integrated into runtime until all are true:

1. Structured feature builder exists.
2. Manual gold eval exists.
3. MLP/Model2Vec baselines exist.
4. TRM beats baseline on the structured task.
5. Latenz benchmark exists.
6. Safety thresholds are defined.

## Abbruchkriterien

Stop TRM experiment if:

- it does not beat Model2Vec/MLP on conflict or sufficiency gold eval,
- it needs more memory than the server budget,
- it only learns source-count/authority-count heuristics,
- it cannot improve false-positive conflict or false-sufficient cases.
