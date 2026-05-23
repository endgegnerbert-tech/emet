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
node scripts/router/audit-cache.mjs
node scripts/router/export-examples.mjs
node scripts/router/split-examples.mjs

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

python scripts/router/eval_domain_unknown.py \
  --model-dir .cache/models/emet-router/domain \
  --input data/router/unknown-domain-smoke.jsonl
```

## Phase 2 — structured baselines

Build provisional structured rows:

```bash
node scripts/router/export_structured_provisional.mjs
node scripts/router/eval_structured_baselines.mjs
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

## Runtime flags

```bash
EMET_TINY_ROUTER=1
EMET_TINY_ROUTER_MODEL=.cache/models/emet-router
EMET_TINY_ROUTER_TIMEOUT_MS=50
EMET_TINY_ROUTER_DOMAIN=1
EMET_TINY_ROUTER_FOLLOWUP=1
EMET_TINY_ROUTER_CONFLICT=0
EMET_TINY_ROUTER_SUFFICIENCY=0
```

Keep conflict/sufficiency off until metrics are reviewed.

## Server deploy

Safe MCP runtime deploy:

```bash
scripts/router/deploy-server-runtime.sh \
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
