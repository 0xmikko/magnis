# Vocabulary of the process

One name per thing. The first column is the word the instructions and the plans use;
the last column lists words that mean the same thing here and are therefore not used.
The instruction audit refuses a word from the last column in prose and names the term.
A project keeps its own page in the same shape (Magnis: `docs/graph.md`), and a plan's
names are checked against both.

| Term | What it names | Not |
|---|---|---|
| plan | one Markdown file in `docs/plans/`, the owner's contract with the agent | blueprint document |
| SPEC | the hand-written part of a plan the owner approves first | specification section |
| Delivery | one branch and one pull request of a plan | lane |
| Stage | one commit of a Delivery, with its description as the commit message | phase |
| Task | one change inside a Stage, a story and its writes | ticket |
| writes | the files, directories or globs a Task or Stage changes | write set |
| Stage result file | `stage-result.json`, what `complete-task` imports | receipt |
| the hook's record | the head SHA the pre-push hook stores after a green gate | verify-pr receipt |
| gate | the check a commit or a push must pass | ceremony |
| suite | one project's tests run by an `agent:test:<name>` script | plane |
| dev server | a running backend an agent or the owner uses by hand | stand, farm |
| message | what crosses a process boundary | envelope |
| rule | what a law or the screen says an agent does | doctrine |
| count | a number the audit or a plan reports | census |
| measure | the number a goal is stated in, with today's value and the target | currency |
| owner's word | the owner's explicit approval, journaled by planctl | sign-off, blessing |
| Deviations line | one recorded shortfall in the plan's Execution log | drift entry |
