# Restore fast Telegram synchronization with provider-owned waits

Status: SPEC_LOCKED  
Spec lock: sha256:0804a6ac650ba5737a8e6f4be287b8e29740481b24a253322bd7a888c1031f54 owner:2026-09-15: ИСПРАВОЯЙ ПОКА НЕ БУДЕТ РАБОТАТЬ БЫСТРО  
Implementation lock: unlocked  
Active Delivery: none  
Unattended decisions: allowed  

<!-- plan:spec:start -->
## The Goal

Restore fast, complete Telegram synchronization without inventing a provider quota. Healthy requests incur zero deliberate inter-request sleep. After a real FLOOD_WAIT, the running Source stops application transmissions for the reported duration and the existing backend schedules continuation. Completion is proved through durable Graph data, not just Source output.

Success metrics:

- **No artificial slowdown:** remove the 3,000 ms spacing, 20-starts/minute cap and fixed 2-second addition to Telegram's wait. Retain bounded concurrency and bounded queues; a free slot is usable immediately.
- **No request cascade:** zero newly transmitted application requests after observing a FLOOD_WAIT and before its deadline. Already-transmitted requests cannot be recalled. Repeated local refusals do not extend that deadline or count as new remote floods.
- **Complete history:** every expected accessible message identity in the independent mock journal exists exactly once in the Graph; short nonempty pages continue; empty terminal pages close the appropriate chat only. No blanket completion from a count estimate.
- **Responsive pages:** a full 50-dialog bootstrap and large-gap catch-up are tested against the backend's actual 30-second command deadline. Source operations yield bounded successful work with a continuation, or return a typed failure before that deadline; they do not hide an unbounded provider sweep inside one call.
- **Measured performance:** record wire requests, provider time, locally imposed wait, Source command latency, Graph write time, transaction count and durable messages/second. Compare equal synthetic workloads against both the paced anti-FLOOD baseline and the previously deployed S32 behavior; do not use improvement over our artificial slowdown as the only evidence of speed.
- **Smallest useful change:** reuse the existing SDK fence, Source pagination and host scheduler. Report production/test/SDK added and deleted lines separately. No new scheduler, rate-limit framework, UI redesign or Graph rewrite.

The request for extremely fast synchronization is a throughput goal, not permission to evade Telegram's limits. No guarantee of zero first FLOOD_WAIT, fixed real-account completion time or infinite throughput is made.

## The target

### One owner for continuation, one guard at transmission

The backend owns when to retry a Source operation. The Source owns whether this process may transmit an account request at that moment. Neither the command helper nor GramJS independently sleeps and retries a known flood behind the host's back.

```mermaid
flowchart TD
  Ready["Backend: eligible work and retained cursor"] --> Run["Source: bounded page; free request slot runs immediately"]
  Run -->|successful page| Commit["Graph batch and durable checkpoint"]
  Commit --> Ready
  Run -->|FLOOD_WAIT_X| Fence["Source: stop new account transmissions until deadline"]
  Fence --> Reply["Return typed rate limit and remaining seconds promptly"]
  Reply --> Wait["Backend: next_retry_at; retain the same work and cursor"]
  Wait -->|deadline reached| Ready
  Push["Incoming Telegram updates"] --> Live["Existing live ingestion during history work and cooldown"]
```

Keep the existing external contract. Telegram MTProto's FLOOD_WAIT is commonly code 420, not an HTTP 429 response. Source normalizes it to the existing JSON-RPC `-32002` with `data.retry_after`; the service's existing error transport may expose HTTP 429. Do not introduce another wire error format.

```ts
// Existing boundary; names shown explicitly so wait ownership is unambiguous.
interface RateLimitReply {
  code: -32002;
  data: { retry_after: number }; // remaining seconds, rounded up
}

interface BackfillPage {
  envelopes: readonly unknown[]; // retain the existing SourceEnvelope type
  has_more: boolean;
  oldest_message_id: number | null;
  total?: number | null; // provider-reported count, never guessed from message IDs
}
```

