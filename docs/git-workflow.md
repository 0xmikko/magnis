# Git workflow

How code flows in the Magnis plugin catalog. All contributors and automation
follow this.

## Branches

| Branch | Purpose | Commits | Merge |
|--------|---------|---------|-------|
| `main` | Published catalog — what the core pins and what the world sees | **NEVER direct** | PR from `staging` only |
| `staging` | Integration — all work lands here | via feature-branch merge | maintainer merges feature branches |
| `feat/*`, `fix/*`, `docs/*`, `ci/*` | Implementation | yes | → `staging` |

## Golden rules

1. **Never push to `main`.** `main` moves only by a reviewed PR from `staging`.
   The pre-push hook blocks direct pushes; GitHub branch protection enforces it
   server-side. This is what keeps the published catalog clean.
2. **Never commit directly to `staging` or `main`.** Work on a feature branch,
   then merge to `staging`. The pre-commit hook blocks commits made while
   `staging`/`main` is checked out.
3. **Every commit is green.** The pre-commit hook runs the full non-visual gate
   (below). A red gate blocks the commit — fix it first, no `--no-verify`.
4. **No "pre-existing" exceptions.** No skipped tests, no weakened assertions,
   no `eslint-disable` without a documented reason. `staging` is green at all
   times.

## The gate (pre-commit runs all of it)

```bash
bun install --frozen-lockfile
bun run typecheck        # modules + sources + packages + scripts
bun run lint             # eslint
bun run test             # vitest
bun run test:connectors  # every source connector suite
bun run test:scripts     # tooling
```

## Implementation loop (TDD)

For each unit of work:

1. Write the RED test — it must fail on current code. If it passes immediately,
   it doesn't capture the requirement; rewrite it.
2. Write the minimum code to make it green.
3. Run the full gate — no regressions.
4. Commit on the feature branch (conventional message, scope = plugin/package).

## Landing work

```bash
# on a feature branch off staging
git switch -c fix/<topic> staging
# … RED → GREEN → gate green → commit …

# integrate (maintainer):
git switch staging
git merge --no-ff fix/<topic>
git push origin staging          # staging CI runs

# publish (maintainer, when a release is cut):
#   open PR staging → main, review, merge. main CI + catalog publish run.
```

Resolve merge conflicts on the feature branch (merge `staging` in), never on
`staging` or `main`.

## Commit messages

Conventional Commits; scope matches the directory touched.

```
feat(sources): telegram push listener surfaces FLOOD_WAIT as -32002
fix(connector-sdk): cursor round-trips arbitrary JSON verbatim
docs: plugin authoring guide
ci: run the gate on staging pushes
```
