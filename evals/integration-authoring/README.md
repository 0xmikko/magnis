# Eval: integration authoring by an agent

**Question.** Can an agent build a working Magnis integration from one
sentence — and do the authoring *skills* make what it builds better, or
does the underlying model already suffice?

This eval is unusual in one way worth stating up front: the headline is
not "the agent succeeds." Every configuration we tested succeeds at the
mechanical bar. The interesting result is what a **blind quality review**
sees that a passing test suite cannot — and there the configurations
separate cleanly.

## Setup

One fixed task: integrate GitHub as a fixture-replay **source** plus a
consuming **module** — two entities (repository, issue), two facets, one
`in_repo` link, and `list` / `get` agent tools. Fixture-only, no auth.
The task is new: no skill revision was ever calibrated against it.

Four **configurations**, each a fresh agent on a fresh clone, varying
only the instructions available:

| Config | What the agent has |
|---|---|
| **A0 — no skills** | the repo + its tooling, nothing else |
| **A1 — docs only** | the same, plus "read the authoring docs first" |
| **A2 — one skill** | the single `/new-integration` skill |
| **A3 — skill family** | orchestrator + per-kind skills + an adversarial review stage |

Each ran **three times** (12 runs; 11 valid — one no-skill run was
excluded after it reconstructed the deleted skills from git history,
which later runs' orphan-snapshot isolation prevented). Every run is
graded two independent ways.

## The two instruments

**1 — the mechanical gate (the prerequisite).** Five checks, all
pass/fail, against a **sealed oracle** the writers never saw (2
repositories, 5 issues, shuffled order, values fixed before any run) plus
an offline interface test-stand:

| Check | What it verifies |
|---|---|
| build | compiles, lints (0 warnings), own tests pass, packages build |
| conformance | legal manifest, namespace law, declared-surface handler, deterministic no-network replay |
| sealed data (×7) | entity counts, every sealed field on the right facet, one `in_repo` per issue, idempotent re-ingest, newest-first order, `get` resolves the repo name |
| contract probes (×8) | response shape, empty-graph, named errors, `limit`/`offset`, page non-overlap |
| consumer (×5) | a fresh agent, given only the tools, answers five sealed questions correctly |

**2 — the blind quality review (the discriminator).** Three independent
LLM judges score all 11 artifacts, **de-identified and shuffled**
(`artifact-01…11`; the arm map was sealed until after judging), on a
frozen five-dimension rubric (schema design, ingest robustness, interface
quality, test quality, idiomatic fit) plus a holistic 1–10.

## Result 1 — the gate is table stakes

All 11 valid runs pass all five checks. On outcome the four
configurations are **indistinguishable** — even the no-skill agent finds
the scaffolders and reference module unaided and writes failing tests
first. "It passes" does not tell the configurations apart, which is the
whole reason for a second instrument. (The trivial reading — "an agent
can do this at all" — is real but not the finding.)

Making the gate itself trustworthy took work: **six defects in the
oracle / test-stand** were found and fixed *before* any failure was
charged to a writer (the graders had encoded their author's own hidden
conventions — key shapes, id derivation, mock-id format — and four
independent writers surfaced them). Every fix regraded the writers'
unchanged code; all six are logged in the companion study.

## Result 2 — the quality review breaks the tie

The judges agree strongly with one another — pairwise Spearman on the 11
holistic scores: **0.86, 0.91, 0.93** — and the tie breaks
**monotonically in skill depth**:

| Config | Blind quality (mean 1–10) | schema | ingest | interface | tests | idiomatic |
|---|---|---|---|---|---|---|
| A3 — skill family | **7.8** | 4.1 | 4.0 | 4.3 | **4.4** | **4.6** |
| A2 — one skill | **7.1** | 3.8 | 4.1 | 4.2 | 3.9 | 4.0 |
| A1 — docs only | **5.9** | 3.6 | 3.7 | 3.4 | 3.3 | 3.2 |
| A0 — no skills | **4.2** | 2.8 | 2.2 | 2.8 | 3.0 | 2.5 |

Two findings give the ranking teeth:

1. **A real rule violation the gate cannot see.** Both no-skill
   artifacts fabricate default values for missing required fields
   (`owner ?? ""`, `number: 0`) instead of dropping the bad record — a
   direct breach of the codebase's **no-fallbacks** rule. All three
   judges caught it independently. The sealed oracle missed it because
   its fixtures are well-formed; the rule governs a *messy* feed, which
   the gate never exercises. A passing gate is not a quality guarantee.
2. **The family's extra cost lands where its review aims.** A3 beats A2
   on quality but *not* on interface (they tie, 4.3 vs 4.2). Its lead is
   in **test quality and idiomatic fit** — exactly the two dimensions its
   adversarial review stage checks. The review does what it claims; it
   just does not improve an interface the one-skill config already gets
   right.

## Cost, and where the skills fall short

Quality is not free and the skills are not finished:

- **A3 (family) is the most expensive by far** — roughly 2× the tokens
  and wall-clock of the one-skill config once its reviewer agents are
  counted, for a ~0.7-point quality gain over A2.
- **The review does not always converge.** In one run it hit its
  two-round cap still holding open (test-only) coverage findings and
  terminated with a stop-report rather than a clean sign-off — designed
  behavior, but it shows the review can out-demand its own budget.
- **A2 (one skill) is the efficiency sweet spot** — the same interface
  quality as the family, the cleanest runs, at half the cost.

## Verdict

The skills work — not perfectly, but they raise quality on a
machine-verifiable axis, and the gain grows with how much structure they
give the agent. We ship the **family as the default** (it bounds the
worst case — the no-skill floor ships a real rule violation; the family
does not) and recommend the **one skill for expert authors on
known-simple shapes**, where its efficiency wins and this eval shows
doing so is safe. Both are under active development; the review stage's
cost and convergence are what we are tuning next.

The methodological point: no single scorer settled this. A gate tells you
an integration is *correct*; a blind review tells you it is *good*. You
need both, and the distance between them is where the skills earn their
keep.

## Reproducibility

- **Task prompt** — frozen, identical for every run (quoted above).
- **Oracle & test-stand** — frozen before any run; the sealed dataset and
  the five checks are the same code for every arm.
- **Blind review** — rubric and de-identification fixed before judging;
  raw per-judge scores in [`data/`](./data/) and the sealed arm map in
  [`data/blind-review-arm-map.tsv`](./data/blind-review-arm-map.tsv).
- **Full pre-registered design**, per-run scores, the six adjudications,
  and the failure gallery: the companion study (internal), summarized
  here without loss of the numbers.

This eval follows the [directory principles](../README.md): the trivial
baseline ("an agent can do it at all") is named as trivial by us first;
the comparison is across instruction configurations, not against any
named product; every number is scoped and traceable to a committed run;
and the failures — the six grader defects, the no-skill rule violation,
the family's non-convergence — are published beside the wins.
