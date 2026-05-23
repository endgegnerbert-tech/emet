# 01 — Data, Labels, and Gold Eval

## Problem

The cache labels are not equally trustworthy.

`.cache/research-cache.json` contains useful data, but many labels were created by the current pipeline. Training on them can compress the current heuristic instead of improving it.

## Label policy by task

| Task | Cache/heuristic labels | Use for training? | Use for gold eval? |
|---|---:|---:|---:|
| Domain | reasonably useful | yes, weak labels | no, manually check |
| Sufficiency | contaminated but informative | weak pretraining only | manual gold required |
| Conflict | unsafe as truth | no, except mining candidates | manual gold only |
| Follow-up action | can infer weakly | yes for warm start | manual eval required |
| Claim verification | not currently labeled | no | manual or citation-derived later |
| Chunk coverage | not currently labeled | weakly from cited sources later | manual/sample eval |

## Required files

```text
data/router/
  dataset-report.json
  examples.jsonl
  splits.json
  gold-domain.jsonl
  gold-sufficiency.jsonl
  gold-conflict.jsonl
  gold-followup-action.jsonl
```

## A1. Audit script

Create:

```text
scripts/router/audit-cache.mjs
```

Input:

```text
.cache/research-cache.json
```

Output:

```text
data/router/dataset-report.json
```

Report fields:

- total cache entries
- usable research runs
- modes distribution
- normalized-query duplicates
- source count distribution
- source type distribution
- domain distribution using current `classifyQuestionDomain()`
- `sufficient` distribution
- `conflictDetected` distribution
- missing fields
- high-risk domains count
- candidate conflicts for manual labeling

Stop condition:

- If report shows too few examples for a task, do not train that task.

## A2. Export examples

Create:

```text
scripts/router/export-examples.mjs
```

Output:

```text
data/router/examples.jsonl
```

Schema:

```json
{
  "id": "sha1",
  "task": "domain|sufficiency|conflict|followup_action",
  "query": "...",
  "inputText": "...",
  "label": "...",
  "labelSource": "heuristic|pipeline|gold|candidate_only",
  "risk": "low|medium|high",
  "meta": {
    "mode": "fast",
    "sourceCount": 3,
    "sourceTypes": [],
    "authoritativeSourcesFound": true,
    "conflictDetected": false,
    "sufficient": true
  }
}
```

Rules:

- Domain examples may use heuristic labels.
- Conflict cache rows are exported as `candidate_only`, not truth.
- Sufficiency rows are exported as `pipeline`, not gold.

## A3. Gold labels

### Domain gold

Minimum:

- 90 examples total.
- Try 10 per domain.

Fields:

```json
{"query":"...","label":"github","rationale":"asks for GitHub issue/repo"}
```

### Sufficiency gold

Minimum:

- 80 examples.
- Include false-positive traps.

Fields:

```json
{"query":"...","sources":[...],"label":"sufficient|insufficient","rationale":"..."}
```

False-positive traps:

- many weak sources, no authority
- good source but wrong version
- answerable only partially
- sources are old for volatile query
- synthesis answer has unverified claim

### Conflict gold

Minimum:

- 80 examples.
- Completely manual.
- Do not copy `conflictDetected` as truth.

Labels:

```text
no_conflict
open_conflict
resolved_by_authority
resolved_by_recency
needs_review
```

Required anti-heuristic cases:

- positive/negative wording but different versions
- old GitHub issue vs current official docs
- blog vs official docs
- two official sources with different dates
- terminology difference but same meaning
- forum report unsupported by primary source

### Follow-up action gold

Minimum:

- 60 examples.

Labels:

```text
need_authority
need_conflict_resolution
need_recency
need_version_context
need_primary_source
need_more_sources
stop
```

## A4. Leakage-safe split

Create:

```text
scripts/router/split-examples.mjs
```

Rules:

- Split by normalized query hash.
- Same query never appears across train/validation/test.
- Gold files are never included in training unless explicitly copied as train data later.

Output:

```text
data/router/splits.json
```

## Done criteria

- Dataset report exists.
- Export is deterministic.
- Gold files exist with rationales.
- Conflict gold has anti-heuristic cases.
- Split has no query leakage.