Within the Source use monotonic time: `deadline = max(existingDeadline, observedAt + reportedSeconds * 1000)`. Remove the fixed safety addition. Only a new remote wait may extend the deadline; a late success may not clear it. A valid zero-second response reports zero without inventing a cooldown or entering an internal retry loop. Invalid or unrepresentable durations produce an explicit error and close admission rather than guess zero.

Retain one outstanding application request per account initially, without spacing after completion. Packet controls and incoming updates are not blocked by this application guard. More concurrent provider requests are a separately measured optimization, not a prerequisite for removing artificial idle time. Other accounts remain independent.

History stays page-driven. Preserve exclusive oldest-message cursors and gap-safe forward watermarks. Bound both dialog discovery and history hydration; stop before starting work that cannot fit the page budget. Never advance a durable cursor past unreturned data. A failed/unknown page is not an empty page and is never evidence of exhaustion.

Use the existing host round-robin/fair-work machinery and batch receiver. Start with its current 50-message history page. Compare 50/100/200-message candidate batch sizes on mocks, recording actual low-level requests (the SDK may split a larger request), frame sizes and Graph transactions. A larger production batch is accepted only with measured benefit and unchanged fairness/deadline limits; do not blindly restore Rust's 500-message host request.

### Candidate change map

Paths below define the SPEC boundary. Exact Tasks, dependencies and write ownership are rendered through `planctl` only after SPEC approval.

```text
magnis — catalog
  plugins/sources/telegram/src/request-admission.ts
    Remove artificial pacing; retain the account fence and exact remaining wait.
  plugins/sources/telegram/src/live.ts
    Bound/reuse dialog discovery and hydration; retain provider totals and peer cache.
  plugins/sources/telegram/src/surfaces/telegram/commands.ts
    Page bootstrap/catch-up safely; preserve backfill continuation and provider count.
  plugins/sources/telegram/src/client.ts
    Extend the existing read/deadline/result types only where bounded paging requires it.
  plugins/sources/telegram/src/tst_src_tgflood_001.test.ts
    Update healthy admission expectations, retaining all first-flood/replay/cancel proofs.
  plugins/sources/telegram/src/testing/mtproto-transport.ts
    Extend the existing low-level fake transport and clock; no high-level Telegram mock.
  plugins/sources/telegram/src/live.test.ts
  plugins/sources/telegram/src/surfaces/telegram/commands.test.ts
  plugins/sources/telegram/src/surfaces/telegram/tst_cat_tg_gap_001.test.ts
  plugins/sources/telegram/src/surfaces/telegram/execute.test.ts
    Keep existing bounded read, complete-gap and short-page regressions.

magnis-app — integration proof, no scheduler rewrite presumed
  backend/test/harness/source-sync.ts
  backend/test/harness/source-sync-postgres.ts
    Reuse the actual Nest/Source/Graph stand and isolated PostgreSQL database lease.
  backend/test/harness/source-sync-telegram.ts (new, test only)
    Connect the production Telegram Source/SDK to the existing fake transport.
  backend/test/tst_src_int_telegram_sync_001.test.ts (new)
    Three coherent end-to-end journeys: healthy, provider wait, interrupted progress.
```

Retain the already-tested SDK transmission/replay patch; do not rewrite it merely to remove the local pacing policy. Any necessary additional production file must be identified before implementation approval. Changes across the two repositories require sequential local Deliveries, not unrelated parallel PRs. No push or PR publication is authorized by this SPEC.

## Today, measured against that

Pinned references:

- Planning base: catalog `origin/staging` at `10c8060`; draft worktree `feat/telegram-fast-sync`.
- Anti-FLOOD implementation: catalog `960d2017ecaf7ffa2add2720b2ed3061b66f8506`; tested production head `cd31804a86a4828d3a3f152ccb64708d2f2b87a8`. The old plan and its historical results remain unchanged.
- Running host inspected: app `119f2bc5cffd439a8be0d44e329171adc26c7071`.
- Previously deployed S32 Source: package hash `sha256:3f5ce0dd30d41cdc069faf68c2d696e09d18d97e3e837fd18378f74bf320ea57`. Relevant later catalog changes are still mixed with uncommitted work in `smoke-catalog`; do not copy or overwrite that tree or claim it is a clean mergeable baseline.
- Last Rust Source before deletion: catalog `5c6139af876d82d9032180638f1053dc685e5c69`; deleted by `c4c6fbb`.
- Rust backend reference: app `8e2aa14b8093c44df150a7b630e2163cc2496231`.

