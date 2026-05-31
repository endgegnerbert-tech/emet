# 06 — BitNet / JSON Deprecation Path

Status: completed.

## Removed BitNet/local-SLM files

- `lib/local-slm.js`
- `lib/local-slm-setup.js`
- `test/local-slm.test.js`
- README and CLI references to local BitNet setup/doctor flows

## Why removal is now safe

- Domain tiny-router passed gold eval and latency checks.
- Query planning is deterministic without local JSON generation.
- Tests no longer require the old local-SLM path.

## Deprecation order

### Step 1: make tiny-router default-off but available

No BitNet removal.

### Step 2: prove domain-router replacement

Required:

- gold eval pass
- latency pass
- no high-risk downgrades
- fallback tests pass

### Step 3: stop using BitNet for domain routing

Change order:

```text
tiny-router -> heuristic -> legacy local SLM only if explicitly enabled
```

### Step 4: remove JSON planner dependency

Only if query planning works well enough with deterministic templates and follow-up actions.

Do not remove JSON planning if deep/code mode still needs it.

### Step 5: documentation update

Update:

- README
- CHANGELOG
- THIRD_PARTY_NOTICES if dependencies change

### Step 6: delete or isolate legacy files

Options:

1. Keep `local-slm.js` as legacy opt-in.
2. Move to `lib/legacy-local-slm.js`.
3. Delete only if no tests/use-cases remain.

## Removal acceptance

Completed:

- no test requires it,
- tiny-router covers domain use-case,
- deterministic planner covers query planning use-case,
- README no longer promises BitNet setup,
- package remains installable without BitNet-specific setup.
