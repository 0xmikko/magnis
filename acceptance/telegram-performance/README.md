# Live Telegram performance stand

This is a manual stand for measuring the real Telegram-to-Graph path. It lives
in `magnis`, starts an explicitly selected clean `magnis-app` worktree, and is
outside every catalog and app CI discovery pattern. It never enables a fixture
Telegram transport.

The persistent data root owns PostgreSQL and the encrypted Telegram session.
Authenticate once in the UI. Later runs may reset synchronized data and sync
progress while retaining `secrets`, `source_credentials`,
`source_connections`, and `source_accounts`.

## Select the app branch

Checkout the app branch in its own normal worktree, then verify the exact
branch and commit that the stand will run:

```bash
bun acceptance/telegram-performance/run.ts check \
  --app-root /absolute/path/to/magnis-app-worktree
```

The selected app worktree must be clean. The app dev launcher runs the backend
from that worktree's source. The runner also builds the current clean `magnis`
checkout into the stand's private catalog channel.

## First run and authentication

```bash
bun acceptance/telegram-performance/run.ts start \
  --app-root /absolute/path/to/magnis-app-worktree \
  --data-root /absolute/path/to/telegram-performance-data \
  --port 3261 \
  --indexer off \
  --env-file /absolute/path/to/magnis-app.env
```

`--env-file` is optional when the required deployment values are already in
the environment. Open the printed frontend URL and connect Telegram. Stop the
stand with Ctrl-C; PostgreSQL stops but its data and encrypted session remain.

The runner refuses `TELEGRAM_FIXTURE_FILE`: measurements must use the real
provider. Stop immediately on a Telegram FLOOD/auth error; this is not a load
generator or a way to probe provider limits.

## Measure another clean synchronization

First print the current run while its marker still identifies the selected
commit:

```bash
bun acceptance/telegram-performance/run.ts report \
  --data-root /absolute/path/to/telegram-performance-data
```

The report sums the backend's production `sync turn` records after this start:
turns, envelopes, inserted/removed rows, provider fetch time, Graph admission
time, overlap, observed wall time, and envelopes per second. It does not infer
speedup; compare two reports from equivalent live runs.

Stop the stand, then clear only sync output and progress:

```bash
bun acceptance/telegram-performance/run.ts reset \
  --app-root /absolute/path/to/magnis-app-worktree \
  --data-root /absolute/path/to/telegram-performance-data
```

Start again with the same data root. Telegram authentication is reused. To
measure another app branch, pass that branch's clean worktree as `--app-root`;
no test or live provider call is added to CI.

`--indexer on|off` is required for every start. It sets the backend's existing
`MAGNIS_DISABLE_INDEXER` switch explicitly and records the chosen mode in the
run marker, so reports from the two modes cannot be mistaken for each other.
