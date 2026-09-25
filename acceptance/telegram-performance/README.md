# Live Telegram and Google performance stand

This is a manual stand for measuring the real Telegram- and Google-to-Graph
paths. It lives in `magnis`, starts an explicitly selected clean `magnis-app`
worktree, and is outside every catalog and app CI discovery pattern. It never
enables a fixture
provider transport. The existing `telegram-performance` path and command remain
the single stand for both Sources.

The persistent data root owns PostgreSQL and encrypted provider credentials.
Connect Telegram and Google once in the UI. Later runs may reset synchronized
data and sync progress while retaining `secrets`, `source_credentials`,
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
For an account connected on an earlier run, refresh the catalog and update its
installed Source in the app before measuring; rebuilding the catalog does not
replace an already installed package. Check the installed package digest, not
just the run marker.

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
the environment. Open the printed frontend URL and connect Telegram and Google.
Stop the stand with Ctrl-C; PostgreSQL stops but its data and encrypted
credentials remain.

The runner refuses `TELEGRAM_FIXTURE_FILE` and `GOOGLE_FIXTURE_FILE` in the
process environment, selected env file, or app `.env`: measurements must use
real providers. Stop on a provider hold or authentication error; this is not a
load generator or a way to probe provider limits.

## Measure another clean synchronization

First print the current run while its marker still identifies the selected
commit:

```bash
bun acceptance/telegram-performance/run.ts report \
  --data-root /absolute/path/to/telegram-performance-data
```

The report groups the backend's production `sync turn` records after this start
by Source and surface. Telegram has its own group; Google's email, meetings,
and contacts have separate groups. Each has turns, pages, bytes, envelopes,
inserted/removed rows, provider fetch time, Graph admission time, overlap,
observed wall time, and envelopes per second. The marker includes the exact app
and catalog branches and commit SHAs. Save the report as the manual receipt,
and note the observed provider holds and page settings alongside it. An absent
group means no recorded turn for that surface, not zero provider data. Compare
only equivalent live runs on the same account; the report does not infer a
speedup.

Stop the stand, then clear only sync output and progress:

```bash
bun acceptance/telegram-performance/run.ts reset \
  --app-root /absolute/path/to/magnis-app-worktree \
  --data-root /absolute/path/to/telegram-performance-data
```

Start again with the same data root. Telegram and Google authentication is
reused. To measure another app branch, pass that branch's clean worktree as
`--app-root`; no test or live provider call is added to CI.

`--indexer on|off` is required for every start. It sets the backend's existing
`MAGNIS_DISABLE_INDEXER` switch explicitly and records the chosen mode in the
run marker, so reports from the two modes cannot be mistaken for each other.

## Live receipt: Google continuation, 2026-09-24

The real-account run resumed an existing Gmail bootstrap; it was not a clean
start-to-finish timing. App `81de7cdf0e44a7b3ab4bdea1ef38615c8f2fc9ca`,
catalog `5cf77ede6b19f2ca35c8007aeccfa7b977a2e4cf`, installed Google Source
`sha256:b809c338c697c456c9b63de93b34709a74a8c38a193172805e5dc82cb921a5ec`;
indexer off, Gmail 50 IDs/page, 8 concurrent reads with starts spaced 250 ms.
From 20:38:14 to 21:20:26 UTC the stand recorded 3,728 email envelopes in
2,529,453 ms wall time (1.47/s): 703,276 ms provider fetch and 59,954 ms Graph
admission. Contacts and meetings had no new envelopes in that window. The
completed counts were 18,318 Gmail messages, 214 contacts, and 7,129 meetings;
the next history poll added 8 Gmail messages, reaching 18,326/18,326 without
restarting bootstrap. Host logs contained hold notifications in 41 separate
minute buckets and no error-level entries. Those notifications are shared
across surfaces, not a count of distinct Google 403 responses. Regular holds
still dominate wall time; this run does not establish a speedup.

## Live receipt: Google IMAP bootstrap completion, 2026-09-25

The credential-preserving clone completed Gmail history with app
`07d34bf8cf8c71022cf761d0e81914f88f956439`, catalog
`e0729b7a9560b6d124a5f96c3cfad5d6bac2e059`, installed Google Source
`sha256:08351cd2263ae14d2a0dad0e9a2569ca594e5b930890a221272468d7726de5f5`,
indexer off and 100 IMAP messages/page. This was a continuation with 14,200
messages already stored, **not** a clean start-to-finish speed measurement.

From the 11:16:07 UTC run marker, email recorded 42 turns, 3,997 envelopes,
708,283 ms Source fetch, 70,060 ms Graph admission and 873,123 ms observed
wall time (4.58 envelopes/s). Contacts and meetings each polled 31 times with
no new envelopes. The final graph held 18,195 messages, 214 contacts, 7,129
meetings and 4,832 email attachment metadata records. The last IMAP page
contained 89 messages at 11:30:03 UTC. Gmail REST then handled eight history
envelopes at 11:30:34 and an empty poll at 11:31:04; all three surfaces were
`polling` with no active hold. There was no quota hold in this run. One IMAP
page failed once because a message lacked required metadata, then succeeded on
retry without losing its cursor.

The stored Gmail profile estimate (18,347 total, 896 Spam/Trash skipped) was
lower than the imported All Mail count. A subsequent catalog change
`bf9aee6` uses the initial IMAP UID count for that estimate; its deterministic
test passed, but this live run used the preceding Source package. The earlier
REST continuation and this IMAP continuation are not equivalent runs, so no
speedup factor is claimed.
