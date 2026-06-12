# emet Runtime + Tiny Router: Improvement Plan

**Date:** 2026-06-12 (updated)
**Status:** Phases 0–3 + 5 implemented in v1.3.2; Phase 4 (ML retraining) open
**Author:** repo evidence + runtime log analysis + emet research

---

## Executive Summary

emet already has the right core shape: query planning, guardrails, multi-query search, page fetch, synthesis, cache, and a tiny-router path. The next step is not adding more features first. The next step is making the runtime **more reliable, more measurable, and more trainable**.

This plan focuses on five things:
1. **Activate Tiny Router in real runtime paths** instead of leaving it mostly dark behind env flags. ✅
2. **Improve observability** so failures are structured, measurable, and useful for later model training. ✅
3. **Harden fetch/search resilience** with better retry, timeout, and fallback behavior. ✅
4. **Improve data quality** so current runs become high-value training data for future router retraining. ⬜
5. **Keep logs and caches bounded** without deleting useful historical evidence. ✅

---

## Current Repo Evidence

### Runtime / config evidence
- `lib/tiny-router.js` auto-enables `domain` + `preflight` when models + Python runtime exist.
- `EMET_TINY_ROUTER=0` still disables it explicitly.
- `ml/models/domain/model.joblib` and `ml/models/preflight/model.joblib` exist.
- `scripts/router/deploy/deploy-server-runtime.sh` updated for preflight flag.

### ML Models – Current State
| Model | Type | Train rows | Val rows | Notes |
|-------|------|------------|----------|-------|
| **domain** | Model2Vec + LogisticRegression | 122 | 34 | 8 classes; macro F1 0.58; 1 high-risk downgrade acceptable |
| **preflight** | multi-head LR (domain + QU) | 2551 (capped to 2383) | 126 domain + 24 QU holdout | Best-practice multi-head; domain threshold 0.99 |
| **conflict-structured** | SVC on deterministic features | 80 | — | Feature-based (no embeddings); 80 rows is very small |
| **sufficiency-structured** | LR on deterministic features | 78 | — | Feature-based; 78 rows is very small |
| **followup** | Model2Vec + SVC | — | — | Shadow/opt-in; no gold metrics published |

Assessment: **domain + preflight are adequate but data-starved.** Conflict/sufficiency models have <100 rows each, which is too small for reliable generalization. All models would benefit from the new structured logging data.

### Training data assets
| Dataset | Rows | Source | Used by |
|---------|------|--------|---------|
| `data/router/gold-domain.jsonl` | 90 | Hand-labeled | domain, preflight |
| `data/router/log-candidates/domain-pi-accepted.jsonl` | 140 | Pi-review of old logs | domain |
| `data/router/gold-conflict-structured.jsonl` | 80 | Hand-labeled | conflict |
| `data/router/gold-sufficiency-structured.jsonl` | 78 | Hand-labeled | sufficiency |
| `data/router/gold-followup.jsonl` | 26 | Hand-labeled (single class) | followup |
| `data/router/query-understanding-holdout.jsonl` | 24 | Hand-labeled | preflight |
| `data/router/query-understanding-weak.jsonl` | 176 | Weak-heuristic | preflight |
| `data/router/synthetic-train.jsonl` | ~600 | Synthetic | domain, preflight |
| `data/router/examples.jsonl` | ~900 | Cache export + pipeline | domain, preflight |

### Training pipeline (Python)
- `ml/router/train_preflight_router.py` – multi-head (domain + QU) preflight model
- `ml/router/train_domain_classifier.py` – Model2Vec + SVC/LR domain classifier
- `ml/router/train_structured_baseline.py` – feature-based LR/SVC for conflict/sufficiency
- `ml/router/train_query_understanding.py` – multi-head QU bundle
- `ml/router/embed_model2vec.py` – generate embeddings from JSONL

