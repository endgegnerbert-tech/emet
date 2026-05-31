# Router pipeline scripts

Canonical scripts are grouped by pipeline stage. Root-level files in `scripts/router/` are compatibility shims for older docs, tests, and local commands.

## Layout

- `audit/` — fail-closed gates and dataset/cache audits.
- `export/` — cache/log/example extraction and candidate building.
- `review/` — Pi/LLM review, prelabeling, and reviewed-row splitting.
- `train/` — synthetic/gold/train data builders and follow-up training helpers.
- `eval/` — model, heuristic, runtime, and policy evaluations.
- `tools/` — replay and annotation utilities.
- `deploy/` — runtime deployment scripts.
- `utils/` — shared script helpers.

## Standard checks

Use repository-level scripts from `package.json`:

```bash
npm run check
npm run check:promotion
```
