# Google Pull Sync

Status: SPEC_DRAFT  
Spec lock: unlocked  
Implementation lock: unlocked  
Active Delivery: none  
Unattended decisions: allowed  

<!-- plan:spec:start -->
## The Goal

Keep the Google Source on its existing 30-second Pull schedule and make that Pull correct, incremental and measurable across all three existing surfaces: Gmail, Google Calendar and Google Contacts. Push, Pub/Sub, IMAP IDLE and a new host protocol are not part of this Delivery.

The currency is provider requests, repeated data and measured wall time:

- A first connection downloads email, meetings and contacts through the existing Source and module pipeline, with independent progress for each surface.
- Gmail keeps its existing `historyId` catch-up. Calendar and Contacts finish their first complete read with the provider's `syncToken`; later polls retrieve only changes. An unchanged poll must not enumerate the full calendar or contact list again.
- The connector refreshes an OAuth access token once per credential and token lifetime, not once per sync page. Concurrent calls share the same in-flight refresh.
- A Google quota response with an exact `Retry-After` becomes the existing typed rate-limit result. After one hydration worker observes it, no worker starts another request in that page; requests already sent cannot be recalled. The host remains the only owner of the durable hold and retry time.
- Progress is honest: Gmail states mailbox total and Spam/Trash skipped; Calendar states its exact event total when the full pass finishes because Google provides no pre-count; Contacts states total items and identity-less skipped. Incremental module receipts apply each admitted addition or deletion once; updates and replays do not inflate the totals.
- One existing manual performance stand runs a selected clean app worktree with real Telegram and Google accounts, preserves credentials across data resets, and reports provider fetch time, module/Graph admission time and throughput by Source and surface. No live-provider or PostgreSQL run enters CI.
- The live acceptance receipt records exact app/catalog SHAs, page settings, per-surface counts, holds and before/after timings. It makes no speedup claim unless two equivalent runs on the same accounts were measured.

## The target

The one architectural decision is to extend the existing Pull path. Provider cursors remain opaque Source cursors, and the existing modules remain the only writers to Graph.

```mermaid
flowchart LR
    GOOGLE[Google APIs] --> SOURCE[One Google Source]
    SOURCE --> EMAIL[Gmail historyId]
    SOURCE --> MEETINGS[Calendar syncToken]
    SOURCE --> CONTACTS[People syncToken]
    EMAIL --> MODULES[Existing modules and Graph]
    MEETINGS --> MODULES
    CONTACTS --> MODULES
    HOST[Existing host Poll and hold] --> SOURCE
```

No surface gets a second scheduler, database, checkpoint store or bespoke transport. `magnis.sync.fetch`, standard envelopes, typed `RateLimitError`/`CursorExpiredError`, module plan receipts and the host's Poll loop are reused.

### Gmail

Bootstrap captures `historyId` before listing messages, hydrates each listed message with the existing bounded concurrency and commits the captured history boundary only after the terminal page. Compare 50, 100 and 200 IDs per page against the app's existing 30-second Source fetch deadline and the same-account live report; select only a size that finishes inside that deadline. The selected page size and hydration concurrency are printed in the receipt.

Catch-up continues to use `history.list(startHistoryId)`: additions are `live`, label-only changes are `snapshot`, and removals are `delete`. A history-list 404 remains `CursorExpiredError` and restarts only the email surface. Failed message hydration or conversion, including a message that disappeared after listing, fails the page without advancing its cursor. The retry repeats the provider page, and the captured `historyId` later reconciles the concurrent change. A persistent failure remains visible rather than claiming completion.

### Calendar

The current moving `now-30d..now+90d` window is removed: it cannot be combined correctly with Calendar `syncToken` and excludes events outside that window. The initial pass reads the primary calendar through bounded provider pages, includes cancelled events as deletion evidence, counts non-cancelled events while processing those pages, and receives `nextSyncToken` on its terminal page. The accumulated count is stated on that terminal page; the separate IDs-only counting sweep is removed. Google does not supply a full-calendar total before enumeration.

