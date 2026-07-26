# Evals

Magnis is measured, not asserted. This directory holds the public, reproducible evals — fixed seeds, committed fixtures, raw runs next to the notebooks.

## Results

1. **Cross-session entity resolution** — can an agent keep durable identity across sessions and channels? Headline: promoted-link recall **0.63–0.80** across seeded runs, against a baseline that is structurally 0 (a model without memory cannot recall across sessions at all — which is why we also publish the non-trivial baselines below). Includes **cross-engine memory transfer**: memory written by one model, read by another (**0 → 0.71**).
2. **Communication QA** — gold-labeled questions over a seeded company workspace, run under four conditions: no memory, long-context stuffing, vector RAG, and the Magnis graph. Metrics: answer accuracy, unsupported-claim rate, provenance correctness, tokens and latency per query. *In progress.*
3. **[Integration authoring](./integration-authoring/README.md)** — can an agent build a working plugin from one sentence, and do the authoring skills make it better? A passing conformance gate is shown to be *table stakes* every configuration clears; a blind three-judge quality review breaks the tie **monotonically in skill depth** (mean quality **4.2 → 5.9 → 7.1 → 7.8** from no-skills → docs → one skill → the skill family, judge agreement Spearman **0.86–0.93**). Includes the sharpest finding: the no-skills output ships a real no-fallbacks rule violation the gate cannot see.

## Principles

- The trivial baseline is named as trivial, by us, first.
- Comparisons are against methods (long-context, vector RAG), never named products.
- Every number is scoped precisely and traceable to a committed raw run.
- Failure galleries are published alongside the wins.
