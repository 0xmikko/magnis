# Telegram takeout sync

Status: APPROVED  
Spec lock: sha256:fddbcc2b66e31efe9b35adea4e8cd96715fd2996b95f6baa8094e848cb3e7ffd owner:давай стадии  
Implementation lock: sha256:ac69e0d9bd7da53eede11dff375e6ac288627ab84285147148d1adae43abafba owner:да  
Active Delivery: D2  
Unattended decisions: allowed  

<!-- plan:spec:start -->
## The Goal

Telegram first states the exact account plan, then downloads the selected history at the fastest rate the provider accepts. A provider hold pauses requests only until its stated deadline; it never becomes a permanent delay between later requests.

The work also removes Telegram's two Source exceptions. Every in-repository Source runs through `@magnis/connector-sdk`, and every scheduled read—including bounded per-identity history—uses `magnis.sync.fetch`. `magnis.execute` remains only for interactive actions such as send, reply and media download. The backend contains no Telegram command, payload or result adapter.

Success means:

- Before the first historical message envelope, every discovered chat has been emitted once with the exact `message_count` returned by Telegram. The existing module therefore fixes the `chats` and `messages` totals before message ingestion begins. Those totals may move later only for a real live message or membership change.
- Full-history reads use Telegram's official Takeout flow: `account.initTakeoutSession`, `messages.getSplitRanges`, and `messages.getDialogs`/`messages.getHistory` wrapped in both `invokeWithMessagesRange` and `invokeWithTakeout`.
- `FLOOD_WAIT_X` and `TAKEOUT_INIT_DELAY_X` pause the account for exactly `X` seconds. On expiry one waiting request may run immediately. No completed-request average or permanent `requestIntervalMs` survives the hold.
- Telegram uses the same `runConnector` program, Sync Profile requests, push envelopes, error mapping and bounded concurrent dispatcher as every other Source. Its manifest says `runtime_kind = "connector_sdk"`; `plugins/sources/telegram/src/dispatch.ts` is gone.
- The same real-account, indexer-off stand sustains at least 150 admitted envelopes/second by wall time over a run of at least 10,000 envelopes when Telegram returns no provider hold. If a provider hold occurs, the run reports it separately and makes no local-throughput claim.
- The live performance stand remains only in the `magnis` repository and outside CI. No credential, Telegram network call, PostgreSQL installation or provisioned-source test enters either repository's CI.

## Why now

The latest real stand regressed from 175.141 envelopes/second (`magnis` `60c24bb`, app `2226442`) to 10.116 envelopes/second (`magnis` `ba40f88`, app `6b2cf303`). In the slow run, Source fetch used 3,403,571 ms and Graph admission 59,889 ms: 98.2% of measured turn time was Telegram fetch, not Graph or PostgreSQL.

The regression is in `AccountAdmission.observe()`. After a remote 420 it derives `requestIntervalMs` from completed calls and the wait, then applies that interval forever in `select()`. Telegram documents `FLOOD_WAIT_X` as the delay before repeating the action, not a continuing request rate. One temporary provider refusal became permanent throttling.

The current bootstrap interleaves chat discovery with messages, so the plan denominators move during ingestion. Telegram's Takeout documentation prescribes the missing ordering: count dialogs and each dialog's messages first, then export histories through split ranges.

The current Source path also has exactly the exception this plan must not extend. Telegram alone owns a custom stdio dispatcher, and the backend converts a generic `SourceCommand` into `magnis.execute { action: "backfill_chat", ... }`. This is a read disguised as an action and makes the backend know Telegram fields. Adding another Telegram field would deepen that defect.

Official sources, read 2026-09-22:

