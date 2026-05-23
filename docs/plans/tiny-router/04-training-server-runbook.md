# 04 — Training Server Runbook

Server budget:

```text
GPU RAM: 2 GB
CPU RAM: 20 GB
```

Design consequence:

- CPU-first.
- Frozen embeddings.
- Small batches.
- No embedding fine-tuning.
- No full TRM config.

## Environment

Create:

```text
ml/router/
  requirements.txt
  README.md
  embed_model2vec.py
  train_domain_classifier.py
  build_structured_features.py
  train_structured_mlp.py
  train_trm_structured.py
  evaluate.py
  benchmark_latency.py
```

Minimal requirements for first slice:

```text
model2vec
numpy
scikit-learn
joblib
```

Add later only if needed:

```text
torch
onnx
onnxruntime
```

## Phase 1: Model2Vec domain router

Commands:

```bash
python -m venv .venv-router
. .venv-router/bin/activate
pip install -r ml/router/requirements.txt

node scripts/router/audit-cache.mjs \
  --cache .cache/research-cache.json \
  --out data/router/dataset-report.json

node scripts/router/export-examples.mjs \
  --cache .cache/research-cache.json \
  --out data/router/examples.jsonl

python ml/router/embed_model2vec.py \
  --input data/router/examples.jsonl \
  --task domain \
  --out data/router/domain-model2vec.npz \
  --model minishlab/potion-base-8M

python ml/router/train_domain_classifier.py \
  --embeddings data/router/domain-model2vec.npz \
  --gold data/router/gold-domain.jsonl \
  --out .cache/models/emet-router/domain
```

Expected resource usage:

- GPU: none.
- CPU RAM: well under 20 GB.

## Phase 2: structured features for TRM candidates

Create structured features before model training:

```bash
python ml/router/build_structured_features.py \
  --input data/router/examples.jsonl \
  --gold-conflict data/router/gold-conflict.jsonl \
  --gold-sufficiency data/router/gold-sufficiency.jsonl \
  --out data/router/structured-features.npz
```

Feature sets:

- conflict pairs
- sufficiency coverage grids
- follow-up action states

## Phase 3: structured MLP baseline

Before TRM, train an MLP on the exact same structured features.

```bash
python ml/router/train_structured_mlp.py \
  --features data/router/structured-features.npz \
  --task conflict \
  --out .cache/models/emet-router/conflict-mlp
```

If MLP solves it, do not build TRM for V1.

## Phase 4: TRM structured experiment

Only after MLP baseline.

Start config:

```bash
python ml/router/train_trm_structured.py \
  --features data/router/structured-features.npz \
  --task conflict \
  --hidden-size 128 \
  --seq-len 64 \
  --batch-size 4 \
  --device cpu \
  --out .cache/models/emet-router/conflict-trm
```

Try CUDA only if CPU is too slow and memory is safe:

```bash
python ml/router/train_trm_structured.py \
  --features data/router/structured-features.npz \
  --task conflict \
  --hidden-size 128 \
  --seq-len 64 \
  --batch-size 2 \
  --grad-accum 4 \
  --device cuda
```

OOM fallback:

```text
seq_len 64 -> 48
batch_size 4 -> 2 -> 1
hidden_size 128 -> 96 -> 64
device cuda -> cpu
```

## Required metrics

Output every run:

```text
metrics/router/
  baseline.json
  domain-model2vec.json
  structured-mlp-conflict.json
  structured-trm-conflict.json
  structured-mlp-sufficiency.json
  structured-trm-sufficiency.json
  latency.json
```

Metrics:

- accuracy
- macro-F1
- confusion matrix
- false-sufficient count
- missed-conflict count
- high-risk-domain downgrade count
- p50/p95 latency
- peak CPU RAM
- peak GPU RAM if CUDA used

## Latency benchmark before export

Run:

```bash
python ml/router/benchmark_latency.py \
  --models .cache/models/emet-router \
  --examples data/router/gold-domain.jsonl \
  --out metrics/router/latency.json
```

Rule:

- No ONNX export before latency benchmark.
- No ONNX runtime assumption without parity and speed measurement.
