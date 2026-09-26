---
name: blueprint-start
description: Execute an approved plan through the planctl tools, one Task-scoped TDD loop and one work commit per Stage, then deliver the PR. Use when implementation begins.
---

# Blueprint Start

The approved plan defines scope; the planctl tools own its state; the
package.json scripts named agent:* own every project command. The plan file
is never edited by hand.

## Start

1. Work in the plan's existing feature worktree. Call `progress` with the
   plan: it shows the Goal, the active Delivery beside the whole plan, the PR
   and CI it observes, and the next eligible Task. The plan must be APPROVED.
2. Merge the base branch into the feature branch without rewriting history,
   then run `bun run agent:install`.
3. Different agents may implement Stages in parallel only when the plan
   declares disjoint writes. Each returns one commit; child agents never
   change the plan.

## Task loop

1. Call `start_task` with the plan. Without a Task it returns the running
   Task or starts the next one in Stage-graph order; with a Task it starts
   that one, also a completed Task of an unmerged Delivery for repair. The
   brief is the frozen scope: the Goal first, then the story, the folders, the
   How and the RED command. A `checkpoint` saves one line on the record.
2. Add the named behavior test and run the RED command from the brief.
   Observe RED for missing behavior, not syntax, dependencies or environment.
3. Implement the minimum change, rerun the same command GREEN, then run only
   the tests covering the changed files and the project's typecheck.
4. Review the diff for the declared folders, reuse, duplication and accidental
   fallbacks. Never run a full suite, cops or review-implementation for a
   Stage or commit. Remove the registered `.tmp/code-production/...` Stage
   root.
5. Create one conventional work commit for the Stage. Never bypass hooks;
   `agent:verify:commit` belongs to the managed pre-commit hook.
6. Call `complete_task` with the plan, the Task IDs of that commit, the
   commit and one result sentence; deviations are optional lines. Paths,
   times, planned tests and the temp root are derived. Only a file outside
   the Stage folders, a protected path the Task did not name, or an exported
   type the SPEC does not declare refuses.
7. Call `close_stage` with the Stage: it runs each machinable criterion once
   and, on the last Stage of a Delivery, writes the Ledger line. Show the
   owner the reply. Plan changes ride the next work commit; the last ones use
   one closure commit.
8. Continue with `start_task` until nothing is eligible.

A question only the owner can answer goes through `needs_owner` before you
ask it, as the form: what this is about, the options with their consequences,
your recommendation and the form of the answer. Ask with those four parts.
After the answer call `resume_task`. Do not infer an owner obligation from
transcript punctuation or a terminal turn. After a context compaction, call
`progress` first; a running Task continues from its checkpoint.

If scope changes, `amend` under the owner's word. Resolve missing
implementation details with the smallest reversible decision and record it
with `add_deviation`. A deviation does not authorize extra work; if the
limits prevent completion, report the conflict instead of expanding the
Task. Time overrun alone is not a reason to stop.

## Deliver

1. Run `bun run agent:install`, then `.githooks/pre-push` once. Do not compose
   framework commands or invoke another package manager directly.
2. Push the exact green head. CI independently verifies the published SHA;
   `progress` shows the PR, the CI run and the merge state.
3. Fix a real CI failure locally with its exact command before one new push.
   When green, mark the PR ready.
4. Return the PR URL and the plan URL from the last reply. The owner merges.

review-implementation runs only at the owner's request, once at the end of
the whole plan, after local checks and CI are green and the PR is ready. Fix
its findings with typecheck and the tests covering changed files; do not
start another review round.

After a check fails, rerun that check. Reuse passing checks unless later
changes affect what they verified.
