---
name: end-work
description: Close an owner-merged Delivery with the numbers from the plan and the event log, a compact retro, and safe worktree cleanup. Use after merge; never commits.
---

# End Work

This skill needs only the merged plan, Git, the planctl tools and the PR.
It never commits and never merges.

1. Call `progress` with the plan: the Delivery reads merged, and the screen
   names the merge state and the published head. Record the PR URL. If the
   owner has not merged, stop here; the merge is theirs.
2. Take the numbers from the plan's Results rows (active and elapsed minutes
   per Task against the forecast) and from `planctl stats --since <plan date>`:
   where the agents stopped and why, submit rounds, Task time against
   forecast, time waiting for the owner, PRs and CI runs per Delivery.
3. Post one compact retro on the PR: what shipped, scope drift, estimate
   misses, duplicated work or testing, and one small process experiment for
   the next plan. Say whether parallel Stages shortened the critical path.
4. Prove the feature worktree is clean and its branch merged, then remove
   that worktree and only its registered temp roots.
5. Return the PR URL and the cleanup result.
