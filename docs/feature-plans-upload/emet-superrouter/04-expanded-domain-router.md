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

## Acceptance criteria

- Macro-F1 improves over current rules on gold holdout.
- High-risk downgrades = 0.
- `web` fallback rate decreases without source-quality regression.
