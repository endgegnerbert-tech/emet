# Phase 10: Active Learning and Review Loop

## Goal

Make emet improve from real usage without poisoning training data.

## Runtime logging

Every research run should log:

```text
query
mode/options
family prediction + confidence
overlay predictions + confidence
manual hint / forced override markers
sources fetched
source quality/authority scores
evidence state per turn
actions taken
final answer metadata
user-visible confidence
```

## Candidate selection

Review examples with:

```text
low model confidence
model/rule disagreement
high-risk family/overlay
premature stop suspicion
conflict detected
many fetches before stop
user correction/negative feedback
new family/overlay vocabulary
```

## Review tiers

```text
Pi/LLM review -> high-volume first pass
human review -> high-risk and disagreement cases
gold holdout -> never train on it
```

## Best-practice decision

Never train on raw logs directly. Use accepted reviewed rows only.

Review queueing should separate mistakes by layer: wrong family, missing overlay, wrong source-policy flag, weak authority score, or bad final action.

## Acceptance criteria

- Automatic split into accepted vs needs-human.
- Review output records whether the fix changed family, overlays, source-policy flags, or only the final action.
- Audit detects imbalance and missing labels.
- Training only uses rows with review provenance.
