# Phase 10: Active Learning and Review Loop

## Goal

Make emet improve from real usage without poisoning training data.

## Runtime logging

Every research run should log:

```text
query
mode/options
router predictions + confidence
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
high-risk domain
premature stop suspicion
conflict detected
many fetches before stop
user correction/negative feedback
new domain vocabulary
```

## Review tiers

```text
Pi/LLM review -> high-volume first pass
human review -> high-risk and disagreement cases
gold holdout -> never train on it
```

## Best-practice decision

Never train on raw logs directly. Use accepted reviewed rows only.

## Acceptance criteria

- Automatic split into accepted vs needs-human.
- Audit detects imbalance and missing labels.
- Training only uses rows with review provenance.
