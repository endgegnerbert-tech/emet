# 02 — Domain Router with Model2Vec

## Why not TRM here

Domain routing is one query → one of 9 classes. There is no natural iterative solution path. TRM's recursive advantage does not apply.

Use Model2Vec + a simple classifier.

## Target code path

Current:

```js
// lib/web-research.js
async function resolveQuestionDomain(query, signal) {
  const fallback = classifyQuestionDomain(query);
  try {
    return await classifyDomainWithLocalSlm(query, signal) || fallback;
  } catch {
    return fallback;
  }
}
```

Future:

```text
Tiny domain router high confidence
  -> current classifyQuestionDomain fallback
  -> optional legacy local SLM only if explicitly enabled
```

## Model

Preferred V1:

```text
Model2Vec StaticModel.encode(query)
  -> LogisticRegression / LinearSVC / tiny MLP
  -> 9 domain probabilities
```

Domains:

```text
web
github
security
papers
specs
changelog
forums
package-registry
vendor-status
```

## Training data

Weak labels:

- current `classifyQuestionDomain()`
- cache queries
- generated query variants only if deterministic and reviewed

Gold eval:

- `data/router/gold-domain.jsonl`
- 90+ manual examples

## Stop-and-ship criteria

Ship the Model2Vec domain router if all are true:

1. Gold accuracy is within 5 percentage points of current heuristic or better.
2. Macro-F1 does not hide high-risk failures.
3. No systematic high-risk downgrade:
   - `security -> web`
   - `papers -> web`
   - `specs -> web`
4. p95 latency is lower than local SLM and acceptable for normal startup/runtime.
5. Runtime can fail closed to `classifyQuestionDomain()`.

If Model2Vec is slightly below heuristic but faster/simpler:

- It may still ship for low-risk domains only.
- High-risk regex overrides remain active.

## Implementation files later

```text
ml/router/embed_model2vec.py
ml/router/train_domain_classifier.py
ml/router/evaluate_domain.py
lib/tiny-router.js
test/tiny-router.test.js
```

## Runtime policy

Feature flag:

```text
EMET_TINY_ROUTER=1
EMET_TINY_ROUTER_MODEL=/path/to/domain-router
```

Decision thresholds:

- accept if confidence >= 0.80
- for high-risk domains require >= 0.75 but never allow low-confidence `web` to override a high-risk heuristic match
- fallback on error, missing model, timeout, low confidence

## Explicit non-goals

- No query planning.
- No conflict detection.
- No sufficiency skip.
- No TRM in domain routing.
