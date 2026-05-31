# Phase 3: Query Understanding Model

## Goal

Predict what kind of research the query needs before fetching pages.

## Questions this model answers

```text
What kind of question is this?
Is it ambiguous?
Does it need current sources?
Does it need official/primary sources?
What answer shape is expected?
```

## Labels

```text
query_shape:
  short_fact
  explanation
  comparison
  howto
  troubleshooting
  ambiguous_factoid
  current_or_version_sensitive
  academic_review
  shopping_or_ecommerce
  legal_medical_finance_sensitive

answer_shape:
  short_answer
  list
  long_explanation
  step_by_step
  comparison_table
  citation_heavy

source_family:
  encyclopedia
  official_docs
  academic
  primary_source
  recent_news
  government_or_legal
  community
  product_or_ecommerce
  general_web

recency_need:
  none
  helpful
  required

ambiguity:
  low
  medium
  high
```

## Best model choice

Start simple:

1. Model2Vec/static embedding + logistic regression/SVC.
2. Add small MLP if feature interactions matter.
3. Avoid TRM here; query understanding is a one-shot classification problem.

## Training data

```text
NQ -> factoid/short-answer/encyclopedia priors
ASQA -> ambiguity and multi-answer priors
DL-HARD -> hard query, intent, answer type, topic priors
emet logs -> production query distribution
```

## Runtime output

The model returns calibrated probabilities and may abstain:

```json
{
  "query_shape": "comparison",
  "recency_need": "helpful",
  "source_family": "official_docs",
  "ambiguity": "low",
  "confidence": 0.82
}
```

## Acceptance criteria

- Beats keyword baseline on held-out query-understanding set.
- Calibrated confidence; low-confidence output can abstain.
- Used only as planner features until proven safe.
