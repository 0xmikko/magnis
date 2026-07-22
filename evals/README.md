# Evals

The Magnis memory layer is measured, not asserted. This directory holds the public, reproducible evals — fixed seeds, committed fixtures, raw runs next to the notebooks.

## Published

*(Landing this week — the harness and result sets are being ported from the internal repo.)*

1. **Cross-session entity resolution** — can an agent keep durable identity across sessions and channels? Headline: promoted-link recall **0.63–0.80** across seeded runs, against a baseline that is structurally 0 (a model without memory cannot recall across sessions at all — which is why we also publish the non-trivial baselines below). Includes **cross-engine memory transfer**: memory written by one model, read by another.
2. **Communication QA** — gold-labeled questions over a seeded company workspace, run under four conditions: no memory, long-context stuffing, vector RAG, and the Magnis graph. Metrics: answer accuracy, unsupported-claim rate, provenance correctness, tokens and latency per query.

## Principles

- The trivial baseline is named as trivial, by us, first.
- Comparisons are against methods (long-context, vector RAG), never named products.
- Every number is scoped precisely and traceable to a committed raw run.
- Failure galleries are published alongside the wins.