Observed differences:

1. Rust Source `client.rs:74` sent immediately. Its send helper waited only the actual reported FLOOD duration, retrying once for waits up to 30 seconds. That helper was not an account-wide synchronization guard. Grammers' internal defaults were not independently verified.
2. Rust `commands.rs:287–343` continued every nonempty history page using exclusive `before_message_id`. This is the behavior to preserve. Rust catch-up at `commands.rs:177–210` promoted a watermark after at most 20 messages and could miss a larger gap; do not restore that defect.
3. Rust host `scheduler.rs:947` and current host `sync.page-admission.ts:315` already schedule the provider's wait. Current `sync.worker.ts:1077` distinguishes it from ordinary exponential retries. A new host rate limiter is not needed.
4. Current Source `request-admission.ts:113` adds 3 seconds between starts and caps 20/minute; `:212` adds 2 seconds to every remote wait. These are local policy, not Telegram quota data.
5. Current `LiveDialogPager.dialogPage` hydrates 50 dialogs sequentially. At the artificial 3-second spacing this takes roughly 150 seconds before network overhead, while host `source-host.client.ts:48` sets a 30-second fetch deadline. These are code-derived timings, not a performed live benchmark.
6. A host deadline failure becomes an ordinary provider failure; existing 30/60/120-second recovery can amplify the slowdown. Preserve the deadline and return bounded work/typed waits instead of raising or deleting it.
7. S32 forwards the message count; the anti-FLOOD baseline omits it. The host accepts a missing count, so synchronization can lose its numeric total without a protocol error.
8. Rust host backfill requested 500 messages and slept 2 seconds between chat rounds. Current host requests 50 and repumps eligible work fairly. Neither historical batch size nor historical delay is assumed optimal.

### Reuse and proof gap

- Reuse `AccountAdmission`, the GramJS patch, `SessionPool`, shared peer discovery, `runMcpStdio` and the existing fake transport. Preserve hidden-retry, crypto-gap, reconnect, cancellation and error-propagation coverage.
- Reuse current host `SyncWorker`, `SyncStateRepository`, Source-host cooldown handling, module batch receiver and PostgreSQL harness. Existing tests `tst_bts_sync_continuation_001f`, `tst_bts_sync_worker_001i`, `tst_bts_sync_backfill_001/002/007` and `tst_bts_src_runtime_003` cover useful pieces, not the entire combined path.
- `bootSourceSync()` currently exercises Gmail end-to-end. `tst_src_int_telegram_graph_001` supplies provider envelopes and proves module-to-Graph behavior only. There is **no existing real Telegram Source + fake MTProto + Nest + Graph fixture**; adding that connection is required work, not existing coverage.
- Before approving Tasks, pin exactly how the current Source test transport is injected into the real Source command loop under the existing host stand. It must not mock `invoke`, `getMessages`, Source results, Graph writes, the worker or scheduler. Do not introduce a second fake synchronizer. If a test-only process bridge is required, disclose that boundary and separately verify packaged Source startup; do not describe in-process proof as a real child-process run.

## Invariants and coherent acceptance journeys

### Healthy synchronization and measured overhead

Start with an empty isolated native/embedded PostgreSQL database and real registered Source/module, with no real credentials. Start the live subscription, enumerate 50 mock dialogs, ingest their initial snapshots and backfill multiple selected histories round-robin. Include histories of 120, 70 and 5 messages, a short nonempty page, and pinned metadata; inject two live arrivals while history remains unfinished.

Compare exact independent provider IDs with durable Graph IDs and displayed status/count projection. A blocked Graph transaction cannot count as saved. Duplicate delivery cannot create another identity. Completion requires terminal evidence per chat, not a coincidental count match. A restarted healthy worker continues remaining gaps without replaying the full account discovery.

Record same-workload timings against both baselines. Healthy queue admission contributes **0 ms configured delay**; requests start as soon as their predecessor completes. Include the 50-dialog case explicitly so three tiny chats cannot hide an aggregate command timeout again. Test 50/100/200 candidate batch sizes with wire-request and database-transaction counts; publish the measurements even if a larger batch is slower.

