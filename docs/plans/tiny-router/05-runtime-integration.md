# 05 — Runtime Integration and Feature Flags

## New runtime module

Implemented at:

```text
lib/tiny-router.js
```

Responsibilities:

- Lazy-load model artifacts.
- Expose domain classification first.
- Later expose structured reasoning decisions.
- Never throw into the research path.
- Provide test hooks like `lib/local-slm.js`.

## Feature flags

```text
EMET_TINY_ROUTER=1
EMET_TINY_ROUTER_MODEL=/path/to/router
EMET_TINY_ROUTER_TIMEOUT_MS=50
```

Optional task flags later:

```text
EMET_TINY_ROUTER_DOMAIN=1
EMET_TINY_ROUTER_SUFFICIENCY=0
EMET_TINY_ROUTER_CONFLICT=0
```

Default:

- Everything off.

## Domain integration

Target function:

```js
// lib/web-research.js
resolveQuestionDomain(query, signal)
```

Policy:

```text
if tiny router enabled and high confidence:
  use tiny domain
else:
  use classifyQuestionDomain(query)
```

Legacy local SLM:

- Removed.
- Runtime now uses tiny-router plus deterministic heuristic fallback only.

## Structured TRM integration later

### Conflict

Target:

```js
// lib/research.js
detectConflictSignals(pages)
```

V1 safe policy:

```text
heuristic conflict true -> conflict true unless TRM says resolved AND feature flag allows clearing
TRM open_conflict/needs_review -> conflict true
TRM no_conflict -> advisory only, not clearing in V1
```

Default:

- TRM may escalate, not clear.

### Sufficiency

Target:

```js
// lib/research.js
evaluateSufficiency(input)
```

V1 safe policy:

```text
current sufficient false -> TRM may explain missing action
current sufficient true -> TRM may veto if coverage/conflict risk
TRM alone cannot skip fetches in V1
```

### Follow-up action

Target:

```js
// lib/web-research.js
planSubqueries()
```

Policy:

```text
TRM predicts action
existing deterministic template builds query
```

No free text from TRM.

## Artifact formats

Domain V1 can be simple:

```text
.cache/models/emet-router/domain/
  model.joblib
  model2vec-name.txt
  calibration.json
  metrics.json
```

If Node cannot load Python artifacts directly, choose one:

1. Export classifier weights to JSON and run Model2Vec-compatible runtime if available.
2. Use a tiny Python sidecar only for experiments.
3. Use ONNX only after latency/parity benchmark.

Do not assume ONNX is fastest.

## Tests

Create:

```text
test/tiny-router.test.js
```

Required tests:

- disabled by default returns null/fallback
- missing model returns null/fallback
- invalid output ignored
- low confidence ignored
- high-confidence domain accepted
- high-risk heuristic not downgraded by low-confidence `web`
- sufficiency skip blocked unless threshold and task flag permit
- conflict clearing blocked in V1

## Logging

Add compact events only:

```text
tiny_router_domain
 tiny_router_fallback
 tiny_router_structured_decision
 tiny_router_latency
```

Do not log full embeddings or full source text.

## Runtime acceptance

- Startup not noticeably slower.
- Model loads lazily.
- Timeout respected.
- Failure path equals current behavior.
- `npm test` passes.