### Structured logging (NEW in v1.3.2)
Now emits stable fields per event:
- **Per-fetch**: `outcome`, `reason`, `statusCode`, `retryCount`, `latencyMs`, `fallbackUsed`, `contentType`
- **Per-search**: `provider`, `providerOrder`, `rawResultCount`, `postFilterResultCount`, `finalRankedSetSize`
- **Per-research**: `outcome`, `reason`, `authoritativeSourceCount`, `sourceCount`, `readablePageRate`
- **Per-failure**: `timeout`, `http_403`, `http_404`, `http_429`, `http_5xx`, `network_error`, `blocked_page`, `content_too_thin`, `search_empty`, `no_readable_sources`, `pdf_extract_failed`

These are daily JSONL files at OS-context-aware paths. Existing export scripts (`export-examples.mjs`, `build-log-training-candidates.mjs`, `audit-cache.mjs`) need a small adapter to read the new schema.

---

## Pre-existing Issues (not caused by v1.3.2)

### 1. MCP server import path
- **File**: `mcp/server.js` line ~3
- **Bug**: imports `../../package.json` instead of `../package.json`
- **Effect**: tests crash with `ERR_MODULE_NOT_FOUND` for `/Users/einarjaeger/github/package.json`
- **Fix**: change to `../package.json`

### 2. Plugin manifest version drift
- **Files**: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `plugins/emet/.codex-plugin/plugin.json`
- **Bug**: manifest version is `1.3.0` but package is `1.3.2`
- **Fix**: bump all plugin manifests to `1.3.2`

### 3. MCP transport test
- **Same root cause** as #1 (import path), so fixing #1 fixes this too.

---

## Phase 4: Retrain ML Models with New Structured Log Data (P2)

### Goal
Use the new structured runtime logs (v1.3.2) to augment training data and retrain all tiny-router models, especially the small ones.

### Why now
The structured logging now emits machine-classifiable `outcome`/`reason` fields that can serve as **weak supervision labels** — no manual labeling needed for basic signal.

**Biggest leverage: the existing 305MB log.** `~/.pi/logs/emet.jsonl` enthält **2.353 frische research_end-Events** (non-cache-hit) – 30× mehr Sufficiency- und 5× mehr Conflict-Daten als aktuelles Gold:
- 2.276 sufficiency candidates (631 sufficient + 1.645 insufficient)
- 431 conflict candidates (conflictDetected=true)
- 2.353 domain candidates (heuristic domain vorhanden)
- 2.353 followup candidates (alle haben followupRounds)

Diese Logs haben zwar noch nicht die neuen `outcome`/`reason`-Felder, aber `sufficient`/`conflictDetected`/`sources` lassen sich direkt als Weak Labels nutzen. Eine einmalige Migration extrahiert daraus in Minuten Trainingsdaten.

**Laufend:** ~80–100 neue structured-log Zeilen pro Tag mit vollen `outcome`/`reason`/`domainDecision`-Feldern.

### Files
- Modify: `scripts/router/export/export-examples.mjs` – consume new `research_end.outcome`/`.reason` fields
- Modify: `scripts/router/export/build-log-training-candidates.mjs` – parse new JSONL schema (daily files, `schemaVersion` field)
- Modify: `ml/router/train_domain_classifier.py` – accept `outcome` as weak label signal
- Modify: `ml/router/train_structured_baseline.py` – accept new feature fields from structured logs
- Modify: `ml/router/train_preflight_router.py` – add weak-supervision path from daily logs
- Create: `scripts/router/export/export-structured-log-rows.mjs` – extract training rows from daily JSONL
- Test: `test/router-log-training-candidates.test.js` – update assertions for new schema
- Docs: `docs/plans/emet-training-data-contract.md` (if schema contract grows large)

### Changes

#### 1. Adapter for new JSONL schema
The new logger writes records with `schemaVersion: 1`, `event` alias for `type`, and daily filenames. The existing `parseResearchSessionsFromLogEvents()` in `build-log-training-candidates.mjs` reads `event.type` already, but needs to:
- scan daily files (`emet-YYYY-MM-DD.jsonl`) instead of a single `emet.jsonl`
- accept `schemaVersion` field
- handle new field names like `outcome`, `reason`

#### 2. Weak labels from structured outcomes
Map runtime outcomes to training labels:

