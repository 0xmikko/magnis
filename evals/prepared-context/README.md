# Prepared Magnis vs direct provider search

## A controlled synthetic development study

- **Status:** single-seed development evidence, not a population benchmark
- **Run date:** July 26, 2026
- **Model:** `gpt-5.6-sol`, `high` reasoning effort
- **Primary budget:** 60 completed tool calls per evaluation

## Abstract

We tested the same Codex model on four difficult business questions over
synthetic email, Telegram, contacts, and X records. In the baseline arm, Codex
worked directly through provider MCPs. In the treatment arm, the same providers
had first been ingested through the normal Magnis source → modules → graph path,
then organized into reusable, provenance-bearing state before the question was
asked.

Within a fixed 60-call evaluation budget, prepared Magnis completed **4 of 4**
P1/P2/P3/P5 tasks; direct provider search completed **1 of 4**, and Magnis used
**63–95% fewer task-time tool calls** on the three tasks it converted from
failure to pass. This is single-seed development evidence, not a population
benchmark: P2 was calibrated, P3 was a tie, P5 was not a token or latency win,
and no multi-seed holdout has been run.

> **One-sentence summary:** With the same model and a fixed 60-call budget,
> prepared Magnis completed 4/4 hard multi-source tasks while direct provider
> search completed 1/4, using 63–95% fewer tool calls on the three tasks it
> converted from failure to pass.

## Result

PASS requires the exact task answer, required evidence, and no more than 60
completed tool calls. “Content correct, budget FAIL” means the model eventually
returned the right answer, but only after crossing the same declared limit used
for both arms.

| Task | Direct provider search | Prepared Magnis | Calls: Direct → Magnis | Input tokens: Direct → Magnis | Time: Direct → Magnis |
|---|---|---|---:|---:|---:|
| P1 — current employer | FAIL budget; content correct | **PASS** | 158 → 8 (−94.9%) | 375,583 → 236,238 (−37.1%) | 87.8s → 52.4s (−40.4%) |
| P2 — account acquisition cost | FAIL budget; content correct | **PASS** | 150 → 10 (−93.3%) | 546,430 → 406,667 (−25.6%) | 107.9s → 59.1s (−45.3%) |
| P3 — unanswered humans | **PASS** | **PASS** | 34 → 42 (+23.5%) | 170,431 → 571,274 (+235.2%) | 90.8s → 146.1s (+60.8%) |
| P5 — warm relationship | FAIL budget; content correct | **PASS** | 84 → 31 (−63.1%) | 239,519 → 624,497 (+160.7%) | 90.5s → 94.5s (+4.5%) |

The observed development-set difference is **+75 percentage points**:
4/4 versus 1/4. It is a descriptive result over these four cells, not a
population estimate or a confidence interval.

## Research question

The product hypothesis was originally framed as:
*Graph substrates for question answering over multi-source personal corpora*.
Its central claim is:

> A graph is a cache of semantic links: expensive inference paid once, off the
> critical path, then delivered to the model as a compact fact with its evidence
> attached instead of as the documents from which it was reconstructed.

This matters because search results consume the same context window needed for
reasoning. Long or irrelevant context can degrade model performance even before
the formal context limit is reached:

