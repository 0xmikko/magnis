---
name: blueprint
description: Author one plan through the planctl tools and stop twice for the owner's word, first on the SPEC, then on the implementation contract. Use when work needs a plan.
---

# Blueprint

Produce one plan through the planctl tools. The plan file is never edited by
hand; every write returns the plan URL and a three-line reply, and you show
that reply to the owner verbatim.

## SPEC

1. Create `feat/<slug>` from the repository's base branch in its own
   worktree. Call `init` with `root` (the worktree) and a `title`. It creates
   `docs/plans/<date>-<slug>.md`, stages and journals it, and returns the
   required sections, the vocabulary and the Goal rule. Commit the plan.
2. Explore existing code before proposing new mechanisms. Agree on the Goal,
   the flows, the measures, the constraints, the reuse and the testable
   invariants. The SPEC says what will be; the past appears only as one
   sentence "now X" where X is being fixed.
3. Write the SPEC as one text with the returned sections, in the vocabulary,
   and send it with `submit_spec`: the plan, the `baseRevision` from `init`,
   the owner's request in their words, and the whole SPEC. The tool fixes
   line endings and vocabulary itself, returns every lint error at once with
   its line and replacement, and asks the model once about the changed lines.
   Fix the errors and resubmit with the returned revision; unchanged text
   calls nothing.
4. Show the owner the reply and stop. This is the first hard stop: ask
   whether they approve the SPEC.
5. After an explicit yes, call `approve_spec` with the owner's words.

Bad Goal: "Make development faster."

Good Goal: "Deliver one ready PR while measuring predicted versus actual
active time, elapsed time and credits; run the complete product gate once
locally and once on the published CI SHA."

## Implementation contract

1. One Delivery is one PR: `put_delivery` with its branch, dependencies,
   gate commands and description. Each Stage is one delegable result and one
   work commit: `put_stage` with its owner, profile, dependencies, parallel
   set, folders as writes, temp root, Tasks and criteria. Do not parallelize
   Deliveries by default.
2. A Stage description is the future commit message of the finished Stage:
   the subject line, then what was done for which Goal outcome and why this
   way, then how it is proven. Its title names the result, never branch
   history.
3. A Task story names one concrete change in at most 200 characters. Its
   writes are the files the change needs; a test may live anywhere. Never
   point to "the new files", "the rename map", "as discussed", chat history
   or a colleague's branch. Each Task carries one RED command in the form
   `bun run agent:test:<backend|frontend|e2e> -- <exact-target>` and its How.
4. A put refuses with every error of the submitted part at once, like a
   compiler, and returns the whole-plan findings: duplicate Task IDs, unknown
   dependencies, cycles. Fix and put again with the returned revision. The
   Stage forecast is the Task sum plus an explicit verification share.
5. Trace each acceptance story through public calls before approval. A
   public type the work will change belongs in the SPEC Interfaces; completion
   refuses an exported type the SPEC does not name.
6. Show the owner the last reply and stop. This is the second hard stop: ask
   whether they approve the complete plan.
7. After an explicit yes, call `approve_plan` with the owner's words. Approval
   runs the same lint the puts ran and finds nothing new.

Bad Stage: "Finish the colleague's branch: build fixes and Verify rewire."

Good Stage: "Restore the preview build after the Verify rename."

Bad Task: "Apply the rename map in the named files."

Good Task story: Restore `creditOperationMarket` in
`src/onchain/market/credit/index.ts`.

After approval, the plan changes only through the tools: `amend` under the
owner's word for scope, and `start_task`, `complete_task`, `add_deviation`
and `close_stage` for execution.