- [Takeout API](https://core.telegram.org/api/takeout): initialize one export, obtain split ranges, issue initial `limit=1` dialog and history requests for progress, then paginate histories through the range and takeout wrappers.
- [account.initTakeoutSession](https://core.telegram.org/method/account.initTakeoutSession): security may answer `TAKEOUT_INIT_DELAY_%d` with the exact wait.
- [RPC errors](https://core.telegram.org/api/errors): `FLOOD_WAIT_X` means wait `X` seconds before repeating the action.
- [Data centers / parallel sessions](https://core.telegram.org/api/datacenter#parallel-sessions): absent `tmp_sessions > 1`, one main session is mandatory; exceeding it can invalidate authorization with `AUTH_KEY_DUPLICATED`.

GramJS 2.26.22 already contains `Api.account.InitTakeoutSession`, `Api.account.FinishTakeoutSession`, `Api.messages.GetSplitRanges`, `Api.InvokeWithMessagesRange`, `Api.InvokeWithTakeout`, and `Api.MessageRange`. No dependency replacement or second Telegram client is required.

## The target

```mermaid
flowchart LR
  W[generic Sync worker] --> F[magnis.sync.fetch]
  F --> T[Telegram through runConnector]
  T --> P[standard page: envelopes progress traversed]
  P --> W
```

```mermaid
flowchart LR
  I[init takeout] --> R[get split ranges]
  R --> E[count dialogs and histories]
  E --> C[emit every counted chat]
  C --> S[seed newest messages and bound gaps]
  S --> B[host selects older gaps]
  B --> H[download selected histories]
  H --> F[finish takeout]
  F --> U[normal catch-up and live updates]
```

### One Source program

`@magnis/connector-sdk` remains the one Source executable framework. Its existing `ConnectorConfig` continues to own fetch, auth, listen and execute handlers. The shared implementation gains the behavior for which Telegram had copied a dispatcher:

- `runConnector` dispatches tool calls concurrently under one fixed SDK bound, so a long fetch cannot starve an interactive action. The existing `download_file` action uses the SDK's separate bounded download capacity; `listen_stop` remains an unblocked control call. These rules are Source-independent and serve both Telegram and Google media operations.
- `--auth-mode` is enforced by `runConnector` for every auth-capable Source: that process serves only `magnis.auth.*`; a normal Source process refuses auth calls. Handler state remains alive in the process across begin and step.
- `listen_start` and `listen_stop` require the host's `subscription_id`; there is no `sub:legacy` default and no `magnis.sync.listen` alias. The SDK emitter carries the existing optional envelope `position`. Telegram messages state their positive message position; a dated `link_end` omits `position` because membership is not message coverage.
- Push capabilities omit a polling interval. All tool failures use the SDK's existing `ConnectorError`, `RateLimitError` and `CursorExpiredError` mapping.
- `tools/list` advertises the standard `magnis.sync.fetch` tool. Current catalog certification accepts only `runtime_kind = "connector_sdk"`; the historical selected-channel declaration may still describe the old immutable Telegram artifact as `custom`.

Telegram supplies an ordinary `ConnectorConfig` and calls `runConnector` from `main.ts`, like the other Sources. Its execute table contains only `send_message`, `reply` and `download_file`. Its custom dispatcher, custom notification serialization, `backfill_chat` execute handler and their exceptions in testkit/docs are deleted.

### One standard fetch request

The existing generic `SourceCommand` remains the internal command. It gains only the two values the worker already owns but could not express at the Source boundary: the current `scopeId` and `forwardCheckpoint`. Its existing `cursor` remains the continuation inside the current target, and its existing `target` remains the Magnis-owned durable target.

`callNativeFetch` handles bootstrap, catch-up and backfill. It sends one standard `magnis.sync.fetch` request; backfill is no longer a separate call path:

```ts
interface FetchArgs {
  surface: string;
  direction: "backward" | "forward";
  cursor?: JsonValue;
  scope_id?: string;
  target?: { kind: "gap"; start: number; end: number };
  forward_checkpoint?: JsonValue;
  tracked_handles?: string[];
}
```

The fields are generic Sync concepts already present in the backend. A bootstrap or catch-up omits the fields it does not own. A backfill request uses `direction: "backward"`, the selected gap's `scope_id` and `target`, its target-bound `cursor`, and the account's opaque `forward_checkpoint`. The runtime serializes them and never inspects provider checkpoint contents.

The standard `FetchResult` admits the page fields the host already decodes: `envelopes`, either legacy cursor fields or explicit `progress`, and `traversed`. Telegram itself states the ranges it actually read. The backend no longer computes Telegram coverage from message payloads or validates Telegram message ids; the normal strict page decoder validates the generic result.

On the first page of a selected gap, Telegram starts from `forward_checkpoint`. While that target continues, its opaque continuation token contains the updated Takeout state and provider offset. The worker commits that token as its normal `cursor`. On the terminal page, Telegram returns `completeTarget` with `forwardCheckpoint: { kind: "replace", value: ... }`, promoting the updated account checkpoint. Thus every successful page is resumable without teaching the host Takeout fields or adding a second checkpoint column.

### One checkpoint, four phases

The existing Source checkpoint remains the only durable provider state. Existing Telegram functions advance it through four literal phases; there is no new service or storage:

| Phase | Owner and provider work | Standard fetch answer |
|---|---|---|
| `estimate` | `runBootstrap`: initialize Takeout; read split ranges; in every range call `getDialogs(limit=1)` for its count, paginate those dialogs, then call `getHistory(limit=1)` for every dialog/range and sum exact counts | no envelopes; checkpoint the Takeout id, ranges, per-chat range membership, serializable peer, count, top message and provider offsets |
| `publish` | `runBootstrap`: revisit recorded dialogs only as needed to rebuild their current chat payload | chat envelopes with final `message_count`; never a message envelope |
| `download` | `runBootstrap` first re-emits each chat with its newest provider page; later backward fetches serve the bounded older gaps selected by the host | newest messages for every chat, then older messages only for retained gaps; each answer states `progress` and `traversed` |
| `finish` | `runCatchup`: the first forward fetch after the gaps are closed finishes Takeout | remove Takeout state, then continue through existing catch-up |

The checkpoint stores the Takeout id as a decimal string because JSON cannot round-trip Telegram's `long`. Per chat it reuses the existing serializable `OffsetPeer` and stores count, range membership, top/watermark ids and resumable offsets; it does not store message bodies. The existing `chats` map already scales once per chat, so this adds no second account-sized collection.

Dialog and history pagination remain provider-sized. `messages.getHistory` requests at most Telegram's 100-message page. A Source answer joins as many provider pages as fit the existing 20-second and 3 MiB budgets; it is not split by an arbitrary message count.

The `publish` phase may need more than one Source page to stay under the byte budget. The UI can show chat/message totals growing while status is bootstrap, but `messages` completed remains zero. Only after the last counted chat page is committed does `download` begin.

The first `download` page for a chat carries that chat envelope again plus its newest messages. Repeating the counted chat in the same generation gives a zero plan delta; its `traversed` range bounds the open Graph gap, and its newest id becomes the catch-up watermark. Excluded chats still receive their planned first 100 messages and return in `excluded`, so their gaps stay deleted. Admitted histories longer than the seed page leave one bounded older gap for the existing backfill selection.

The Telegram fetch handler reconstructs the peer from the checkpoint's `OffsetPeer`, selects only the recorded split ranges for `scope_id`, and wraps each `GetHistory`. It never restarts dialog discovery. An unfinished old checkpoint has no Takeout state, so a bounded fetch throws the existing `CursorExpiredError` and the worker starts one new bootstrap pass. It never falls back to ordinary history. An old steady catch-up cursor remains valid.

### Exact temporary holds, no learned throttle

`AccountAdmission` keeps the existing one-active-request, FIFO, bounded queue, replay fence, control-message bypass and process-local account ownership. It loses only `completedCount`, `completedStartedAt`, `lastSentAt`, `requestIntervalMs`, and the wake/select checks derived from them.

The 420 parser accepts the exact numeric suffix of `FLOOD_WAIT_X`, `FLOOD_PREMIUM_WAIT_X`, and `TAKEOUT_INIT_DELAY_X` when GramJS does not populate `.seconds`. A 420 without a valid non-negative duration still closes admission rather than guessing. A valid wait sets the shared deadline; expiry releases one request immediately. A second real 420 may set a new exact deadline, but successful requests never manufacture a delay.

One main MTProto session remains. This plan does not add parallel main sessions because the running client does not prove `tmp_sessions > 1` with the required PFS setup. Media downloads keep their separate GramJS path behind the shared SDK dispatcher.

### Crash and finish behavior

Each Source page checkpoints all successful provider work before the host asks for the next page. A process replacement may repeat an uncommitted page, but resumes from the last committed forward checkpoint or target cursor; repeated requests are idempotent and counts are keyed by chat/range before addition.

Finishing uses an explicit checkpoint handshake:

1. the first forward page after backfill writes `phase: "finish"` without finishing remotely;
2. the next page calls `account.finishTakeoutSession(success=true)` through `invokeWithTakeout`;
3. success removes Takeout state; `TAKEOUT_INVALID` is accepted as already finished only while persisted phase is `finish`, covering a lost host acknowledgement after a successful remote finish.

Any other Takeout error remains visible. There is no ordinary-history fallback, guessed id or automatic re-authentication.

### What people see

The existing Telegram account card and module progress plan are reused. During estimate/publication, chats appear and `messages` has a growing denominator with zero historical completion. Then the denominator stops changing and completed messages advance quickly. A real provider delay continues to show `Rate limit (repeat in …)` and clears after its deadline through the existing status refresh.

No frontend component, new progress field or second counter is introduced.

## Interfaces and ownership

- `@magnis/connector-sdk` owns the only in-repository Source stdio program: capabilities, auth-mode gating, tool dispatch, concurrency, push serialization and error replies.
- `SourceCommand` and `magnis.sync.fetch` own all scheduled read requests. The backend owns target selection; the Source owns provider interpretation and reports its own traversed ranges.
- `graph.request_backfill` remains the existing generic request to wake a stopped bounded-history worker. Telegram passes an empty generic payload; no module fabricates a provider action for it, and the value never crosses the Source boundary.
- `LiveDialogPager` continues to own Telegram dialog decoding and peer reconstruction. It gains Takeout/range wrapper inputs rather than a parallel pager.
- `TgClient` continues to own raw GramJS calls and timeouts. It invokes the generated Takeout request classes.
- `runBootstrap`, `runCatchup`, and the Telegram fetch handler continue to own checkpoint and page assembly. There is no execute-based backfill handler.
- `AccountAdmission` continues to own account-wide request admission and enforces temporary provider deadlines only.
- The Telegram module continues to own admission/exclusion and plan totals; only its obsolete `backfill_chat` wake payload is removed.

## Exact change zones

`magnis-app`, one prerequisite PR into `staging`:

- MODIFY `backend/src/services/sources/runtime/source-protocol.adapter.ts`, `backend/src/services/sources/runtime/source-host.client.ts`, `backend/src/services/sources/runtime/source-runtime.ts`, `backend/src/services/sources/runtime/source-sync-page.codec.ts`, and `backend/src/services/sources/sync/sync.page-admission.ts` — express scope, target and checkpoint in the common fetch request; route every read through `callNativeFetch`; delete the Telegram request/result adapter and provider payload inspection.
- MODIFY `backend/test/tst_bts_mcp_runtime.test.ts`, `backend/test/tst_bts_sync_worker_001.test.ts`, and `backend/test/tst_bts_src_module_adapter_001.test.ts` — prove the exact generic request/result and forbid provider literals or `magnis.execute` in the sync runtime.
- MODIFY `docs/backend/sync.md` and `docs/source-mcp-bridge.md` — document one fetch path and remove `backfill_chat`.

`magnis`, one catalog PR into `staging` after the app prerequisite:

- MODIFY `packages/connector-sdk/contract/source.ts`, `packages/connector-sdk/index.ts`, `packages/connector-sdk/index.test.ts`, and `packages/connector-sdk/contract-v2.test.ts` — type the standard target/checkpoint/traversed/position fields; enforce auth mode, strict subscriptions, standard push, bounded concurrent dispatch and shared error mapping without connector-specific hooks.
- CREATE `plugins/sources/telegram/src/connector.ts`; DELETE `plugins/sources/telegram/src/dispatch.ts` and `plugins/sources/telegram/src/dispatch.test.ts`; MODIFY `plugins/sources/telegram/src/main.ts`, `plugins/sources/telegram/src/subscriptions.ts`, `plugins/sources/telegram/src/surfaces/telegram/fixture.ts`, `plugins/sources/telegram/src/fixture.test.ts`, and `plugins/sources/telegram/manifest.toml` — use `buildConnectorConfig` + `runConnector`, standard notifications and execute actions; remove `backfill_chat`; declare `runtime_kind = "connector_sdk"`.
- MODIFY `plugins/modules/telegram/module/service.ts` and `plugins/modules/telegram/module/__tests__/telegramCommand.test.ts` — remove the obsolete provider action from the existing generic `graph.request_backfill` wake call; the user-selected chat remains UI state and never becomes a Source command.
- MODIFY `plugins/sources/telegram/src/request-admission.ts`, `plugins/sources/telegram/src/client.ts`, `plugins/sources/telegram/src/live.ts`, `plugins/sources/telegram/src/surfaces/telegram/commands.ts`, `plugins/sources/telegram/src/tst_src_tgflood_001.test.ts`, `plugins/sources/telegram/src/live.test.ts`, `plugins/sources/telegram/src/surfaces/telegram/commands.test.ts`, and `plugins/sources/telegram/src/surfaces/telegram/execute.test.ts` — implement exact temporary holds and Takeout through the standard fetch handler; prove messages have positive positions and `link_end` has none.
- MODIFY `packages/testkit/source.ts`, `packages/testkit/__tests__/tst_cat_src_parity_001.test.ts`, `scripts/certify-sources.ts`, `scripts/certify-sources.test.ts`, and `docs/plugins/source.md` — remove the Telegram custom-runtime exception and reject any current in-repository Source not using the connector SDK.
- REPLACE every hash-addressed receipt affected by the shared SDK bundle and MODIFY the generated catalog indexes selected by the normal publication command; exact generated paths are frozen only after the new package hashes exist.

No runner, performance stand or frontend file is added. `acceptance/telegram-performance/` is reused unchanged and never joins CI.

## Verification journeys

All automated tests use existing fake provider transports and project `agent:*` commands. No test owns a real Telegram credential or PostgreSQL service.

### One Source program

1. **Step 1 → Verify:** the packaged Telegram entry calls `runConnector`; certification reports `runtime_kind = "connector_sdk"`, advertises `magnis.sync.fetch`, and has no custom-runtime exception.
2. **Step 2 → Verify:** hold a fake fetch open, then issue an interactive execute call; the shared SDK returns the execute answer before fetch completes and never exceeds its common bound. Fill the download capacity; a fetch and `listen_stop` still complete.
3. **Step 3 → Verify:** start the packaged Source with `--auth-mode`; sync/listen/execute calls are refused and begin→step retains handler state. In normal mode auth calls are refused.
4. **Step 4 → Verify:** a standard live message carries a positive `position`; a dated `link_end` carries none; missing `subscription_id` is an error, and no `sub:legacy` or `magnis.sync.listen` path exists.
5. **Step 5 → Verify:** the module's wake request contains no provider action, and repository guards find no `backfill_chat`, `legacyTelegram`, Telegram provider literal in backend production sync code, custom Telegram dispatcher or current `runtime_kind = "custom"`.

### Temporary provider hold

1. **Step 1 → Verify:** complete several fake application requests at one clock instant; the next free slot sends immediately, with no minimum interval.
2. **Step 2 → Verify:** inject `FLOOD_WAIT_4`; deadline-minus-one sends nothing and reports one second remaining.
3. **Step 3 → Verify:** advance to the exact deadline; one request sends immediately, and later successful requests never introduce spacing.
4. **Step 4 → Verify:** inject `TAKEOUT_INIT_DELAY_123` without `.seconds`; the standard SDK reply is an exact 123-second typed rate limit. An unparseable 420 still closes admission.

### Exact plan before history

1. **Step 1 → Verify:** initialize Takeout and return two split ranges; the fake wire sees `InitTakeoutSession` then `GetSplitRanges` through `InvokeWithTakeout`.
2. **Step 2 → Verify:** each range starts with `GetDialogs(limit=1)`; return one chat in both ranges and another in one. Every dialog/history count call is nested in `InvokeWithMessagesRange` and `InvokeWithTakeout` using the recorded range.
3. **Step 3 → Verify:** stop after a page and resume its checkpoint; no committed chat/range count is added twice and no range is skipped.
4. **Step 4 → Verify:** finish estimation; both chats are emitted with summed exact counts and recorded peers, and zero message envelopes have been emitted.
5. **Step 5 → Verify:** resume after the last chat page; each seed page repeats the counted chat, emits its newest messages, states `traversed` and fixes its watermark. The module test proves the repeat changes plan by zero and still excludes the same chat; the worker test proves an admitted 120-message chat leaves a bounded older gap while an excluded chat leaves none.

### Standard bounded history and finish

1. **Step 1 → Verify:** the app asks `magnis.sync.fetch` with exact `scope_id`, gap `target`, target `cursor` and opaque `forward_checkpoint`; no execute call occurs.
2. **Step 2 → Verify:** a continuing answer atomically persists its updated Takeout state in the opaque target cursor and reports exact `traversed`; the terminal answer promotes the updated forward checkpoint.
3. **Step 3 → Verify:** after a fake process replacement, Telegram reconstructs the peer without `GetDialogs`, selects only the recorded ranges, respects the asked gap and page budgets, and resumes from the committed cursor.
4. **Step 4 → Verify:** an unfinished old checkpoint causes `CursorExpiredError` and a new bootstrap; an old steady catch-up cursor remains valid.
5. **Step 5 → Verify:** after all fake gaps close, one forward page persists `phase: "finish"` without a finish RPC and the resumed page calls FinishTakeout. Success clears state; `TAKEOUT_INVALID` clears it only from persisted `finish`; every other error remains visible.

Regression commands cover every Connector SDK Source contract, auth, live `link_end`, catch-up, media, queue, replay, cursor, module plan and package certification. Run `bun run agent:verify:pr` in both repositories.

After both artifacts are connected, run the existing manual stand with clean app sync data but the preserved Telegram secret, indexer off, and at least 10,000 admitted envelopes. Report Source fetch, Graph admission, wall time and wall envelope rate. The target is at least 150 envelopes/second when no provider hold occurs. Repeat once with indexer on only after the indexer-off target is met.

The live result is evidence attached to the PR, not a CI acceptance test. If Telegram returns `TAKEOUT_INIT_DELAY_X` or `FLOOD_WAIT_X`, record the exact hold and resume after expiry; do not reinterpret the held run as local performance.

## Invariants

1. Every current in-repository Source executes through `runConnector`; connector-specific dispatchers and current custom-runtime certification are forbidden.
2. Every scheduled Source read uses `magnis.sync.fetch`; `magnis.execute` is never a sync or backfill boundary.
3. The backend's production sync code contains no provider name, provider action or provider payload decoder.
4. A provider wait changes only the shared deadline, never a permanent request interval.
5. At most one Telegram account application request is active; shared SDK concurrency keeps control, interactive actions and incoming updates responsive.
6. Every historical message request in a new bootstrap uses the checkpoint's Takeout id and one of that chat's recorded ranges.
7. No historical message envelope precedes the last counted chat envelope.
8. A seed page bounds an admitted chat's open gap, keeps its count unchanged and removes an excluded chat's gap.
9. The backend transports Source cursors and checkpoints byte-for-byte and never knows their schema.
10. A committed Source page is the only advancement point. A failed provider call publishes neither cursor/checkpoint advancement nor traversed coverage.
11. Existing exclusion remains authoritative: only gaps retained by the module reach Takeout history. The Source does not duplicate `shouldIndex`.
12. Live `link_end` keeps the provider event's date through the standard SDK push envelope and states no message position.

## Constraints and non-goals

- No direct push or merge to `staging`; the owner merges implementation PRs.
- No new runner, worktree helper, Source protocol version, UI state, database table, secret, Graph operation, module rule, background service or SDK fork.
- No connector-specific SDK option or callback. Shared behavior changes apply to every Source; Telegram supplies only ordinary handlers.
- No parallel main Telegram sessions, speculative request rate, randomized delay, exponential delay for 420, or ordinary-history fallback.
- No media export through Takeout; existing on-demand media download remains an interactive execute action.
- No attempt to make a live account test deterministic or suitable for CI.
- No rewrite of normal catch-up semantics beyond carrying Takeout's finish phase through the standard fetch contract.

## Dependencies and delivery boundary

- The plan PR is stacked on `magnis` PR #39, which contains the current Telegram integration and manual performance stand.
- The backend Delivery starts from `magnis-app` PR #278 after the owner merges it into `staging`.
- The catalog Delivery starts from `magnis` PR #39 after merge and depends on the backend Delivery because the new standard fetch fields must be accepted before the new Source artifact is selected.
- Code lives in two repositories, so integration still requires one PR per repository. There is one architecture and no child plan.

## Reuse map

Reuse `SourceCommand`, `callNativeFetch`, `magnis.sync.fetch`, `ConnectorConfig`, `runConnector`, `ConnectorError`, `RateLimitError`, `CursorExpiredError`, `AccountAdmission`, `SessionPool`, `TgClient`, `LiveDialogPager`, `DialogOffset`, `OffsetPeer`, `runBootstrap`, `runCatchup`, `SubscriptionRegistry`, the existing checkpoint `chats` map, page time/byte budgets, Graph gaps, module `message_count` planning, current account card, fake MTProto transport, and `acceptance/telegram-performance`.

## Names introduced

| Name | Reason |
|---|---|
| `takeout` | Telegram's official API name for bulk account export and the exact word used by GramJS classes |
| `estimate`, `publish`, `download`, `finish` | literal durable phases needed to order exact counts, chat publication, selected history and remote completion |

`scopeId`, `target`, `cursor`, `forwardCheckpoint`, `scope_id`, `forward_checkpoint`, `position`, `progress` and `traversed` are existing repository names reused at their current internal or wire boundaries. No `TelegramBackfillPayload` or equivalent name is introduced.

## Pre-approval screen

- Result: one Source program and one read protocol; exact totals first; selected Takeout history second; temporary provider holds only; at least 150 envelopes/second on a clean unheld real run.
- Removed, not extended: custom Telegram dispatch, execute-based backfill, backend Telegram adapter, legacy listen alias and subscription-id fallback.
- Not claimed yet: implementation, a live Takeout authorization, or the target speed on the owner's account.
- After SPEC approval, one Stage graph will be written for the two repository PRs. No implementation starts before the second approval.
<!-- plan:spec:end -->

<!-- plan:implementation:start -->
## Implementation contract

<!-- plan:delivery:D1:start -->
<!-- plan:delivery-meta:{"active":false,"depends":[],"predictedExternalWaitMinutes":0} -->
### PR Delivery D1 — Backend fetch prerequisite merged in magnis-app PR 280

Branch: `feat/source-fetch-contract`; Depends: none; Gate: backend, docs.

Stage graph: `merged prerequisite`.

Forecast: 0 active min / 0 credits across 0 Stages; longest dependency path 0 active min; external waits 0 min.

What changed for people. Bounded history now behaves like every other scheduled Source read.

What changed in the code. magnis-app PR #280 carries scope, target, cursor and forward checkpoint through magnis.sync.fetch and removes the Telegram backfill adapter.

How it was proven. The merged PR passed its backend and documentation gates on exact SHA 6e9f38dd1.

Not in this PR. This completed prerequisite is recorded here only to explain the catalog dependency; no app task remains in this plan.
<!-- plan:delivery:D1:end -->

<!-- plan:delivery:D2:start -->
<!-- plan:delivery-meta:{"active":true,"depends":[],"predictedExternalWaitMinutes":60} -->
### PR Delivery D2 — Telegram uses the shared Source program for exact high-rate Takeout sync

Branch: `feat/telegram-takeout-sync`; Depends: none; Gate: backend, docs, catalog.

Stage graph: `D2-S1 -> D2-S2 -> D2-S3`.

Forecast: 300 active min / 29 credits across 3 Stages; longest dependency path 300 active min; external waits 60 min.

What changed for people. Telegram first publishes stable exact chat/message totals, then downloads selected history as fast as Telegram accepts requests. A real provider hold lasts only until its stated deadline, and link_end keeps the provider event time.

What changed in the code. Telegram becomes an ordinary runConnector config. The shared connector SDK owns dispatch, auth mode, subscriptions, push serialization and errors. Telegram fetch owns the official Takeout estimate, publish, download and finish phases through standard fetch args and results; no custom dispatcher, execute backfill or permanent learned interval remains.

How it was proven. Deterministic SDK and fake-MTProto tests cover concurrency, mode gates, exact waits, Takeout wrappers, totals-before-history, crash resume, bounded gaps and finish. Certification rejects any current in-repository Source outside runConnector. The existing manual stand measures at least 10,000 unheld envelopes with indexer off.

Not in this PR. No frontend, database schema, new runner, parallel main Telegram session, ordinary-history fallback or CI Telegram/PostgreSQL test. Provider holds are reported separately from local throughput.

<!-- plan:stage:D2-S1:start -->
<!-- plan:stage-meta:{"deliveryId":"D2","depends":[],"parallelWith":[],"writes":["packages/connector-sdk/contract/source.ts","packages/connector-sdk/index.ts","packages/connector-sdk/index.test.ts","packages/connector-sdk/contract-v2.test.ts","plugins/sources/telegram/src/connector.ts","plugins/sources/telegram/src/dispatch.ts","plugins/sources/telegram/src/dispatch.test.ts","plugins/sources/telegram/src/main.ts","plugins/sources/telegram/src/subscriptions.ts","plugins/sources/telegram/src/surfaces/telegram/fixture.ts","plugins/sources/telegram/src/fixture.test.ts","plugins/sources/telegram/src/live.ts","plugins/sources/telegram/src/live.test.ts","plugins/sources/telegram/src/surfaces/telegram/commands.ts","plugins/sources/telegram/src/surfaces/telegram/commands.test.ts","plugins/sources/telegram/src/surfaces/telegram/execute.test.ts","plugins/sources/telegram/src/tst_src_tgflood_001.test.ts","plugins/sources/telegram/src/testing/mtproto-transport.ts","plugins/sources/telegram/manifest.toml"],"tempRoot":".tmp/code-production/telegram-takeout-sync/D2-S1","predictedActiveMinutes":90,"predictedCredits":9,"verifyActiveMinutes":15,"verifyCredits":2} -->
#### Stage D2-S1 — Telegram runs as an ordinary Connector SDK Source

- Owner: root; Profile: strong; Depends: none; Parallel with: none.
- Writes: `packages/connector-sdk/contract/source.ts`, `packages/connector-sdk/index.ts`, `packages/connector-sdk/index.test.ts`, `packages/connector-sdk/contract-v2.test.ts`, `plugins/sources/telegram/src/connector.ts`, `plugins/sources/telegram/src/dispatch.ts`, `plugins/sources/telegram/src/dispatch.test.ts`, `plugins/sources/telegram/src/main.ts`, `plugins/sources/telegram/src/subscriptions.ts`, `plugins/sources/telegram/src/surfaces/telegram/fixture.ts`, `plugins/sources/telegram/src/fixture.test.ts`, `plugins/sources/telegram/src/live.ts`, `plugins/sources/telegram/src/live.test.ts`, `plugins/sources/telegram/src/surfaces/telegram/commands.ts`, `plugins/sources/telegram/src/surfaces/telegram/commands.test.ts`, `plugins/sources/telegram/src/surfaces/telegram/execute.test.ts`, `plugins/sources/telegram/src/tst_src_tgflood_001.test.ts`, `plugins/sources/telegram/src/testing/mtproto-transport.ts`, `plugins/sources/telegram/manifest.toml`.
- Temp root: `.tmp/code-production/telegram-takeout-sync/D2-S1` (must be absent at handoff).
- Of which verification: 15 active min / 2 credits.

What this Stage solves. Telegram is the only current Source with a copied stdio dispatcher, an execute action for reads, a legacy subscription fallback and custom notification serialization.

What is built. The connector SDK accepts the existing standard target, checkpoint, progress, traversed and optional position fields; runConnector owns bounded concurrent calls, separate download capacity, auth-mode gating, strict subscription ids, push serialization and typed errors for every Source. Telegram supplies buildConnectorConfig in connector.ts and main.ts calls runConnector. The custom dispatcher and execute backfill are deleted; the existing bounded-history behavior moves intact behind standard fetch until the next Stage replaces its provider calls with Takeout. Messages keep positive positions and link_end omits message position while retaining its date.

How it is proven. tst_src_sdk_runtime_001 holds fetch and download calls while control and interactive calls complete within the shared bounds. tst_src_tg_runtime_001 runs bootstrap, bounded history, actions and live delivery through the Telegram config and observes only standard tools and envelopes. Existing queue and command suites use fetch instead of backfill_chat.

Commit. refactor(telegram): use the shared Source program — delete custom dispatch and execute-based reads.

##### Tasks

- [x] SOURCEPROGRAM_001 — Make runConnector own the standard fetch fields, concurrent dispatch, auth mode, strict subscriptions, push positions and typed errors for every Source. (35 min) — 4a35e8719f90dd97ff82d9adc35a33b600126a13
<!-- plan:task-meta:{"writes":["packages/connector-sdk/contract/source.ts","packages/connector-sdk/index.ts","packages/connector-sdk/index.test.ts","packages/connector-sdk/contract-v2.test.ts"],"predictedActiveMinutes":35,"predictedCredits":3,"how":"Extend the existing FetchArgs, FetchResult and Envelope shapes in packages/connector-sdk/contract/source.ts with the standard fields already named by the host. In packages/connector-sdk/index.ts extend runConnector itself with the one shared bounded dispatcher, separate download capacity, --auth-mode gate, required subscription_id, optional envelope position, push capability without interval_secs, and existing error classes. Update packages/connector-sdk/index.test.ts with metadata-backed tst_src_sdk_runtime_001 and adjust packages/connector-sdk/contract-v2.test.ts fixtures to the same contract.","red":"bun run agent:test:backend -- packages/connector-sdk/index.test.ts -t tst_src_sdk_runtime_001"} -->
- [x] SOURCEPROGRAM_002 — Replace Telegram's dispatcher with buildConnectorConfig plus runConnector and keep link_end time without claiming message coverage. (40 min) — 4a35e8719f90dd97ff82d9adc35a33b600126a13
<!-- plan:task-meta:{"writes":["plugins/sources/telegram/src/connector.ts","plugins/sources/telegram/src/dispatch.ts","plugins/sources/telegram/src/dispatch.test.ts","plugins/sources/telegram/src/main.ts","plugins/sources/telegram/src/subscriptions.ts","plugins/sources/telegram/src/surfaces/telegram/fixture.ts","plugins/sources/telegram/src/fixture.test.ts","plugins/sources/telegram/src/live.ts","plugins/sources/telegram/src/live.test.ts","plugins/sources/telegram/src/surfaces/telegram/commands.ts","plugins/sources/telegram/src/surfaces/telegram/commands.test.ts","plugins/sources/telegram/src/surfaces/telegram/execute.test.ts","plugins/sources/telegram/src/tst_src_tgflood_001.test.ts","plugins/sources/telegram/src/testing/mtproto-transport.ts","plugins/sources/telegram/manifest.toml"],"predictedActiveMinutes":40,"predictedCredits":4,"how":"Create plugins/sources/telegram/src/connector.ts as the ordinary ConnectorConfig owner and make plugins/sources/telegram/src/main.ts call runConnector. Delete plugins/sources/telegram/src/dispatch.ts and its test, reduce subscriptions.ts to provider listener ownership that emits SDK Envelopes, and adapt fixture.ts. Move the existing bounded-history handler in commands.ts from backfill_chat execute arguments to standard scope_id, target, cursor and forward_checkpoint fetch arguments; update commands.test.ts, execute.test.ts and tst_src_tgflood_001.test.ts to call fetch and remove every backfill_chat case. Set runtime_kind to connector_sdk in manifest.toml. Add tst_src_tg_runtime_001 metadata in fixture.test.ts; update live.ts and live.test.ts so messages have positive positions and link_end retains its date with no position.","red":"bun run agent:test:backend -- plugins/sources/telegram/src/fixture.test.ts -t tst_src_tg_runtime_001"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- packages/connector-sdk/index.test.ts` exits 0 — one shared dispatcher keeps fetch, downloads, actions and control responsive within their declared bounds — 4a35e8719f90dd97ff82d9adc35a33b600126a13
- [x] `bun run agent:test:backend -- plugins/sources/telegram/src/fixture.test.ts` exits 0 — Telegram exposes the standard Connector SDK tools and no execute backfill — 4a35e8719f90dd97ff82d9adc35a33b600126a13
- [ ] The shared SDK and Telegram Source contain no custom dispatcher, magnis.sync.listen alias, sub:legacy fallback or current runtime_kind=custom declaration
- [ ] A live message carries a positive position; dated link_end carries no message position
- [x] Commit — 4a35e8719f90dd97ff82d9adc35a33b600126a13

##### Results

<!-- plan:results:D2-S1:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| SOURCEPROGRAM_001 | 4a35e8719f90dd97ff82d9adc35a33b600126a13 | 2026-09-22T17:59:01.379Z–2026-09-22T18:45:44.000Z | 44 / 47 min | unavailable: runner did not expose usage | Telegram now runs through the shared Connector SDK with standard fetch, strict subscriptions, shared errors and SDK-owned push serialization; the copied dispatcher and execute-based history read are gone. |
| SOURCEPROGRAM_002 | 4a35e8719f90dd97ff82d9adc35a33b600126a13 | 2026-09-22T17:59:01.379Z–2026-09-22T18:45:44.000Z | 44 / 47 min | unavailable: runner did not expose usage | Telegram now runs through the shared Connector SDK with standard fetch, strict subscriptions, shared errors and SDK-owned push serialization; the copied dispatcher and execute-based history read are gone. |
<!-- plan:results:D2-S1:end -->
<!-- plan:stage:D2-S1:end -->

<!-- plan:stage:D2-S2:start -->
<!-- plan:stage-meta:{"deliveryId":"D2","depends":["D2-S1"],"parallelWith":[],"writes":["plugins/sources/telegram/src/connector.ts","plugins/sources/telegram/src/request-admission.ts","plugins/sources/telegram/src/client.ts","plugins/sources/telegram/src/live.ts","plugins/sources/telegram/src/surfaces/telegram/commands.ts","plugins/sources/telegram/src/tst_src_tgflood_001.test.ts","plugins/sources/telegram/src/live.test.ts","plugins/sources/telegram/src/surfaces/telegram/commands.test.ts","plugins/sources/telegram/src/surfaces/telegram/execute.test.ts"],"tempRoot":".tmp/code-production/telegram-takeout-sync/D2-S2","predictedActiveMinutes":150,"predictedCredits":14,"verifyActiveMinutes":25,"verifyCredits":3} -->
#### Stage D2-S2 — Telegram fetch completes exact resumable Takeout history at provider speed

- Owner: root; Profile: strong; Depends: D2-S1; Parallel with: none.
- Writes: `plugins/sources/telegram/src/connector.ts`, `plugins/sources/telegram/src/request-admission.ts`, `plugins/sources/telegram/src/client.ts`, `plugins/sources/telegram/src/live.ts`, `plugins/sources/telegram/src/surfaces/telegram/commands.ts`, `plugins/sources/telegram/src/tst_src_tgflood_001.test.ts`, `plugins/sources/telegram/src/live.test.ts`, `plugins/sources/telegram/src/surfaces/telegram/commands.test.ts`, `plugins/sources/telegram/src/surfaces/telegram/execute.test.ts`.
- Temp root: `.tmp/code-production/telegram-takeout-sync/D2-S2` (must be absent at handoff).
- Of which verification: 25 active min / 3 credits.

What this Stage solves. AccountAdmission turns one remote 420 into permanent spacing, while bootstrap interleaves changing totals and messages and bounded history cannot resume an official Takeout export.

What is built. AccountAdmission retains its one-active-request queue and exact shared deadline but removes every learned interval. The Telegram client exposes GramJS Takeout, split-range, wrapped dialog/history and finish calls. The fetch checkpoint advances through estimate, publish, download and finish: it counts each recorded chat/range before emitting history, publishes final chat totals, seeds bounded gaps, serves selected gaps from opaque target cursors, promotes the terminal forward checkpoint and finishes Takeout with the persisted handshake. No ordinary-history fallback exists.

How it is proven. tst_src_tgflood_007 covers exact numeric holds, malformed 420 refusal and immediate post-deadline admission. tst_src_tg_takeout_plan_001 proves wrapped ranges and all totals before messages. tst_src_tg_takeout_resume_002 proves crash resume, bounded traversal, terminal checkpoint promotion and finish recovery.

Commit. feat(telegram): sync history through resumable Takeout — exact totals first, selected gaps next, temporary provider holds only.

##### Tasks

- [ ] TELEGRAMHOLD_001 — Remove learned request spacing and release one queued Telegram request at the exact provider deadline. (20 min)
<!-- plan:task-meta:{"writes":["plugins/sources/telegram/src/request-admission.ts","plugins/sources/telegram/src/client.ts","plugins/sources/telegram/src/tst_src_tgflood_001.test.ts"],"predictedActiveMinutes":20,"predictedCredits":2,"how":"Delete completedCount, completedStartedAt, lastSentAt, requestIntervalMs and derived wake/select spacing from plugins/sources/telegram/src/request-admission.ts. In plugins/sources/telegram/src/client.ts parse exact non-negative suffixes for FLOOD_WAIT, FLOOD_PREMIUM_WAIT and TAKEOUT_INIT_DELAY and leave an invalid 420 closed. Add metadata-backed tst_src_tgflood_007 to plugins/sources/telegram/src/tst_src_tgflood_001.test.ts with a fake clock covering successful bursts, deadline-minus-one, exact expiry, a second hold and malformed input.","red":"bun run agent:test:backend -- plugins/sources/telegram/src/tst_src_tgflood_001.test.ts -t tst_src_tgflood_007"} -->
- [ ] TELEGRAMTAKEOUT_001 — Count every Takeout dialog history before emitting messages, then publish fixed chat totals and seed bounded gaps. (55 min)
<!-- plan:task-meta:{"writes":["plugins/sources/telegram/src/connector.ts","plugins/sources/telegram/src/client.ts","plugins/sources/telegram/src/live.ts","plugins/sources/telegram/src/surfaces/telegram/commands.ts","plugins/sources/telegram/src/live.test.ts","plugins/sources/telegram/src/surfaces/telegram/commands.test.ts"],"predictedActiveMinutes":55,"predictedCredits":4,"how":"Add the generated GramJS Takeout, split-range, InvokeWithMessagesRange and InvokeWithTakeout calls to the existing TgClient owner in plugins/sources/telegram/src/client.ts and pass them through LiveDialogPager in live.ts. In commands.ts advance the existing checkpoint through estimate and publish, store decimal Takeout id plus recorded peers/ranges/counts/offsets, emit every final chat before any message, then seed each chat within the existing time and byte budgets. Wire the standard FetchArgs in connector.ts. Add metadata-backed tst_src_tg_takeout_plan_001 to commands.test.ts using the existing fake transport and update live.test.ts for the exact nested calls.","red":"bun run agent:test:backend -- plugins/sources/telegram/src/surfaces/telegram/commands.test.ts -t tst_src_tg_takeout_plan_001"} -->
- [ ] TELEGRAMTAKEOUT_002 — Resume selected Takeout gaps from opaque cursors, promote terminal checkpoints and finish the export exactly once after persisted intent. (50 min)
<!-- plan:task-meta:{"writes":["plugins/sources/telegram/src/connector.ts","plugins/sources/telegram/src/client.ts","plugins/sources/telegram/src/live.ts","plugins/sources/telegram/src/surfaces/telegram/commands.ts","plugins/sources/telegram/src/live.test.ts","plugins/sources/telegram/src/surfaces/telegram/commands.test.ts","plugins/sources/telegram/src/surfaces/telegram/execute.test.ts"],"predictedActiveMinutes":50,"predictedCredits":5,"how":"In commands.ts interpret scope_id, gap target, target cursor and forward_checkpoint only inside Telegram fetch; reconstruct the recorded peer, select its recorded ranges and return exact traversed plus continueTarget or completeTarget progress. Preserve updated Takeout state in each cursor and promote it only on terminal success. Add the two-step finish phase and accept TAKEOUT_INVALID only after persisted finish intent; throw CursorExpiredError for unfinished old checkpoints and keep old steady catch-up valid. Update connector.ts, client.ts and live.ts only for those existing owner calls. Add metadata-backed tst_src_tg_takeout_resume_002 to commands.test.ts and update live.test.ts and execute.test.ts for resume, finish and absence of backfill action.","red":"bun run agent:test:backend -- plugins/sources/telegram/src/surfaces/telegram/commands.test.ts -t tst_src_tg_takeout_resume_002"} -->

##### Acceptance criteria

- [ ] `bun run agent:test:backend -- plugins/sources/telegram/src/tst_src_tgflood_001.test.ts` exits 0 — successful calls create no spacing and every real provider hold ends at its exact deadline
- [ ] `bun run agent:test:backend -- plugins/sources/telegram/src/surfaces/telegram/commands.test.ts` exits 0 — exact totals precede history and Takeout gaps resume, complete and finish through standard fetch
- [ ] `bun run agent:test:backend -- plugins/sources/telegram/src/live.test.ts` exits 0 — every historical provider call is wrapped in its recorded Takeout range
- [ ] An unparseable 420, unknown Takeout failure or unfinished old checkpoint remains an explicit error; no guessed delay or ordinary-history fallback exists
- [ ] Every successful page is resumable from its committed opaque cursor or forward checkpoint and a failed provider call advances neither coverage nor checkpoint
- [ ] Commit

##### Results

<!-- plan:results:D2-S2:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D2-S2:end -->
<!-- plan:stage:D2-S2:end -->

<!-- plan:stage:D2-S3:start -->
<!-- plan:stage-meta:{"deliveryId":"D2","depends":["D2-S2"],"parallelWith":[],"writes":["packages/testkit/source.ts","packages/testkit/host-driver.ts","packages/testkit/__tests__/tst_cat_src_parity_001.test.ts","plugins/sources/mock-statemachine-phone/manifest.toml","plugins/sources/mock-statemachine-phone/src/certification.test.ts","plugins/modules/telegram/module/service.ts","plugins/modules/telegram/module/__tests__/telegramCommand.test.ts","scripts/certify-sources.ts","scripts/certify-sources.test.ts","docs/plugins/source.md","dist/receipts/*.json"],"tempRoot":".tmp/code-production/telegram-takeout-sync/D2-S3","predictedActiveMinutes":60,"predictedCredits":6,"verifyActiveMinutes":20,"verifyCredits":2} -->
#### Stage D2-S3 — The published Source set proves one runtime and the live stand proves throughput

- Owner: root; Profile: strong; Depends: D2-S2; Parallel with: none.
- Writes: `packages/testkit/source.ts`, `packages/testkit/host-driver.ts`, `packages/testkit/__tests__/tst_cat_src_parity_001.test.ts`, `plugins/sources/mock-statemachine-phone/manifest.toml`, `plugins/sources/mock-statemachine-phone/src/certification.test.ts`, `plugins/modules/telegram/module/service.ts`, `plugins/modules/telegram/module/__tests__/telegramCommand.test.ts`, `scripts/certify-sources.ts`, `scripts/certify-sources.test.ts`, `docs/plugins/source.md`, `dist/receipts/*.json`.
- Temp root: `.tmp/code-production/telegram-takeout-sync/D2-S3` (must be absent at handoff).
- Of which verification: 20 active min / 2 credits.

What this Stage solves. Current certification still permits Telegram's custom runtime and one current mock Source still advertises the legacy listen operation. The module also still fabricates a dead Telegram backfill action, and changed inlined SDK bytes invalidate hash-addressed Source receipts. Correct fake-provider behavior alone does not establish real-account throughput.

What is built. The module keeps graph.request_backfill as an empty generic wake. Testkit, current Source manifests and catalog certification require connector_sdk plus the standard operation set and reject the legacy listen operation, subscription fallback, custom Telegram dispatcher and execute backfill. The normal catalog build regenerates only the affected hash-addressed receipts and indexes from the finished bundles. Documentation states one Source program. The existing manual stand resets sync data without secrets and measures the final app/catalog commits with indexer off.

How it is proven. tst_mod_tg_backfill_wake_001 sees no provider payload. tst_cat_src_parity_001 exercises every current Source through the shared program; tst_cat_src_cert_003 rejects a current custom runtime and legacy operation. The complete catalog gate builds all packages. A real unheld run of at least 10,000 admitted envelopes records Source fetch, Graph admission, overlap, wall time and at least 150 envelopes per second.

Commit. chore(catalog): certify the unified Source runtime — remove the last legacy declarations and refresh exact receipts after the shared SDK and Telegram bundles pass.

##### Tasks

- [ ] SOURCEPROGRAM_003 — Keep graph.request_backfill as a generic wake while removing Telegram's backfill_chat payload from the module. (10 min)
<!-- plan:task-meta:{"writes":["plugins/modules/telegram/module/service.ts","plugins/modules/telegram/module/__tests__/telegramCommand.test.ts"],"predictedActiveMinutes":10,"predictedCredits":1,"how":"Change plugins/modules/telegram/module/service.ts so the existing graph.request_backfill call sends only its generic empty payload and never names backfill_chat or a chat id. Add metadata-backed tst_mod_tg_backfill_wake_001 to plugins/modules/telegram/module/__tests__/telegramCommand.test.ts and keep the selected chat only as module state.","red":"bun run agent:test:backend -- plugins/modules/telegram/module/__tests__/telegramCommand.test.ts -t tst_mod_tg_backfill_wake_001"} -->
- [ ] SOURCECERT_001 — Reject every current in-repository Source that does not use the Connector SDK or still advertises a legacy operation, then refresh exact receipts. (30 min)
<!-- plan:task-meta:{"writes":["packages/testkit/source.ts","packages/testkit/host-driver.ts","packages/testkit/__tests__/tst_cat_src_parity_001.test.ts","plugins/sources/mock-statemachine-phone/manifest.toml","plugins/sources/mock-statemachine-phone/src/certification.test.ts","scripts/certify-sources.ts","scripts/certify-sources.test.ts","docs/plugins/source.md","dist/receipts/*.json"],"predictedActiveMinutes":30,"predictedCredits":3,"how":"Remove the current-runtime Telegram exception and legacy operation inputs from packages/testkit/source.ts, packages/testkit/host-driver.ts and packages/testkit/__tests__/tst_cat_src_parity_001.test.ts while retaining immutable historical selected-channel evidence. Remove magnis.sync.listen from plugins/sources/mock-statemachine-phone/manifest.toml and its certification.test.ts. In scripts/certify-sources.ts require connector_sdk and the standard operation set for every current in-repository Source; add metadata-backed tst_cat_src_cert_003 in scripts/certify-sources.test.ts. Update docs/plugins/source.md. Run the existing catalog build so dist/receipts/*.json matches the finished inlined bundles and no stale current receipt remains.","red":"bun run agent:test:backend -- scripts/certify-sources.test.ts -t tst_cat_src_cert_003"} -->

##### Acceptance criteria

- [ ] `bun run agent:test:backend -- scripts/certify-sources.test.ts` exits 0 — certification rejects current custom runtimes and legacy Source operations
- [ ] `bun run agent:test:backend -- packages/testkit/__tests__/tst_cat_src_parity_001.test.ts` exits 0 — every current Source runs through the same SDK contract
- [ ] `bun run agent:test:backend -- plugins/modules/telegram/module/__tests__/telegramCommand.test.ts` exits 0 — graph.request_backfill carries no provider payload
- [ ] `bun run agent:verify:pr` exits 0 — the complete catalog gate builds and verifies the final Delivery once
- [ ] The existing manual Telegram performance stand preserves secrets, uses the final clean app/catalog commits and runs outside CI
- [ ] With indexer off and no provider hold, at least 10,000 admitted envelopes sustain at least 150 envelopes/second by wall time; fetch, Graph admission and overlap are attached to the PR
- [ ] If Telegram returns a provider hold, its exact duration is reported and that run makes no local-throughput claim
- [ ] No frontend file, workflow, runner or live-provider automated test changed
- [ ] Commit

##### Results

<!-- plan:results:D2-S3:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D2-S3:end -->
<!-- plan:stage:D2-S3:end -->
<!-- plan:delivery:D2:end -->
<!-- plan:implementation:end -->

<!-- plan:execution:start -->
## Execution log

- lock-spec sha256:fddbcc2b66e31efe9b35adea4e8cd96715fd2996b95f6baa8094e848cb3e7ffd owner:давай стадии

- put-delivery D1

- put-stage D1-S1

- put-delivery D2

- put-stage D2-S1

- put-stage D2-S2

- put-stage D2-S3

- replace-stage D2-S1

- replace-stage D2-S3

- replace-stage D2-S1

- drop D1-S1

- replace-delivery D1

- replace-delivery D2

- approve sha256:6e7a3cfc25ec72c7a4197b6dca45501c1102bef5b00c4dd9b6bc2f872fbcf55f owner:approved

- deviation D2-S1: Preflight agent-stack check reports the vendored plan runtime, vocabulary, retro register and pre-push hook stale against the global installer. Those process files are outside this Telegram Stage, so the verified vendored planctl and repository hooks remain unchanged; frozen install succeeded with an explicit writable Bun temp directory.

- deviation D2-S1: The Telegram evidence hash enumerator hard-coded the dispatcher file that this Stage deletes; update plugins/sources/telegram/src/testing/mtproto-transport.ts to hash connector.ts instead so the existing deterministic evidence suite still runs.

- amend implementation owner:да sha256:ac69e0d9bd7da53eede11dff375e6ac288627ab84285147148d1adae43abafba

- record-result D2-S1 commit:4a35e8719f90dd97ff82d9adc35a33b600126a13

- deviation D2-S1: The vendored process stack is stale against the global installer; it is outside this Stage and remained unchanged.

- deviation D2-S1: The existing evidence hash enumerator had to replace the deleted dispatcher path with connector.ts so deterministic evidence could still run.

- close D2-S1 partial commit:4a35e8719f90dd97ff82d9adc35a33b600126a13
<!-- plan:execution:end -->