| Log outcome | Training label | Task |
|-------------|---------------|------|
| `sufficient` | `sufficient` | sufficiency |
| `partial_success` | `insufficient` | sufficiency |
| `hard_failure` → `no_readable_sources` | `insufficient` | sufficiency |
| `cache_hit` | skip (not fresh) | — |
| `http_429` / `timeout` / `network_error` | `retryable` noise flag | fetch quality |
| `success` + authoritative source found | `sufficient` (high confidence) | sufficiency |
| Any `fetch_error` with `fallbackUsed:true` + fallback success | `fallback_success` | page quality |

#### 3. Domain label enrichment
When `research_end` contains `domainDecision.finalDomain`, that is a **strong signal** for the domain task — especially when the tiny-router accepted it. Preflight domain predictions can serve as weak pre-labels when confidence > 0.85.

#### 4. Conflict augmentation
Research turns with `conflictDetected:true` and `conflictingSourcePairs` > 0 are candidates for conflict training. The structured log already emits `tiny_router_structured_decision` events for conflict; these can be used as silver labels.

#### 5. Sufficiency augmentation
Every `research_end` with `sufficient: true/false` plus `outcome` + `sourceCount` + `authoritativeSourceCount` is a sufficiency candidate. The new `readablePageRate` field directly measures page quality.

#### 6. Retrain pipeline
```bash
# 1. Migrate old 305MB log (one-time, highest leverage)
# Extrahiert aus ~/.pi/logs/emet.jsonl: 2.276 sufficiency + 431 conflict + 2.353 domain + 2.353 followup
node scripts/router/export/export-structured-log-rows.mjs \
  --legacy ~/.pi/logs/emet.jsonl \
  --out data/router/log-candidates/legacy-migration.jsonl

# 2. Export new structured-log rows (daily)
node scripts/router/export/export-structured-log-rows.mjs \
  --log-dir ~/Library/Logs/emet \
  --out data/router/log-candidates/structured-v1.jsonl

# 3. Merge all candidates
node scripts/router/export/build-log-training-candidates.mjs \
  --input data/router/log-candidates/structured-v1.jsonl \
  --out-dir data/router/log-candidates/

# 4. Audit training readiness
node scripts/router/audit/audit-training-readiness.mjs

# 5. Retrain domain (Model2Vec + embeddings)
Extrahiere aus structured-v1.jsonl die `domainDecision.finalDomain` + `finalDomain` als Weak Labels pro Session.

python ml/router/embed_model2vec.py \
  --input data/router/examples.jsonl \
  --candidates data/router/log-candidates/domain-pi-accepted.jsonl \
  --log-candidates data/router/log-candidates/structured-v1.jsonl \
  --gold data/router/gold-domain.jsonl \
  --out data/router/domain-model2vec.npz

python ml/router/train_domain_classifier.py \
  --embeddings data/router/domain-model2vec.npz \
  --gold-embeddings data/router/gold-model2vec.npz \
  --out .cache/models/emet-router/domain \
  --model-type auto

# 6. Retrain preflight (multi-head: domain + QU)
Aus structured-v1.jsonl: `domainDecision.finalDomain` + `queryUnderstandingDecision`.

python ml/router/train_preflight_router.py \
  --domain-input data/router/experiment-candidates/domain-pi-reviewed.jsonl \
    data/router/log-candidates/domain-pi-accepted.jsonl \
    data/router/log-candidates/structured-v1.jsonl \
    data/router/synthetic-train.jsonl data/router/examples.jsonl \
  --multitask-input data/router/experiment-candidates/multitask-pi-reviewed.jsonl \
  --query-input data/router/query-understanding-weak.jsonl \
  --domain-holdout data/router/gold-domain.jsonl \
  --query-holdout data/router/query-understanding-holdout.jsonl \
  --out-dir .cache/models/emet-router/preflight \
  --metrics-out metrics/router/preflight-superrouter-v2.json

# 7. Retrain conflict (feature-based SVC)
structured-v1.jsonl liefert `conflictDetected`, `conflictingSourcePairs`, `evidenceState.edges`. Extrahiere `conflictState` + `conflictSummary` als Weak Label. Merge mit Gold.

python ml/router/train_structured_baseline.py --task conflict \
  --candidates data/router/log-candidates/structured-v1.jsonl \
  --gold data/router/gold-conflict-structured.jsonl

# 8. Retrain sufficiency (feature-based LR)
`research_end.outcome` + `sufficient` + `sourceCount` + `authoritativeSourceCount` + `readablePageRate` liefern direkt Weak Labels.

python ml/router/train_structured_baseline.py --task sufficiency \
  --candidates data/router/log-candidates/structured-v1.jsonl \
  --gold data/router/gold-sufficiency-structured.jsonl

# 9. Retrain followup (Model2Vec + hybrid)
structured-v1.jsonl: `followupQuery`, `followupAction`, `conflictState`, `sourcesMeta`. Weak Labels via `classifyFollowupWithStrongRules()`. Merge mit Gold.

python ml/router/embed_model2vec.py \
  --input data/router/log-candidates/structured-v1.jsonl \
  --gold data/followup/gold-followup.jsonl \
  --out data/router/followup-model2vec.npz

python scripts/router/train_followup_hybrid.py \
  --embeddings data/router/followup-model2vec.npz \
  --gold data/followup/gold-followup.jsonl \
  --out .cache/models/emet-router/followup \
  --eval-out metrics/router/followup-hybrid-v2.json
```

