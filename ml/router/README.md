# Tiny Router Training Runbook

Target budget:

- GPU RAM: 2 GB
- CPU RAM: 20 GB
- Default path: CPU-first, frozen embeddings, small models

## Environment

```bash
python3 -m venv .venv-router
. .venv-router/bin/activate
pip install -r ml/router/requirements.txt
```

## Phase 1 — domain router

```bash
node scripts/router/audit/audit-cache.mjs
node scripts/router/export/export-examples.mjs
node scripts/router/export/split-examples.mjs

python ml/router/embed_model2vec.py \
  --input data/router/examples.jsonl \
  --gold data/router/gold-domain.jsonl \
  --synthetic data/router/synthetic-train.jsonl

python ml/router/train_domain_classifier.py \
  --embeddings data/router/domain-model2vec.npz data/router/synthetic-model2vec.npz \
  --gold-embeddings data/router/gold-model2vec.npz \
  --out .cache/models/emet-router/domain \
  --model-type auto

python ml/router/evaluate_domain.py \
  --model .cache/models/emet-router/domain/model.joblib \
  --embeddings data/router/gold-model2vec.npz \
  --out metrics/router/domain-model2vec-lr.json

python ml/router/benchmark_latency.py \
  --model-dir .cache/models/emet-router/domain \
  --examples data/router/gold-domain.jsonl \
  --out metrics/router/latency.json

python scripts/router/eval/eval_domain_unknown.py \
  --model-dir .cache/models/emet-router/domain \
  --input data/router/unknown-domain-smoke.jsonl
```

## Phase 2 — structured baselines

Build provisional structured rows:

```bash
node scripts/router/export/export_structured_provisional.mjs
node scripts/router/eval/eval_structured_baselines.mjs
```

Train conservative structured classifiers:

```bash
python ml/router/train_structured_baseline.py --task conflict
python ml/router/train_structured_baseline.py --task sufficiency
```

Outputs:

- `.cache/models/emet-router/conflict-structured/`
- `.cache/models/emet-router/sufficiency-structured/`
- `metrics/router/conflict-structured-models.json`
- `metrics/router/sufficiency-structured-models.json`

## Phase 3 — query-understanding model

Prepare auxiliary and weak in-domain rows:

```bash
python3 experiments/emet-superrouter/scripts/prepare_auxiliary_examples.py
node scripts/router/export/export_query_understanding_examples.mjs
```

Train the multi-head query-understanding bundle on auxiliary data plus weak emet queries, then score it on the hand-labeled holdout:

```bash
python ml/router/train_query_understanding.py \
  --input experiments/emet-superrouter/datasets/processed/auxiliary-query-understanding.jsonl data/router/query-understanding-weak.jsonl \
  --holdout data/router/query-understanding-holdout.jsonl \
  --out-dir .cache/models/emet-router/query-understanding \
  --model-type auto
```

Outputs:

- `.cache/models/emet-router/query-understanding/`
- `metrics/router/query-understanding-models.json`

For the 1.2 runtime pipeline, prefer the shared preflight bundle below instead of promoting this as a separate always-on model.

Best-practice guardrail: keep this model planner-only. Let it add query hints, recency preference, and extra search breadth, but never let it veto safety rules or domain guardrails.

## Phase 3.5 — preflight superrouter bundle

Best-practice shape: one shared query feature encoder with separate heads for domain, query shape, answer shape, source family, recency need, and ambiguity. Do not collapse these into one giant label.

Train the opt-in preflight bundle from reviewed experiment labels and emet query-understanding rows:

```bash
python ml/router/train_preflight_router.py \
  --domain-input data/router/experiment-candidates/domain-pi-reviewed.jsonl data/router/log-candidates/domain-pi-accepted.jsonl data/router/synthetic-train.jsonl data/router/examples.jsonl \
  --multitask-input data/router/experiment-candidates/multitask-pi-reviewed.jsonl \
  --query-input data/router/query-understanding-weak.jsonl \
  --domain-holdout data/router/gold-domain.jsonl \
  --query-holdout data/router/query-understanding-holdout.jsonl \
  --out-dir .cache/models/emet-router/preflight \
  --metrics-out metrics/router/preflight-superrouter.json \
  --min-confidence 0.85 \
  --max-domain-rows-per-label 600 \
  --no-multitask-query-labels \
  --model-type lr
```

Current recommendation: use this bundle only as planner/shadow preflight. Domain output is guarded by calibration, heuristic fallback, and high-risk downgrade vetoes.

Packaged runtime artifact path:

```bash
mkdir -p ml/models/preflight
cp .cache/models/emet-router/preflight/{model.joblib,meta.json,metrics.json} ml/models/preflight/
```

## Runtime flags

```bash
EMET_TINY_ROUTER=1
EMET_TINY_ROUTER_MODEL=.cache/models/emet-router
EMET_TINY_ROUTER_TIMEOUT_MS=50
EMET_TINY_ROUTER_DOMAIN=1
EMET_TINY_ROUTER_PREFLIGHT=0
EMET_TINY_ROUTER_FOLLOWUP=1
EMET_TINY_ROUTER_QUERY_UNDERSTANDING=0
EMET_TINY_ROUTER_CONFLICT=0
EMET_TINY_ROUTER_SUFFICIENCY=0
```

Keep preflight/query-understanding/conflict/sufficiency off until metrics are reviewed. Preflight/query-understanding are safe to shadow or planner-only enable first.

## Phase 12 — implementation roadmap audit

Before promoting another slice, verify that the roadmap still has concrete evidence artifacts and rollback hooks:

```bash
node scripts/router/audit/audit-implementation-roadmap.mjs
```

Output: `metrics/router/implementation-roadmap.json`.

## Server deploy

Safe MCP runtime deploy:

```bash
scripts/router/deploy/deploy-server-runtime.sh \
  blackknight@100.98.190.19 \
  ~/work/emet-runtime
```

This syncs the repo, installs user-local Node if needed, copies trained router models, runs `npm install`, and writes:

- `start-mcp-tiny-router-safe.sh`
- `start-mcp-tiny-router-experimental.sh`

Recommended start command:

```bash
ssh blackknight@100.98.190.19 'cd ~/work/emet-runtime && ./start-mcp-tiny-router-safe.sh'
```