Subsequent polls pass that token and return only changed or cancelled events. Non-cancelled changes are `snapshot`; cancelled events are `delete`. A provider `410 GONE` is `CursorExpiredError` and causes a new full Calendar pass. Page tokens continue one pass; the new sync token replaces the previous committed token only on the terminal page.

### Contacts

The first People API pass requests a sync token and uses a page size measured to fit the app's 30-second Source fetch deadline (Google permits up to 1000, versus the current 100). `totalItems` is mapped to the existing `total_people` envelope field. Its terminal `nextSyncToken` becomes the committed cursor. Later polls use `syncToken`; `Person.metadata.deleted` becomes a `delete` envelope anchored by the existing resource-name hash. An expired sync token becomes `CursorExpiredError` and restarts only Contacts.

The Contacts module deletes only the Google replica resolved by that anchor. A locally curated person hub survives removal of its Google replica. Successful Graph creates and deletes provide incremental plan deltas; updates do not inflate the count.

### OAuth and provider holds

The existing credential tuple remains the cache identity. A cached access token carries Google's `expires_in`; it is reused only before its explicit safety-adjusted expiry. A changed credential never receives another credential's token. A rejected refresh is never replaced with an old token.

All Google API and token responses pass through the existing HTTP owner. HTTP 429, and a Google quota 403 with a parseable `Retry-After`, surface the existing `-32002` with the same remaining seconds. Missing or malformed delay remains an explicit provider error; no 60-second value is invented. Network failures retain the existing bounded timeout/retry policy and are not relabelled as quota holds.

Within Gmail's concurrent hydration, the first typed fatal error closes scheduling for that page. Up to the already-running requests may finish, but queued message IDs are not sent. No partial page or cursor is returned after a fatal error.

### Progress and performance report

The three modules continue to state progress in their existing schema names. Gmail and Contacts state their provider totals on page one; Calendar states the accumulated exact count on the terminal full-sync page. Page conversion failures state `skipped`. Gmail counts distinct admitted provider additions/deletions; Calendar and Contacts use actual created/deleted replicas. Updates and replays are zero-delta. A page with no provider statement does not fabricate a total.

The current `acceptance/telegram-performance` mechanism is extended in place. One persistent data root can hold both Telegram and Google credentials. `reset` clears Graph output and sync progress while fingerprinting the existing secret, credential, connection and account tables in the same transaction. `report` groups production `sync turn` records by `sourceId` and `surface`, including turns, pages, envelopes, bytes, inserted/removed rows, fetch/admission/overlap/wall time and envelopes per second.

The stand refuses Telegram and Google fixture variables, refuses dirty app or catalog worktrees, records exact revisions and starts the repository's ordinary `scripts/dev/dev.ts`. It never owns an alternate app launcher. Automated tests cover only argument parsing, reset safety and log summarization with local fixtures; real Google, Telegram and PostgreSQL execution is manual.

### Cursor shapes at the Source boundary

These are provider-owned opaque JSON values, not new host types:

```typescript
interface GmailCursor {
  history_id: string;
  page_token?: string;
  history_page_token?: string;
}

interface CalendarCursor {
  sync_token?: string;
  page_token?: string;
  events_total?: number;
}

interface ContactsCursor {
  sync_token?: string;
  page_token?: string;
}
```

During pagination the cursor retains the committed `history_id` or `sync_token` and adds only the current `page_token`. A terminal response removes the page token and replaces the provider checkpoint. Calendar and Contacts certification change from terminal-clear snapshots to retained forward checkpoints; no Source-specific field is added to the host command.

### Proposed file tree

All product changes stay in the catalog repository. The app is selected and measured by the stand but is not modified.

