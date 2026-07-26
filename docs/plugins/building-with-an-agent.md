# Building a plugin with an agent

The rest of these docs describe the plugin contract for a person writing
the code. This one describes the other way to build a plugin: **describe
the integration in a sentence and let an agent build it.** The agent
reads the same docs, uses the same scaffolders, and is held to the same
conformance gate you would be — so what it ships is a normal plugin, not
a lesser one.

This is not a demo trick. We measured it: see the
[integration-authoring eval](../../evals/integration-authoring/README.md).
An agent with the authoring skills builds a correct, idempotent,
well-linked, consumer-usable integration from one sentence, and the
skills measurably raise the quality of what it produces.

## The one sentence

Everything below was produced from exactly this prompt, with no
follow-up:

> Integrate GitHub as a fixture-replay source providing a `github`
> surface, plus a github module consuming it: repository and issue
> entities; facets repo.details (name, owner) and issue.details (title,
> state, number, created_at, repo_id); a link issue→repository
> (in_repo); tools list (issues, newest first) and get (issue by id,
> including its repository name). Auth: none. Fixture-only.

You do not have to write it that precisely. That is what the interview
step is for.

## How the agent works, step by step

The agent follows a fixed spine. Each step maps to a rule already in
these docs; the skill just makes the agent do them in order and refuse
to skip.

1. **Interview.** The agent turns a vague request into the five answers
   a plugin needs: which service, does data flow *in* (→ a source) or is
   this a new graph domain (→ a module) or both, which entities and
   facets, which tools, and what auth. Anything the request already
   answers is not asked again.

2. **Shape.** It decides source, module, or the pair, and fixes the one
   piece of shared vocabulary that couples them: the **surface** noun
   (here, `github`), declared identically on both ends. It picks the
   closest reference implementation to copy — for a two-entity module
   consuming a surface, that is `x` + `mock-x`.

3. **Design, in writing, before any code.** Entities, facets (with the
   required fields and any canonical mappings), the link kind, the
   envelope payload shape, and the `remote_id` scheme — written down and
   checked against [module.md](./module.md) / [source.md](./source.md)
   first. This is where a good integration is won or lost.

4. **Scaffold.** `scripts/source-new.ts` and `scripts/plugin-new.ts`
   generate a conformant skeleton. The scaffolder is the executable form
   of [structure.md](./structure.md); its output passes the gate
   untouched, so the agent never hand-assembles boilerplate.

5. **Red tests first.** The agent writes the failing tests that capture
   each invariant — idempotent ingest, correct links, newest-first
   ordering, named errors on bad input — and records that they fail on
   the scaffold before writing any behavior. A test that passes
   immediately is rewritten; it did not capture the invariant.

6. **Implement to green, then the gate.** It fills in the ingest handler
   and the tools, then runs `bun run gate` — typecheck, lint (zero
   warnings), tests, connector replay, build, catalog index, and the
   conformance checker — and loops until every lane is green.

7. **Adversarial review (the family skill only).** Independent reviewer
   agents attack the result for coverage, coherence, and
   over-engineering. The author gets one batch to fix or justify each
   finding; the reviewers re-check a frozen snapshot. This is the step
   that most raises quality — and the one that costs the most.

## What each layer of instruction buys

You can run the agent with more or less scaffolding. The eval compares
four configurations on the same task; the short version:

- **No skills** — the model still finds the scaffolders and reference
  code on its own and produces a passing integration. But it is the
  lowest-quality output measured, and it tends to paper over missing
  data with fabricated defaults instead of surfacing the error — a
  violation of the [no-fallbacks rule](./structure.md) the gate does not
  catch.
- **Docs pointer** — "read the authoring docs first" is the single
  biggest quality lift: cleaner data models, better tests, fewer
  shortcuts.
- **One skill** (`/new-integration`) — the interview→gate spine in one
  file. Cheapest reliable path; the recommended choice for an expert on
  a familiar shape.
- **The skill family** — adds per-kind acceptance criteria and the
  adversarial review stage. Highest measured quality, highest cost. The
  default for contributions we will merge, because it bounds the worst
  case.

## What you get out

Two normal packages — `plugins/sources/github/` and
`plugins/modules/github/` — that pass the same gate every hand-written
plugin passes, plus the tests the agent wrote. You review a pull
request, not a black box. The full authoring contract those packages
satisfy is the rest of this directory; this guide only changes *who
holds the pen*.