### First FLOOD, service-owned waiting and recovery

Inject real-wire-equivalent FLOOD_WAIT during discovery, history and SDK retry/replay as table-driven phases. The Source returns the remaining wait promptly; the backend retains the cursor and schedules that exact wait. No application request is sent at deadline minus 1 ms; eligible work may resume at expiry with a single outstanding request, not a queued burst. Incoming updates remain ingestible throughout.

Repeated local attempts do not change the deadline, create extra remote-flood counts or enter 30/60/120-second generic backoff. A later larger remote wait extends the hold; a shorter wait or late success does not shorten it. Exercise zero, malformed and very large durations, account isolation and in-process client replacement. Preserve the existing no-durable-Source-cooldown boundary: process death can lose the Source guard, and other clients are not coordinated. Do not add restart persistence or use restarts to evade a known hold.

### Interrupted or malformed progress

Interrupt a history read; return a malformed/nonadvancing cursor; fail a Graph commit; then recover. Failed work neither advances coverage nor counts as saved. Catch-up with more than 20 new messages preserves its committed watermark until the whole gap is accounted for. A timeout remains an explicit failure, never a successful empty page. A real provider wait remains distinct from these generic failures.

Each journey runs through the real production logic. Extend existing tests rather than creating one test for every branch. First observe RED for the missing behavior, then GREEN on the same command. Reapply the existing safety-removal negative controls after changing admission so faster traffic cannot silently disable the guard.

## Execution and live-verification boundary

- This is a new SPEC draft, not a declaration that the requested rewrite is implemented. Keep the completed anti-FLOOD plan/results intact; use `planctl` for all plan changes.
- First obtain SPEC approval, then render result-oriented PR Delivery/Stage/Task descriptions, exact files and RED commands through `planctl`; implementation starts only after that contract is approved. Independent investigation is parallel; implementation parallelism requires disjoint approved writes.
- Reuse the existing seven `agent:*` adapters already implemented with the anti-FLOOD branch when integrating it. No new process framework or duplicate launcher is part of the product change. The untouched staging hook currently runs a full catalog gate even for the initial plan commit; report this cost, do not disable the hook.
- Native/embedded PostgreSQL or a server is required for integration and any live stand. No PGlite for the app. Use temporary isolated test databases, not the existing account database.
- Do not rewrite UI, reset user data, export credentials, push, open a PR or enable live Telegram during implementation/mock validation.
- The owner's earlier clean-sync request remains the intended final check, after mocked acceptance. Begin with one selected chat, then several; monitor real waits and stop immediately on FLOOD/auth errors. Agree the bounded live request/time budget before activation; do not infer authorization for an unlimited account-wide download or intentional rate-limit probing.
- The currently saved history is preserved. A subsequent clean stand uses a separate PostgreSQL database and supported authentication; never clear a retry deadline as a shortcut or run two active sync processes for the same retained session.

## Pre-approval screen

**What changes:** healthy Telegram requests no longer carry a fabricated pacing interval; actual FLOOD_WAIT stops the account immediately and is scheduled by the existing service. Bootstrap and catch-up return bounded pages, and provider totals reach the existing progress projection.

**What proves completion:** three coherent mocked Source-to-Graph journeys on real PostgreSQL, the retained SDK safety regressions, per-stage RED/GREEN evidence, measured page/Graph timings and finally a separately bounded live check.

**What is not promised:** zero first FLOOD, unlimited speed, safety coordination with other Telegram apps, a new UI or an untested full-account reset. Neither a mock-only SDK suite nor a green build is sufficient to call the complete application fixed.
<!-- plan:spec:end -->

<!-- plan:implementation:start -->
## Implementation contract
<!-- plan:implementation:end -->

<!-- plan:execution:start -->
## Execution log

- lock-spec sha256:0804a6ac650ba5737a8e6f4be287b8e29740481b24a253322bd7a888c1031f54 owner:2026-09-15: ИСПРАВОЯЙ ПОКА НЕ БУДЕТ РАБОТАТЬ БЫСТРО
<!-- plan:execution:end -->