```text
MODIFY plugins/sources/google/src/auth.ts
       Reuse one unexpired access token per credential and coalesce refresh.
MODIFY plugins/sources/google/src/oauth.test.ts
       Prove reuse, expiry, concurrent refresh and credential isolation.
MODIFY plugins/sources/google/src/http.ts
MODIFY plugins/sources/google/src/http.test.ts
       Preserve exact Google quota waits and stop inventing a missing delay.
MODIFY plugins/sources/google/src/connector.ts
       Route the three surfaces through their existing full/delta fetchers.
MODIFY plugins/sources/google/src/surfaces/email/gmail.ts
MODIFY plugins/sources/google/src/surfaces/email/gmail.test.ts
       Tune bootstrap pages and stop hydration scheduling on a fatal result.
MODIFY plugins/sources/google/src/surfaces/meetings/calendar.ts
MODIFY plugins/sources/google/src/surfaces/meetings/calendar.test.ts
       Replace the moving window with full sync plus Calendar syncToken.
MODIFY plugins/sources/google/src/surfaces/contacts/contacts.ts
MODIFY plugins/sources/google/src/surfaces/contacts/contacts.test.ts
       Add People syncToken, deletion envelopes and expired-token recovery.
MODIFY plugins/modules/meetings/module/service.ts
MODIFY plugins/modules/meetings/module/__tests__/meetingsSync.test.ts
       State created/deleted Calendar deltas from actual Graph outcomes.
MODIFY plugins/modules/email/module/service.ts
MODIFY plugins/modules/email/module/__tests__/emailIngest.test.ts
       Count distinct admitted Gmail additions/deletions once.
MODIFY plugins/modules/contacts/module/service.ts
MODIFY plugins/modules/contacts/module/__tests__/contactsIngest.test.ts
       Delete Google replicas and state created/deleted Contacts deltas.
MODIFY plugins/sources/google/manifest.toml
MODIFY scripts/certify-sources.ts
       Retain Calendar/Contacts checkpoints and update certified scenarios.
MODIFY acceptance/telegram-performance/run.ts
MODIFY acceptance/telegram-performance/run.test.ts
MODIFY acceptance/telegram-performance/README.md
       Run and report real Telegram plus Google without entering CI.
```

The existing Google OAuth test is extended for access-token reuse. The stand keeps its existing directory and command path. Generated catalog artifacts are rebuilt by their existing script and are not hand-authored.

## Today, measured against that

Pinned catalog base: `origin/staging` at `2f9dfe03125603953902d79764d8934558eba87d`.

- `plugins/sources/google/manifest.toml` declares one Poll Source at 30 seconds with `email`, `meetings` and `contacts`. This mode and the three existing modules are retained.
- `connector.ts:39-42` refreshes an access token on every fetch or action. A large mailbox therefore pays an OAuth request for every 50-message page.
- `gmail.ts:647` lists 50 IDs per page; hydration already has one reusable bounded-concurrency implementation at `gmail.ts:762-846`. Gmail bootstrap/history cursor semantics and delete envelopes already exist and are extended, not rewritten.
- `calendar.ts:215-242` enumerates IDs only to count the moving window, then `calendar.ts:260-310` lists the same bounded window again. One count pass can also exceed the app's 30-second Source fetch deadline. It stores only `page_token`, returns `null` at completion and cannot perform incremental Calendar sync.
- `contacts.ts:267-354` requests 100 people, stores only `page_token` and returns `null` at completion. Its own comment records the unused People `requestSyncToken`/`nextSyncToken`; deleted People are not parsed and the Contacts module ignores delete envelopes. Google now recommends `totalItems` instead of `totalPeople`.
- `http.ts:150-157` maps only HTTP 429 and invents 60 seconds when `Retry-After` is absent. Gmail hydration collects fatal errors but other workers may continue taking queued IDs before the batch rethrows.
- The email module already states full mailbox progress but counts every `live` and `delete` envelope before checking whether it changed anything. Meetings and Contacts state full totals but not incremental create/delete deltas. The existing Graph result and anchored deletes provide the evidence for those two surfaces.
- `acceptance/telegram-performance` already selects exact clean app/catalog revisions, starts the ordinary dev command, preserves all Source credential tables on reset and reads production `sync turn` logs. Its report deliberately filters to Telegram; it is the one stand to extend.

### Reuse map

- Reuse `fetchWithRetry`, its timeout, `RateLimitError` and `CursorExpiredError`; do not add a Google retry framework.
- Reuse Gmail's existing checkpoint/page-token pattern for Calendar and Contacts terminal tokens.
- Reuse the email module's full-statement pattern in Meetings and Contacts; use their existing Graph results for replica deltas.
- Reuse each module's existing anchor and Graph delete operation; do not query Source-specific tables from a module.
- Reuse the existing performance runner, reset transaction, ordinary app launcher and production timing log; do not add a second runner or CI workflow.