- Chroma, [Context Rot](https://www.trychroma.com/research/context-rot), 2025;
- Liu et al., [Lost in the Middle](https://arxiv.org/abs/2307.03172), 2023;
- Shi et al.,
  [Large Language Models Can Be Easily Distracted by Irrelevant Context](https://arxiv.org/abs/2302.00093),
  2023.

The study therefore tests an end-to-end product question:

> With the model, provider records, task wording, and task-time budget held
> fixed, can prepared Magnis complete difficult business tasks more reliably
> than the same model reconstructing the answer directly from provider APIs?

This is a comparison of the prepared Magnis product with direct provider search.
It is not a graph-data-structure ablation: Magnis includes normal ingestion,
graph-backed state, retrieval, provenance, memories, hypotheses, and the full
product MCP surface.

## Why these tasks

The P1–P5 taxonomy separates business questions by the relationship that must
be reconstructed.

| Family | Business question | Required structure | Pilot status |
|---|---|---|---|
| P1 | Where does this person work now? | old email identity → chat alias → opaque social handle → later employer | Run |
| P2 | What did winning this account cost? | company rename → person → event/venue/dates → exact card rows | Run |
| P3 | Who wrote and received no reply anywhere? | provider accounts `E` → humans `H = E/~` → cross-channel reply state | Run |
| P4 | What did we pay an exact-name vendor? | literal exact-key filter; no semantic join | Control, not run in this pilot |
| P5 | Who can introduce us at this company? | current affiliation → identity bridge → relationship → team owner | Run |

P4 is intentionally excluded from the 4-task development result. It is an
exact-key validity control for a later frozen benchmark and should not produce a
Magnis advantage.

The difficulty is not a hop count alone. An opaque 64-hop labelled chain can be
easy when every transition is explicit. These tasks combine:

1. a latent relationship not represented by one shared key;
2. evidence split across authorized sources;
3. plausible stale or near-match evidence;
4. a decisive record buried deep in a long source;
5. a semantic link that can be prepared once and reused later.

## Experimental design

### Arms

```text
One frozen synthetic provider world
├── Direct: fresh Codex context → provider MCPs → deterministic scorer
└── Magnis: normal ingest → generic preparation → fresh Codex context
            → provider MCPs + full Magnis MCP → deterministic scorer
```

Both arms used:

- the same `gpt-5.6-sol` model and `high` reasoning effort;
- the same task prompt and output schema;
- the same frozen logical provider records;
- fresh, isolated Codex context and writable workspace for every evaluation;
- no web search, prior knowledge, fallback model, answer-key tool, or LLM
  judge;
- the same 60-call task-time budget.

The direct arm had ordinary provider access and a writable workspace, but no
prebuilt semantic state. The Magnis arm added the complete Magnis MCP and state
prepared before the task. This asymmetry is the product feature being measured,
not an accidental restriction.

The packaged corpora contain the answer key for audit. The model processes did
not receive filesystem access to those files; records were exposed through the
provider interfaces.

### Preparation

The frozen initial preparation instruction was:

> Inspect all connected sources and create whatever durable organization would
> best support later, unspecified business questions. Do not answer a task.

It contains no task, person, company, route, or answer. Evaluation ran in a fresh
model context after preparation.

P2 has one disclosed exception. The first generic preparation indexed
communication and X profiles but did not finish two 5,000-post timelines.
Prepared Magnis then also failed P2's budget at 108 calls. After observing that
failure, the preparation contract was refined generically to require terminal
pagination of every X timeline and durable current-affiliation, company-rename,
identity, and provenance links. It did not name Helio, Asteria, a task, or a gold
answer. The fresh P2 evaluation then passed in 10 calls.

P2 is therefore a **calibrated development result**, not an unseen holdout. The
initial failure and both preparation costs remain in the machine-readable
record.

### Datasets

The corpora are deliberately synthetic challenge sets. They locate a boundary
where distributed identity and context volume can matter; they are not claimed
to be a random sample of company workloads.

| Corpus | Tasks | Provider records | Deep signal | Minimal oracle route |
|---|---|---:|---:|---:|
| P1 | P1 | 1,000 email + 1,000 Telegram + 100 X profiles + 5,000 X posts | X rank 4,817 | 52 calls |
| P235, seed 23501 | P2, P3, P5 | 1,396 email + 604 Telegram + 3 X profiles + 10,000 X posts | P2/P5 X rank 4,817 | P2 56; P3 24; P5 53 calls |

Every gold record remains reachable through provider APIs below the 60-call
limit for an oracle that already knows the route. The task is difficult for an
agent because it must discover that route amid plausible history.

Each dataset directory contains:

- `world.json.gz`: provider world, route metadata, and audit gold;
- `magnis-corpus.json.gz`: the lossless ingestion projection, without the gold
  answer key;
- `manifest.json`: record counts, signal depth, oracle route length, and
  canonical JSON payload digests.

Manifest payload digests cover `JSON.stringify(payload)` without the final file
newline. `SHA256SUMS` covers the exact compressed files, prompts, schemas, and
result artifacts committed here.

### Budget enforcement

The monitor terminates a run after observing the first completed call beyond
60. Codex can issue calls concurrently, so already in-flight requests may finish
before termination. This is why budget failures record 84, 150, or 158 observed
calls rather than exactly 61. The same rule was used for both arms, and a correct
answer produced after the boundary remains a task FAIL.

The count includes completed MCP calls, shell-command events, and file-change
events. The published receipts match those event-level counts exactly.

### Deterministic scoring

There is no LLM judge.

- P1 requires the exact current employer and an evidence ref that resolves to
  the exact provider record.
- P2 requires exact currency, total, arithmetic, row set, row amounts, and
  connection evidence.
- P3 scores equivalence classes of provider accounts as humans; the exact human
  set, names, accounts, and evidence must match, with no duplicated account.
- P5 requires the exact person, current company, relationship facts,
  relationship owner, and evidence.

P2/P3/P5 scoring is implemented in
[`scorer/p1-p5-scorer.ts`](./scorer/p1-p5-scorer.ts) and
covered by deterministic tests. P1 evidence resolution was checked
deterministically against the graph entity's source external ID.

## Task-level findings

### P1 — current employer across four semantic transitions

The task asks where “Vasya from our Orion migration correspondence” works now.
The path is:

```text
old Northwind email
→ “Vasya P.” in launch-ops Telegram
→ opaque handle @dockside_4417
→ later X announcement: Aster Vale Systems
```

The X timeline contains 5,000 posts; the decisive post is rank 4,817. Most
records continue to support the stale Northwind affiliation.

Direct provider Codex paginated the long timeline and eventually returned the
exact employer and provider ref, but crossed the budget at 158 observed calls.
Prepared Magnis returned a graph entity in 8 calls; deterministic `graph.get`
resolution mapped it to the same provider ref,
`x:post:dockside-new-role`.

At task time, Magnis used 94.9% fewer calls, 37.1% fewer cumulative input tokens,
and 40.4% less wall time.

### P2 — exact cost of winning an account

The required route is:

```text
Helio Systems
→ former name HelioWorks
→ Mira Chen
→ Forge Summit at Glasshouse Annex
→ trip dates
→ exact corporate-card notification emails
```

Gold is exactly:

| Provider ref | Amount |
|---|---:|
| `email:card-rail` | €186 |
| `email:card-hotel` | €294 |
| `email:card-venue` | €420 |
| **Total** | **€900** |

Both arms eventually produced the exact rows, total, arithmetic, and evidence.
Direct search failed only the call budget at 150 observed calls. After the
disclosed generic timeline refinement, prepared Magnis passed in 10 calls:
93.3% fewer calls, 25.6% fewer input tokens, and 45.3% less time.

The main development finding is operational: “prepared” must mean that long
sources were processed to completion. A profile-level census was insufficient.

### P3 — unanswered humans across channels

P3 asks over humans, not accounts. It includes a Telegram reply that suppresses
an apparently unanswered email, multiple accounts belonging to one person, a
near-name distractor, and no disclosed answer cardinality.

Both systems returned exactly Nora Venn and Pavel Rook with 100% human recall,
precision, and evidence recall. Direct search used fewer calls, fewer tokens,
and less time. This level is a ceiling tie and is not evidence for Magnis.

A future P3 ladder should increase only the predeclared enumeration axis until
the ideal direct route approaches the fixed budget, while preserving identities,
gold, prompt, and scorer.

### P5 — warm relationship and relationship owner

The route is:

```text
Asteria Grid
→ current Celia Ortiz announcement
→ @cel_orbit
→ stale Orbit Studio identifiers
→ personal thread with Hana Ward
```

Both systems found Celia Ortiz, her current company, the former design-partner
relationship and recent personal catch-up, Hana Ward as relationship owner, and
all required evidence. Direct search crossed the budget at 84 calls; prepared
Magnis passed at 31.

This is specifically a PASS/call-budget advantage. Magnis used 160.7% more input
tokens and 4.5% more wall time in this run, so P5 does not support a token or
latency claim.

## Preparation cost and amortization

Preparation is outside the task-time budget because the hypothesis is reuse:
organize the corpus once, then answer later questions against the durable state.
The cost is real and is reported rather than subtracted.

| Preparation | Calls | Input tokens | Time | Durable output |
|---|---:|---:|---:|---|
| P1 generic preparation | 187 | 1,616,793 | 382s | 15 graph links plus provenance-backed registries |
| P235 initial generic preparation | 152 | 1,221,540 | 356s | 44 relationship/evidence links |
| P2 generic timeline refinement | 188 | 1,374,465 | 307s | 101 X pages and 34 graph links |
| P2 cumulative prepared state | 340 | 2,596,005 | 664s | initial state + complete X census |

For one isolated question, this study does not claim lower total compute after
preparation. The economic claim requires repeated questions over changing but
overlapping corpora; amortization remains to be measured.

## Calibration and negative results

The following observations are retained because they narrow the claim:

- At 1,000 X posts, direct provider Codex passed P1 in 32 calls. That level was
  a ceiling and could not distinguish the systems.
- An ingested but unprepared graph did not win P1. Both systems exceeded the
  budget because the model fell back to raw pagination.
- P2's initial generic preparation was incomplete and failed the budget at 108
  calls. The published P2 PASS followed the disclosed generic refinement.
- P3 was PASS/PASS, with direct provider search more efficient.
- Infrastructure failures before a model turn were rejected rather than scored
  as model failures.

These observations support a narrower mechanism: the advantage appears when
Magnis has reusable, provenance-bearing links prepared before a question that
would otherwise require long cross-source reconstruction. Attaching a graph tool
or increasing corpus size alone is not sufficient.

## What the study supports

- There exists a realistic class of distributed-identity business tasks where
  prepared Magnis materially reduces critical-path search.
- On these fixed corpora, Magnis changed three exact but over-budget answers
  into exact in-budget answers.
- The observed mechanism is consistent with cached cross-source identities,
  current-state links, and evidence-bearing retrieval.
- A simpler P3 level did not benefit and provides a visible negative control.

## What it does not support

- A general “Magnis is 75% better” statement.
- A population success rate or statistical significance claim.
- A graph-only causal effect separated from every other Magnis component.
- A general token or latency advantage.
- Lower total compute for a single question after charging preparation.
- An unseen P2 holdout result.

The next confirmatory study should freeze the refined preparation contract
before generation, hash at least three unseen seeds, run every attempted ladder
level, add the P4 exact-key validity gate, and publish all paired cells without
changing prompts, scorers, or product behavior after seed freeze.

## Audit and reproduction

Repository contents:

- [`datasets/p1`](./datasets/p1/) and
  [`datasets/p235`](./datasets/p235/): frozen corpora and manifests;
- [`prompts`](./prompts/): exact preparation/evaluation prompts and output
  schemas;
- [`results/p1.json`](./results/p1.json) and
  [`results/p235.json`](./results/p235.json): answers, scores, costs, and hashes
  of the receipts/event logs;
- [`runs`](./runs/): compressed Codex JSONL event streams and run receipts for
  every reported preparation and evaluation;
- [`SHA256SUMS`](./SHA256SUMS): exact package checksums;
- [`scorer/p1-p5-scorer.ts`](./scorer/p1-p5-scorer.ts) and
  [`scorer/__tests__/p1-p5-scorer.test.ts`](./scorer/__tests__/p1-p5-scorer.test.ts):
  deterministic task scoring and tests.

Verify the published package:

```bash
cd evals/prepared-context
sha256sum --check SHA256SUMS
gzip --test datasets/p1/*.json.gz datasets/p235/*.json.gz
find runs -name '*.jsonl.gz' -exec gzip --test {} +
gzip --decompress --stdout datasets/p1/world.json.gz | jq empty
gzip --decompress --stdout datasets/p235/world.json.gz | jq empty
bunx vitest run --config vitest.config.ts
```

No Magnis product code was changed for this study. Changes are limited to the
deterministic scorer and tests, frozen synthetic data, prompts,
machine-readable results, raw run artifacts, and this report.
