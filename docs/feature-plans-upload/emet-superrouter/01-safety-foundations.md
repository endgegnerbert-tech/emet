# Phase 1: Safety Foundations and Non-Negotiable Guardrails

## Goal

Make sure future ML cannot weaken high-risk behavior.

## Best-practice decision

ML can recommend; guardrails can veto. High-risk rules stay deterministic.

## Guardrail domains

Always preserve rule-first handling for:

```text
security / CVE / vulnerability
medical
legal
finance
version / changelog / migration
official docs required
package security advisories
privacy-sensitive inputs
```

## Runtime decisions

Before any learned model:

1. Detect high-risk domain flags.
2. Detect recency/version sensitivity.
3. Detect source-authority requirements.
4. Detect whether the user asks for current facts.
5. Set minimum evidence requirements.

## Labels to log

```text
guardrail_flags:
  security_sensitive
  medical_sensitive
  legal_sensitive
  finance_sensitive
  version_sensitive
  recency_required
  official_source_required
  primary_source_required
```

## Acceptance criteria

- Existing high-risk tests still pass.
- ML cannot downgrade `security`, `papers`, `specs`, `changelog`, or official-doc requirements to generic `web` unless confidence and calibration allow it and a guardrail accepts it.
- Every guardrail decision is trace-logged.

## Not in scope

- No TRM/HRM here.
- No model should override safety rules in this phase.