## Invariants

- `tst_gts_pull_001`: Gmail bootstrap captures one history boundary, reuses one valid access token across pages, preserves message order, refuses a silently skipped hydration failure and stops scheduling after a typed fatal result.
- `tst_gts_pull_002`: Calendar full pagination counts each non-cancelled event once without a second enumeration, commits only its terminal sync token; the next poll sends that token, emits changed/deleted events, and maps 410 to cursor expiry.
- `tst_gts_pull_003`: Contacts full pagination commits only its terminal sync token; the next poll sends that token, emits changed/deleted replicas, and maps an expired token to cursor expiry.
- `tst_gts_pull_004`: exact 429/quota-403 `Retry-After` reaches the existing wire error unchanged; missing/malformed delay is never fabricated; network timeout remains distinct.
- `tst_module_google_delta_001`: Email, Meetings and Contacts count admitted additions/deletions once; updates and replays are zero-delta, and local contact hubs survive replica deletion.
- `tst_cat_src_performance_runner_001`: one runner preserves credentials, refuses fixtures/dirty revisions and reports Telegram plus each Google surface separately from production log records.

Every behavior test is written RED first and is deterministic. Removing token retention, restoring full-list polling, allowing one queued Gmail request after a rate limit, or deleting a curated contact hub must make its owning test fail.

## Constraints and exclusions

- No Gmail Push, Pub/Sub, IMAP IDLE, Calendar webhook, public relay, `listen_start`, new app protocol or app repository change.
- No new scheduler, cursor database, generic retry abstraction, second performance runner or CI workflow.
- No real provider credentials in source, tests, logs, commits or CI. Automated tests use injected HTTP responses and synthetic logs only.
- The live stand is manual and opt-in. It stops and reports on a provider hold; it does not search for quota limits or repeatedly reconnect accounts.
- Gmail continues to exclude Spam and Trash from ingestion and reports them as skipped. Attachments remain lazy downloads. Google Drive and Tasks are outside the three declared surfaces.
- Calendar changes from the current rolling 120-day window to the complete primary calendar so provider incremental sync is valid. Additional calendars remain outside this Delivery.
- A live speed result is hardware/account/provider-specific. The PR reports raw before/after numbers and bottleneck split; it does not turn one account's throughput into a universal SLA.

## Pre-approval screen

### Files and responsibility

- Google Source: token reuse, Gmail batch scheduling, Calendar/Contacts incremental cursors and exact quota errors.
- Email, Meetings and Contacts modules: correct admitted create/delete progress; Contacts deletes only its Google replica.
- Existing performance stand: reports Telegram, Gmail, Calendar and Contacts from the same persistent data root.
- Main app: no code change.

### What the owner can observe after merge

- Connect one Google account and see independent email, meeting and contact progress instead of repeated full Calendar/Contacts enumeration every 30 seconds. Calendar's exact total appears after its first complete enumeration.
- Stop and restart during any page and resume from the committed provider checkpoint without claiming an uncommitted terminal token.
- Receive a real Google quota delay as a visible host hold; queued Gmail hydration stops launching new requests after the first observed hold.
- Reset the manual stand without re-authenticating Telegram or Google, run another selected app/catalog branch, and compare per-surface fetch versus Graph time.
- See the complete primary calendar; the former `now-30d..now+90d` product limit is gone.

### Deliberately not verified here

- Push latency is not tested because this Delivery remains Poll-only.
- CI does not start PostgreSQL or contact real Telegram/Google accounts; the live receipt is manual.
- No fixed messages-per-second SLA is promised before the first same-account baseline. The accepted evidence is exact request reduction, correct incremental behavior and reported live wall time.
- Additional Google calendars, Drive, Tasks, Spam/Trash ingestion and attachment prefetch are unchanged.

After this SPEC is approved, one PR Delivery with commit-sized Stages will be rendered separately. No implementation starts from this draft.
<!-- plan:spec:end -->

<!-- plan:implementation:start -->
## Implementation contract
<!-- plan:implementation:end -->

<!-- plan:execution:start -->
## Execution log
<!-- plan:execution:end -->
