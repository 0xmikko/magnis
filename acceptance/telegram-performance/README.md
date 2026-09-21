# Telegram performance acceptance

This directory owns the provisioned Telegram Source-to-Graph acceptance stand.
It is deliberately outside every catalog and app test discovery pattern: the
run requires this catalog checkout, an explicit `magnis-app` worktree and a
native PostgreSQL server supplied by the caller.

Check that the selected app worktree has the expected boundary and no files
that the runner would overwrite:

```bash
bun acceptance/telegram-performance/run.ts \
  --check \
  --app-root /absolute/path/to/magnis-app-worktree
```

Run and print the two scenarios' timing evidence:

```bash
bun acceptance/telegram-performance/run.ts \
  --app-root /absolute/path/to/magnis-app-worktree \
  --database-url 'postgresql://postgres@localhost/postgres'
```

The runner builds the current catalog, generates exact commit/SDK/module pins,
temporarily injects only the acceptance sources and Telegram module fixture,
calls the app's `agent:test:backend` adapter for the two named files, and removes
every injected file in `finally`. It refuses an app worktree where any target
already exists. Nothing here is part of normal CI.
