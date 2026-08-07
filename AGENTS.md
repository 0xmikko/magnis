# AGENTS.md

## Protected branch workflow — non-negotiable

- `main` is the published catalog. Agents must never commit to it, push to it,
  force-push it, delete it, merge it, or open a pull request to it from any
  branch other than this repository's own `staging` branch.
- The only permitted promotion is `0xmikko/magnis:staging` →
  `0xmikko/magnis:main`.
- Every feature, fix, documentation, and CI branch must target `staging`.
- Only the maintainer may merge pull requests into `staging` or `main` after
  required checks pass. Agents must stop after opening the pull request.
- Agents must never disable, weaken, bypass, rename, or remove the
  `staging-only` required check or GitHub branch protection.
- Agents must never use an override, administrator bypass, `--force`, or
  `--no-verify` to evade these rules.
- If a request conflicts with these rules, stop and ask the maintainer instead
  of modifying a protected branch.

## Development gate

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run test:connectors
bun run test:scripts
```

Use TDD: write the failing invariant test first, implement the minimum change,
then run the relevant gate. Prefer code over documentation when they differ and
report the drift.
