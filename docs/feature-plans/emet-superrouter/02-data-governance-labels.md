# Phase 2: Data Governance, Schemas, and Labels

## Goal

Create clean training data before training more models.

## Best-practice decision

External datasets are auxiliary. Real emet traces are authoritative for emet policy labels.

## Dataset roles

| Dataset | Use | Do not use for |
|---|---|---|
| emet reviewed logs | true domain/sufficiency/conflict/follow-up labels | none; this is primary data |
| Natural Questions | query shape, answer shape, factoid pretraining | direct sufficiency labels |
| ASQA | ambiguity and multi-answer coverage | direct authority/conflict labels |
| DL-HARD | hard-query, intent, answer type, topic domain | direct emet stop/fetch labels |
| QueryClassification/NTRS | scholar/academic intent | all-domain router alone |
| Kaggle domain data | optional broad topic pretraining | source authority |
| AOL query log | avoid by default; privacy-sensitive | default training |

## Canonical example schema

```json
{
  "query": "...",
  "mode": "fast|deep|code|academic",
  "labels": {
    "query_shape": "short_fact|explanation|comparison|ambiguous|...",
    "domain": "github|papers|security|web|...",
    "sufficiency": "sufficient|need_authority|...",
    "conflict": "no_conflict|needs_review|...",
    "next_action": "stop|fetch_more|fetch_authority|..."
  },
  "source_state": {
    "source_count": 0,
    "authority_count": 0,
    "primary_count": 0,
    "recent_count": 0,
    "distinct_domain_count": 0,
    "conflict_score": 0,
    "version_match_score": 0
  },
  "review": {
    "source": "human|pi_review|llm_review|weak_label|synthetic",
    "confidence": 0.0,
    "needs_human_review": false
  }
}
```

## Label quality tiers

```text
Tier 0: raw/untrusted
Tier 1: weak external auxiliary label
Tier 2: LLM/Pi reviewed high confidence
Tier 3: human reviewed
Tier 4: gold eval holdout
```

## Phase 2 implementation status

Completed as the router data-governance layer:

- Canonical training row helpers live in `lib/router-training-schema.js`.
- The machine-readable schema is `docs/schemas/router-training-row.schema.json`.
- The governance audit is `scripts/router/audit-data-governance.mjs` and writes `metrics/router/data-governance.json` by default.
- `scripts/router/audit-training-readiness.mjs` now blocks train/promote when reviewed candidates lack provenance, confidence, or still need human review.
- External dataset inventory remains in `experiments/emet-superrouter/manifests/datasets.json`; AOL logs stay opt-in only and uncommitted.

## Operational gate

Run before any router train/promote pass:

```bash
node scripts/router/audit-data-governance.mjs
node scripts/router/audit-training-readiness.mjs
```

Treat a non-zero exit code as a hard stop for training.

## Acceptance criteria

- One schema for all future training rows. ✅
- No raw/prelabel data enters training without `review.source` and `confidence`. ✅
- Separate train/dev/test/gold holdout. ✅
- No privacy-sensitive external log data committed. ✅
