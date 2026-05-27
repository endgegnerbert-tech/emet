# Phase 4: Expanded Domain Pack Router

## Goal

Route queries to source policies that actually change retrieval behavior.

## Best-practice decision

Only add a domain if it changes source authority, allowed sources, query expansion, or eval expectations.

## Target labels

```text
security
vendor-status
package-registry
github
changelog
papers
specs
forums
web
legal
medical
finance
cloud-docs
ai-ml
ecommerce
trading
quantum
shopify
standards
news-current-events
local-howto
```

## Model choice

Best first production model:

```text
Model2Vec/static embedding + calibrated SVC or logistic regression
```

Why:

- Fast.
- Cheap.
- Easy to inspect.
- Good enough for one-shot routing.
- Safer than large opaque models.

## Training data

```text
existing gold-domain
pi-reviewed domain accepted rows
human-reviewed needs-human rows
DL-HARD topic domain as auxiliary only
QueryClassification for papers/scholar auxiliary signal
optional Kaggle broad-domain data after license/auth
```

## Decision rules

- High-risk heuristic domains can veto ML downgrades.
- Model confidence must exceed per-domain calibration threshold.
- Ambiguous or low-confidence queries fall back to rules or `web` plus stronger source checks.
- Runtime routing uses stable source-policy families plus composable overlays; target labels remain backwards-compatible aliases.
- Manual CLI/extension selection should be optional: hints may guide routing, while force flags are reserved for expert/test overrides.

## Phase 4 implementation status

Implemented as a family + overlay router in `lib/domains/index.js`:

```text
family: web | developer-docs | academic | regulated | current-events | commerce | community | local-government
overlays: security | medical | legal | finance | trading | vendor-status | package-registry | github | changelog | cloud-docs | ai-ml | ecommerce | quantum | shopify | specs | standards | news-current-events | local-howto | official-only | primary-source-required | recency-required | version-sensitive
```

Compatibility:

- Existing flat target labels still work as aliases.
- `domainHint`, `familyHint`, `overlays`, `sourcePolicy`, and `forceDomain` are accepted tool options.
- Forced domains bypass learned routing; high-risk rule/guardrail fallback remains intact.

## Acceptance criteria

- Macro-F1 improves over current rules on gold holdout.
- High-risk downgrades = 0.
- `web` fallback rate decreases without source-quality regression.
