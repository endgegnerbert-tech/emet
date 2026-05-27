# Phase 5: Source Authority and Page Quality Models

## Goal

Score fetched sources before they influence the answer.

## Model A: Source Authority Scorer

### Question

```text
Is this source authoritative for this query/domain?
```

### Labels

```text
primary_source
authoritative
secondary_but_good
community_context
weak_source
unusable
```

### Features

```text
query
domain
url host
source type
title/snippet
page text sample
publisher signals
freshness/version signals
```

### Training

- Start with domain authority rules as weak labels.
- Review uncertain/high-impact examples with Pi/human.
- Keep allowlist/denylist reasons in the trace.

## Model B: Page Quality/Relevance Scorer

### Question

```text
Is this fetched page usable and relevant?
```

### Labels

```text
usable
thin
blocked
placeholder
off_topic
duplicate
low_query_overlap
```

### Features

```text
text length
query term overlap
HTTP status
content type
placeholder patterns
source type
title/snippet match
```

## Best-practice decision

Keep page-quality rules as primary. Use ML to rank/boost, not to accept blocked garbage.

## Acceptance criteria

- Fewer low-quality pages reach answer synthesis.
- No primary/official sources are incorrectly discarded without fallback review.
- Source score is explainable in trace.