#### 9. Evaluation gates
- gold holdout F1 must not regress for ANY model
- high-risk domain downgrade rate must stay 0%
- conflict/sufficiency models must have >200 rows before promotion
- followup model must have >80 rows covering at least 3 action classes before promotion

### Model Health Assessment

| Model | Current quality | Needs retraining? | Priority |
|-------|----------------|-------------------|----------|
| **domain** | Macro F1 0.58; 122 train rows | Yes – more data = better coverage for rare classes | Medium |
| **preflight** | 2551 rows; 0.99 domain threshold; safe defaults | Low urgency – biggest dataset already | Low |
| **conflict** | 80 rows SVC; feature-based | **Yes – critically small** | High |
| **sufficiency** | 78 rows LR; feature-based | **Yes – critically small** | High |
| **followup** | No gold metrics; 26 rows single-class gold | **Needs data most** – `train_followup_hybrid.py` existiert aber wurde nie mit >36 Rows evaluiert | High |

### Acceptance Criteria
- Structured log export produces at least 200 new sufficiency + 100 new conflict + 50 new followup candidates per week of normal usage
- Domain model F1 improves or stays flat on gold holdout
- Conflict/sufficiency models have >200 train rows after first export
- Followup model has >80 train rows covering at least 3 action classes after first export
- No regression on high-risk downgrade vetoes

### Non-goals
- Rewriting the training pipeline from scratch
- Adding a new search provider
- Changing the model architecture (Model2Vec, SVC, LR stay)
- Training in GPU/cloud – CPU-only

---

## Delivery Order

### Done (v1.3.2)
1. **Phase 0 — Tiny Router activation** ✅
2. **Phase 1 — Structured logs and taxonomy** ✅
3. **Phase 2 — Retry/timeout/fallback hardening** ✅
4. **Phase 3 — Search instrumentation and preflight-driven planning** ✅
5. **Phase 5 — Rotation and archival** ✅

### Still open
6. **Phase 4 — ML retraining with new structured log data** ⬜
7. **Fix pre-existing test failures** ⬜ (MCP import path, plugin versions)

---

## Non-Goals for This Plan

- Replacing the search stack with a large new provider matrix immediately
- Broad UI or MCP contract redesign
- Rewriting synthesis from scratch
- GPU/cloud training

Those can come after runtime quality and log quality improve.

---

## Final Recommendation

The right next version of emet is:
- all 5 runtime phases complete ✅ (0–3 + 5)
- **retrain ALL models (domain, preflight, conflict, sufficiency, followup) with new structured log data (kein pi-review nötig – Weak Labels aus outcome/reason-Feldern)** ⬜
- **fix pre-existing MCP + plugin test failures** ⬜

That gives emet two wins at once:
1. better user-facing runtime quality now (done)
2. much stronger data for the next router generation later (next)
