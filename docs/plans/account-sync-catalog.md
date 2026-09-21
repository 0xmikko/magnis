# Every Source states its counts and every module states its plan

Status: APPROVED  
Spec lock: sha256:68e0aebc008e04c12bc42733e0c7e3e5f4a1c6c0cbeb772f3957078e3c598cf2 owner:approved  
Implementation lock: sha256:02c2be3b35e49aaba5268473c8dec1a3dafb81a477bec0a863205e6af06e104e owner:Implement the plan.  
Active Delivery: D1  
Unattended decisions: allowed  

<!-- plan:spec:start -->
## The Goal

Every Source in this catalog states what it can count, and every module states what the sync plans to download, so that the backend's worker (magnis-app `docs/plans/account-sync-state.md`, PR #263) prints `chats 50/50`, `messages 197/197` and `Backfill (ends in est. 15 min)` for any account from receipts alone — with no `sync_plan` answer, no `total`/`discovered` counters on the page, and no count invented anywhere.

Success metrics:

- **Telegram, on the backend's stand:** `tst_src_int_telegram_sync_001` runs against the module archive built from this branch and shows `messages 197/197` and `chats 50/50`, stage `live`, no `sync_plan` on the wire; the 120- and 70-message chats are backfilled because the Source stated the ranges its first page traversed.
- **One author per number:** the Source states counts and traversed ranges; the module states plan deltas and exclusions; neither derives the other's number. `grep` finds no `sync_plan`, `backfill_priority`, `discovered` or page `total` in `plugins/`.
- **Every module declares its progress names once**, in its manifest, for the schemas it fills from the surface: the backend reads them, the module never repeats them.
- **Smallest change:** the wire shapes the backend already accepts (magnis-app `backend/src/plugin-runtime/sync-receipt.ts`, `source-envelope.ts`, `source-sync-page.codec.ts`) are the contract; no new host op, no new SDK package, no second plan mechanism.

## Why now

magnis-app's account-sync-state Delivery D1 (Stages S1–S6 landed 2026-09-18) replaced the worker's 46-field state with one row and reads the plan from page receipts. Its stand Stage (D1-S7) re-pins the Telegram module archive from this branch and waits for it; its Telegram journeys are `test.skip` until the Source states traversed ranges. Until every other Source and module follow, their accounts print `synced` alone (`estimation: "unplanned"`), which is honest but blind.

## The target

### What the backend now asks of a Source and a module

```
Source page (magnis.sync.fetch answer, v1 camelCase result)
  { envelopes, nextCursor, hasMore, traversed: { "<scopeId>": [from, to] } }
    a scope envelope carries the count of its items (Telegram: message_count on the chat)
    traversed: per scope, the inclusive id range this page read; a scope whose ids are not
    integers (Gmail, contacts, events, posts) states nothing — its bootstrap walks the whole set
  live notification params gain position: { scope_id, id } (a live item trims its scope's open range)
  backfill (magnis.execute backfill_chat) is unchanged: the backend computes what it traversed

Module ingest (<module>.__sync__ params) gains generation: "initial:<rowId>:<lease>" — the pass
  answer: { dropped_remote_ids, trigger_checks, plan?: { "<schema>": { total, skipped } }, excluded?: [scopeId] }
    plan: each schema's count RELATIVE to the module's last statement for the scopes on the page
    excluded: every scope the module leaves out of history, each time a page touches it
Module reconcile (<module>.__sync_complete__ params { user_id, source_id, account_id, identity_key, generation })
  answer: { departed: [scopeId], plan?: { "<schema>": { total, skipped } } }   (negative deltas for what left)
Module manifest: [surfaces.<surface>] progress = { "<schema>" = "<printed name>" }, reconciliation = { mode = "full_snapshot" }
  where the module reconciles membership by the pass
```

### Telegram — the module states from the membership link

The `observed_in` edge from the operator's `telegram.account` to a chat is the per-account membership fact; the module keeps its last statement for that chat on it: `sync_pass` (the generation it was stated in), `sync_total` and `sync_skipped` (messages). The edge filter of `list_entities_window` reads one flat key, so the three keys are flat.

For every chat envelope on a page (bootstrap, catch-up restatement, a chat re-asserted with a live item):

| the chat | messages planned | messages skipped | chats |
|---|---|---|---|
| admitted (private, `member_count ≤ 100`, `is_indexed = true`, pinned) with `message_count = C` | `C` | `0` | `+1` on a new pass |
| excluded (the rest) with `message_count = C` | `min(C, 50)` — its first page | `C − min(C, 50)` | `+1` on a new pass; the chat id in `excluded` |
| no `message_count` on the envelope | unchanged | unchanged | `+1` on a new pass |

The delta stated is `planned − sync_total`, `skipped − sync_skipped` when `sync_pass` equals the page's `generation`, and the full `planned`, `skipped` (plus `chats +1`) when it does not; the link is written in the page's `apply_batch` with the new `sync_*` keys beside the observed state (unread, pins), so the statement and the fact commit together. A live message on an admitted chat states `messages +1` and moves `sync_total` by one; on an excluded chat it states nothing (its history is not planned) — `synced` still moves, as the Graph inserted it. A page without `generation` (a Source effect outside a worker) states nothing and stamps nothing.

`__sync_complete__(generation)`: the chats whose edge carries a `sync_pass` but not this one (two `list_entities_window` calls, `exists` minus `eq`, five hundred a page) have left: the edge decays, their `sync_total`/`sync_skipped` are answered as negative `plan` deltas with `chats −1`, and their ids are answered as `departed`. A chat re-reported after decay is restored to canonical by its next envelope (`set_link_status`), stated in full again. `sync_plan`, `backfill_priority`, `SyncPlan`, `syncPlan()` and `backfillPriority()` leave the module: the backend asks neither.

### Telegram — the Source states what a page traversed

- Bootstrap: for every dialog whose first history read answered, `traversed[chat_id] = [oldest id in the page, max(top_message, newest id in the page)]`, or `[1, that top]` when the answer was the whole history (`message_count` equals the page's length). A chat with no messages, or whose history read failed transiently, states nothing (its open range stays until a catch-up or a live item bounds it). `total` and `discovered` leave the result.
- Catch-up: for every chat it read, `[committed + 1, target]` when the read reached the committed watermark or answered nothing, else `[oldest id read, before − 1]`; a chat with nothing new states nothing.
- Live: `position = { scope_id: String(chat_id), id: message_id }` on the notification params.
- The fixture Source (`fixture.ts`) states the same for its recorded pages; the backfill action is unchanged.

### The other Sources and modules

| Source / surface | scope envelope and its count | module states | schemas → names |
|---|---|---|---|
| google / email | `{ entity_type: "mailbox", messages_total, skipped }` first in the first bootstrap page (`getProfile.messagesTotal`; `skipped` = `labels/SPAM` + `labels/TRASH` `messagesTotal`, the two labels the list omits) | full on the mailbox envelope; on a history page `+created`, `−deleted` | `email.message` → `messages` |
| google / contacts | `{ entity_type: "list", total_people }` first in the first page (`people.connections.list` → `totalPeople`) | full on the list envelope; `+created` on later pages | `contacts.person` → `contacts` |
| google / meetings | `{ entity_type: "calendar", events_total }` first in the first page, from one ids-only pass over the window (`fields=nextPageToken,items/id`, `maxResults=2500`) | full on the calendar envelope; `+created` on later pages | `meetings.calendar_event` → `events` |
| x / x | the profile envelope gains `posts_total = min(tweet_count, 10)` and `posts_skipped = tweet_count − posts_total` (the Source reads the recent ten, `RECENT_TWEETS`) | full on a profile whose pass is new (`sync_pass` on the profile entity), `+created` posts otherwise | `x.post` → `posts`, `x.profile` → `profiles` |
| anysite / linkedin | the profile envelope, no count (anysite lists posts without a total) | `profiles +1` on a new pass; posts `"unplanned"` | `linkedin.profile` → `profiles` |

A module states only for schemas it fills from the surface; the printed names are the module's, in the manifest, in the order it wants them printed.

### Interfaces

```ts
// plugins/modules/telegram/module/service.ts — what ingest answers
interface SyncReceipt {
  dropped_remote_ids: string[];
  trigger_checks: TriggerCheck[];
  /** Per schema, relative to the module's last statement for the scopes on the page. */
  plan?: Record<string, { total: number; skipped: number }>;
  /** Every excluded chat this page touched, each time. */
  excluded?: string[];
}

/** The observed_in edge's dictionary: the observed state, and the statement. */
interface MembershipState {
  unread_count?: number; unread_mark?: boolean; is_pinned?: boolean; pin_order?: number;
  sync_pass?: string;    // the generation the statement below was made in
  sync_total?: number;   // messages planned for this chat in that pass
  sync_skipped?: number; // messages the plan leaves out of this chat
}

/** What the Source answers magnis.sync.fetch with (v1 result; the host reads `traversed`). */
interface FetchResult {
  envelopes: Record<string, unknown>[];
  nextCursor: Record<string, unknown> | null;
  hasMore: boolean;
  traversed: Record<string, [number, number]>;
}
```

### Verification

- **Telegram module** (`tst_module_telegram_plan_001` rewritten): a bootstrap page of seven chats — private 1,200; group of 40 with 300; supergroup of 5,000 with 886,287; forced-on supergroup 7,000; forced-off private 20; never counted; pinned supergroup 100 — with `generation: "initial:r:1"` answers `plan { "telegram.chat": { total: 7, skipped: 0 }, "telegram.message": { total: 1200 + 300 + 50 + 7000 + 20 + 100, skipped: 886237 } }` and `excluded ["3", "5"]`; the same page again with the same generation answers `plan` zeros and the same `excluded`; a catch-up restatement of chat 1 at 1,205 answers `messages +5`; a live message on chat 1 answers `+1`, on chat 3 nothing; the same page with `"initial:r:2"` answers the full plan again; the links written carry `sync_pass`, `sync_total`, `sync_skipped` beside `is_pinned`; a page without `generation` answers no `plan`. `__sync_complete__("initial:r:2")` over edges stamped `initial:r:1` (chat 6) and `initial:r:2` (the rest) decays chat 6, answers `departed ["6"]` and `plan { chats −1, messages −0 }`, and a second call answers nothing more.
- **Telegram Source** (`tst_tgts_boot_*`, `tst_src_tgfast_*` extended): a bootstrap page over a 120-message chat (first page ids 71–120, `count` 120), a 70-message chat (21–70), a 5-message chat whose answer is the whole history, and an empty chat answers `traversed { "1": [71, 120], "2": [21, 70], "3": [1, 5] }` and nothing for the empty one; a transient history failure states nothing for that chat; the result has no `total`/`discovered`; a catch-up page over a chat with committed 100 and top 130 read in one page answers `[101, 130]`, a two-page gap answers `[oldest, 130]` then `[101, oldest − 1]`; a live update notification carries `position { scope_id, id }`.
- **Other modules and Sources**: each Source's page test asserts the scope envelope and its count on the first page only (and the SPAM/TRASH skipped for Gmail); each module's ingest test asserts the full statement on the scope envelope, `+created` afterwards, and nothing without `generation`.
- **Stand:** the backend's `tst_src_int_telegram_sync_001` against the archive built from this branch (D1-S7 pins it).

### Invariants (each carried by a named test)

1. A module's `plan` is relative: the same page in the same pass states zero; a new pass states in full; a live item states one; a departure states the negative of what was stated. (Telegram: `tst_module_telegram_plan_001`.)
2. The statement and the fact commit together: the Telegram link's `sync_*` keys ride the page's `apply_batch`, never a separate write. (`tst_module_telegram_plan_001`.)
3. `excluded` names every excluded chat a page touches, each time; an excluded chat's live message states nothing. (`tst_module_telegram_plan_001`.)
4. A Source page states, per scope, the inclusive id range it read and nothing it did not read; a whole-history answer traverses from 1; a failed read states nothing; `total`/`discovered` do not appear. (`tst_tgts_boot_014`, `tst_src_tgfast_006`.)
5. A live notification carries the item's position in its scope. (`tst_tglive_position_001`.)
6. Every module manifest declares `progress` names only for schemas it fills from its surface; the backend's manifest parser accepts each. (the build's manifest check.)
7. No module answers `sync_plan` or `backfill_priority`; no Source result carries `total` or `discovered`. (`grep` in the acceptance criteria.)

### Constraints and non-goals

- No new host op; the modules read edges through `list_linked` (per chat, inbound `observed_in`) and `list_entities_window` (edge-filtered, five hundred a page) as today.
- The Telegram backfill action and its answer do not change: the backend's v1 adapter computes the traversed range from the ask and the answer.
- Slack has no Source in this catalog; nothing is planned for it here.
- The backend's own gaps — the v1 fetch codec reading `traversed`, the live listener reading `position`, the reconcile answer's `plan` — are D1's (magnis-app), amended into its stand Stage.

### Reuse

`chatEnvelope`/`messageEnvelope` and `TgChat.message_count` (the count already rides the chat), `catchupProgress` and the per-chat watermark (the catch-up already knows `committed`, `target`, `before`), `resolveHydratedMessages`, `shouldIndex`, `pinnedChatsWindow`'s edge-filtered window, `readChatsByAnchor`, the batch link `metadata`, `set_link_status`, `progressCursor`'s removal, `@magnis/testkit/module`'s `mockGraph`/`mountModule`, the connectors' fake `fetch` doubles.

### Deliveries

- D2 (this repository, one PR): Telegram first — the manifest line, the module's statement from the link, the Source's traversed ranges and live position; then Gmail, contacts, meetings, X, LinkedIn; then the plugin docs. D1's stand Stage (magnis-app) pins the archive after the Telegram Stages.
<!-- plan:spec:end -->

<!-- plan:implementation:start -->
## Implementation contract

<!-- plan:delivery:D1:start -->
<!-- plan:delivery-meta:{"active":true,"depends":[],"predictedExternalWaitMinutes":240} -->
### PR Delivery D1 — Every Source states its counts and every module states its plan

Branch: `feat/account-sync-catalog`; Depends: none; Gate: backend.

Stage graph: `D1-S1 -> D1-S2 -> D1-S3 -> D1-S4 -> D1-S5 -> D1-S6 -> D1-S7 -> D1-S8 -> D1-S9 -> D1-S10 -> D1-S11`.

Forecast: 609 active min / 145 credits across 11 Stages; longest dependency path 609 active min; external waits 240 min.

What changed for people. The Accounts panel prints every account's sync from what its worker holds: for Telegram, chats 50/50 and messages 197/197 with the skipped history named; for Gmail, contacts, meetings and X the planned count on the first page; the Telegram history behind the first page is backfilled because the Source says what each page read.

What changed in the code. The Telegram module declares its progress names and full-snapshot reconciliation in its manifest, states plan deltas relative to the statement it keeps on the observed_in edge, names the chats it excludes, stamps the pass on the edge and answers the departed chats at reconcile; sync_plan and backfill_priority are gone. The Telegram Source states the id ranges each bootstrap and catch-up page traversed and the position of a live item; total and discovered leave its results. Gmail, contacts and meetings carry their counts on a scope envelope on the first page; X carries the planned recent window on the profile; the email, contacts, meetings, x and linkedin modules declare their names and state their plans. The plugin docs describe the receipt, the traversed ranges and the manifest line.

How it was proven. Each module's ingest test states the plan for a fixture page and the same page again; each Source's page test asserts the traversed ranges or the scope count; magnis-app's Telegram stand journey runs against the archive built from this branch (its D1-S7 pins it).

Not in this PR. The backend's reading of traversed on the v1 fetch result, of position on live notifications and of the reconcile answer's plan (magnis-app, account-sync-state D1-S7); Slack, which has no Source here.

<!-- plan:stage:D1-S1:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":[],"parallelWith":[],"writes":["plugins/modules/telegram/manifest.toml","scripts/bundled-item-schemas.test.ts"],"tempRoot":".tmp/code-production/account-sync-catalog/D1-S1","verifyActiveMinutes":3,"verifyCredits":1} -->
#### Stage D1-S1 — The Telegram manifest declares its progress names and full-snapshot reconciliation

- Owner: agent-1; Profile: fast; Depends: none; Parallel with: none.
- Writes: `plugins/modules/telegram/manifest.toml`, `scripts/bundled-item-schemas.test.ts`.
- Temp root: `.tmp/code-production/account-sync-catalog/D1-S1` (must be absent at handoff).
- Predict: 10 active min / 3 credits.
- Of which verification: 3 active min / 1 credits.

What this Stage solves. The backend reads the schemas a surface reports on, and their printed names, from the module manifest; the Telegram manifest declares none, and its reconciliation mode none keeps the worker from calling the module's reconcile hook at all.

What is built. plugins/modules/telegram/manifest.toml gains `progress = { "telegram.chat" = "chats", "telegram.message" = "messages" }` under [surfaces.telegram] and turns `reconciliation` to `{ mode = "full_snapshot" }`; scripts/bundled-item-schemas.test.ts asserts the progress names of every syncing module (the other modules join in their Stages) and the reconciliation mode per module.

How it is proven. tst_pub_item_schemas_001 reads the manifests and expects the names and the mode.

Commit. feat(telegram): the manifest declares chats and messages as the surface's progress and reconciles by full snapshot.

##### Tasks

- [x] ACS_001 — Declare progress names and full_snapshot reconciliation in plugins/modules/telegram/manifest.toml; assert them in scripts/bundled-item-schemas.test.ts. (7 min) — d09c5f6d4d7378484420aa7bde57a888f897f722
<!-- plan:task-meta:{"writes":["plugins/modules/telegram/manifest.toml","scripts/bundled-item-schemas.test.ts"],"predictedActiveMinutes":7,"predictedCredits":2,"how":"add the progress line and change the reconciliation mode under [surfaces.telegram]; the test gains a progress-names table (telegram only until the other Stages) and expects telegram's mode full_snapshot, the others none","red":"bun run agent:test:backend -- scripts/bundled-item-schemas.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- scripts/bundled-item-schemas.test.ts` exits 0 — d09c5f6d4d7378484420aa7bde57a888f897f722
- [x] Commit — d09c5f6d4d7378484420aa7bde57a888f897f722

##### Results

<!-- plan:results:D1-S1:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| ACS_001 | d09c5f6d4d7378484420aa7bde57a888f897f722 | 2026-09-19T19:39:25.925Z–2026-09-19T19:41:25.925Z | 2 / 2 min | unavailable: runner did not expose usage | manifest.toml declares progress {telegram.chat: chats, telegram.message: messages} and reconciliation full_snapshot; bundled-item-schemas.test.ts asserts the names (tst_pub_item_schemas_002) and the mode per module (7/7); build-catalog-index test 13/13. Recorded again after the host move lost the worktree's uncommitted receipt. |
<!-- plan:results:D1-S1:end -->
<!-- plan:stage:D1-S1:end -->

<!-- plan:stage:D1-S2:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S1"],"parallelWith":[],"writes":["plugins/modules/telegram/module/service.ts","plugins/modules/telegram/types.ts","plugins/modules/telegram/module/__tests__/syncPlan.test.ts","plugins/modules/telegram/module/__tests__/telegramIngest.test.ts","plugins/modules/telegram/module/__tests__/telegramCommand.test.ts","plugins/modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts"],"tempRoot":".tmp/code-production/account-sync-catalog/D1-S2","verifyActiveMinutes":15,"verifyCredits":4} -->
#### Stage D1-S2 — The Telegram module states the plan from the membership edge and reconciles by the pass

- Owner: agent-1; Profile: fast; Depends: D1-S1; Parallel with: none.
- Writes: `plugins/modules/telegram/module/service.ts`, `plugins/modules/telegram/types.ts`, `plugins/modules/telegram/module/__tests__/syncPlan.test.ts`, `plugins/modules/telegram/module/__tests__/telegramIngest.test.ts`, `plugins/modules/telegram/module/__tests__/telegramCommand.test.ts`, `plugins/modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts`.
- Temp root: `.tmp/code-production/account-sync-catalog/D1-S2` (must be absent at handoff).
- Predict: 120 active min / 27 credits.
- Of which verification: 15 active min / 4 credits.

What this Stage solves. The module answers a whole plan on demand (sync_plan) from a window over every chat, and reconciles from a list of observed ids the backend no longer sends; the backend now reads the plan from each page's receipt, relative to the module's last statement, and reconciles by the pass generation it stamps on every ingest call.

What is built. In service.ts, ingest reads `generation`, reads the operator's observed_in edge of every existing chat on the page (list_linked, inbound), computes each chat's planned and skipped messages (admitted in full; excluded its first fifty, the rest skipped; uncounted unchanged), states the delta against the edge's sync_total/sync_skipped when sync_pass is this generation and in full (with chats +1) otherwise, writes sync_pass/sync_total/sync_skipped beside the observed state in the page's apply_batch, restores a decayed edge, names every excluded chat in `excluded`, and states messages +1 for a live message on an admitted chat; onSyncComplete(generation) finds the edges stamped with another pass through two edge-filtered chat windows, decays them, and answers `departed` with the negative plan; sync_plan, backfill_priority, SyncPlan and syncPlan leave service.ts and types.ts.

How it is proven. syncPlan.test.ts is rewritten as the plan-from-receipts test (tst_module_telegram_plan_001: the seven-chat page, the same page again, a restatement, a live message, a new pass, the reconcile); telegramIngest.test.ts's membership case reconciles by pass; telegramCommand.test.ts loses the backfill_priority case.

Commit. feat(telegram): the module states its plan from the membership edge — deltas per page, exclusions named, the pass stamped, departures answered at reconcile; sync_plan is gone.

##### Tasks

- [x] ACS_002 — State plan deltas, exclusions and the pass stamp on the observed_in edge in plugins/modules/telegram/module/service.ts; rewrite syncPlan.test.ts as the plan-from-receipts test. (60 min) — 0a49abe779cc613a0d44eb4f38f8224e7b1538fc
<!-- plan:task-meta:{"writes":["plugins/modules/telegram/module/service.ts","plugins/modules/telegram/module/__tests__/syncPlan.test.ts"],"predictedActiveMinutes":60,"predictedCredits":13,"how":"ingest reads params.generation; existing chats' edges are read with list_linked({parent_id: chat, link_kind: observed_in, direction: in}); planned/skipped per chat from message_count, shouldIndex and pins; the delta against sync_total/sync_skipped when sync_pass matches, full otherwise; the link metadata carries the three keys beside the state; the answer carries plan and excluded; a live message on an admitted chat states +1","red":"bun run agent:test:backend -- plugins/modules/telegram/module/__tests__/syncPlan.test.ts"} -->
- [x] ACS_003 — Reconcile by the pass in service.ts onSyncComplete; drop sync_plan, backfill_priority and SyncPlan from service.ts and types.ts; follow in telegramIngest.test.ts, telegramCommand.test.ts. (40 min) — 0a49abe779cc613a0d44eb4f38f8224e7b1538fc
<!-- plan:task-meta:{"writes":["plugins/modules/telegram/module/service.ts","plugins/modules/telegram/types.ts","plugins/modules/telegram/module/__tests__/telegramIngest.test.ts","plugins/modules/telegram/module/__tests__/telegramCommand.test.ts"],"predictedActiveMinutes":40,"predictedCredits":9,"how":"onSyncComplete reads generation; list_entities_window over CHAT with the edge filter sync_pass exists, minus sync_pass eq generation, five hundred a page; each departed chat's edge is found by list_linked and decayed; the answer is {departed, plan: negative totals, chats -1}; the two dead branches and the type are deleted with their tests","red":"bun run agent:test:backend -- plugins/modules/telegram/module/__tests__/telegramIngest.test.ts"} -->
- [x] ACS_017 — Follow the operator-edge read before the chat batch in chatBatchSnapshotMerge.test.ts: one operator lookup, one kind-filtered list_linked per existing chat. (5 min) — 0a49abe779cc613a0d44eb4f38f8224e7b1538fc
<!-- plan:task-meta:{"writes":["plugins/modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts"],"predictedActiveMinutes":5,"predictedCredits":1,"how":"the strict doubles gain find_by_anchor for the operator and list_linked answering no edge; the packet test asserts one lookup and one edge read per existing chat","red":"bun run agent:test:backend -- plugins/modules/telegram/module/__tests__/chatBatchSnapshotMerge.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- plugins/modules/telegram/module/__tests__/syncPlan.test.ts plugins/modules/telegram/module/__tests__/telegramIngest.test.ts plugins/modules/telegram/module/__tests__/telegramCommand.test.ts` exits 0 — 0a49abe779cc613a0d44eb4f38f8224e7b1538fc
- [ ] `git grep -l 'sync_plan\|backfill_priority' -- plugins/modules/telegram` prints nothing
- [x] Commit — 0a49abe779cc613a0d44eb4f38f8224e7b1538fc

##### Results

<!-- plan:results:D1-S2:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| ACS_002 | 0a49abe779cc613a0d44eb4f38f8224e7b1538fc | 2026-09-19T08:16:37.322Z–2026-09-19T19:46:37.322Z | 95 / 690 min | unavailable: runner did not expose usage | ingest states plan deltas per schema against the observed_in edge's sync_pass/sync_total/sync_skipped (full on a new pass, zero on a re-read, the difference on a restatement, +1 for a live message on an admitted chat), names every excluded chat, writes the statement in the page's batch and restores a decayed edge; onSyncComplete(generation) decays the edges of other passes and answers departed with the negative plan; sync_plan, backfill_priority and SyncPlan removed. Module suite 11 files / 41 pass; typecheck and lint clean; hook 20/20. The work was done twice: the host move lost the first, uncommitted copy. |
| ACS_003 | 0a49abe779cc613a0d44eb4f38f8224e7b1538fc | 2026-09-19T08:16:37.322Z–2026-09-19T19:46:37.322Z | 95 / 690 min | unavailable: runner did not expose usage | ingest states plan deltas per schema against the observed_in edge's sync_pass/sync_total/sync_skipped (full on a new pass, zero on a re-read, the difference on a restatement, +1 for a live message on an admitted chat), names every excluded chat, writes the statement in the page's batch and restores a decayed edge; onSyncComplete(generation) decays the edges of other passes and answers departed with the negative plan; sync_plan, backfill_priority and SyncPlan removed. Module suite 11 files / 41 pass; typecheck and lint clean; hook 20/20. The work was done twice: the host move lost the first, uncommitted copy. |
| ACS_017 | 0a49abe779cc613a0d44eb4f38f8224e7b1538fc | 2026-09-19T08:16:37.322Z–2026-09-19T19:46:37.322Z | 95 / 690 min | unavailable: runner did not expose usage | ingest states plan deltas per schema against the observed_in edge's sync_pass/sync_total/sync_skipped (full on a new pass, zero on a re-read, the difference on a restatement, +1 for a live message on an admitted chat), names every excluded chat, writes the statement in the page's batch and restores a decayed edge; onSyncComplete(generation) decays the edges of other passes and answers departed with the negative plan; sync_plan, backfill_priority and SyncPlan removed. Module suite 11 files / 41 pass; typecheck and lint clean; hook 20/20. The work was done twice: the host move lost the first, uncommitted copy. |
<!-- plan:results:D1-S2:end -->
<!-- plan:stage:D1-S2:end -->

<!-- plan:stage:D1-S3:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S2"],"parallelWith":[],"writes":["plugins/sources/telegram/src/surfaces/telegram/commands.ts","plugins/sources/telegram/src/surfaces/telegram/commands.test.ts","plugins/sources/telegram/src/subscriptions.ts","plugins/sources/telegram/src/live.test.ts","plugins/sources/telegram/src/surfaces/telegram/fixture.ts","plugins/sources/telegram/src/fixture.test.ts","plugins/sources/telegram/src/tst_src_tgflood_001.test.ts","plugins/sources/telegram/src/dispatch.test.ts"],"tempRoot":".tmp/code-production/account-sync-catalog/D1-S3","verifyActiveMinutes":15,"verifyCredits":4} -->
#### Stage D1-S3 — The Telegram Source states the ranges its pages traversed and the position of a live item

- Owner: agent-1; Profile: fast; Depends: D1-S2; Parallel with: none.
- Writes: `plugins/sources/telegram/src/surfaces/telegram/commands.ts`, `plugins/sources/telegram/src/surfaces/telegram/commands.test.ts`, `plugins/sources/telegram/src/subscriptions.ts`, `plugins/sources/telegram/src/live.test.ts`, `plugins/sources/telegram/src/surfaces/telegram/fixture.ts`, `plugins/sources/telegram/src/fixture.test.ts`, `plugins/sources/telegram/src/tst_src_tgflood_001.test.ts`, `plugins/sources/telegram/src/dispatch.test.ts`.
- Temp root: `.tmp/code-production/account-sync-catalog/D1-S3` (must be absent at handoff).
- Predict: 100 active min / 23 credits.
- Of which verification: 15 active min / 4 credits.

What this Stage solves. The backend keeps coverage as gaps and cuts what each page says it traversed; the Source's bootstrap and catch-up pages say nothing, so no history behind the first page is ever backfilled, and its results still carry the total/discovered counters the backend no longer reads.

What is built. runBootstrap states, per hydrated dialog, [oldest id in the page, max(top_message, newest id)] or [1, that top] when message_count equals the page's length, nothing for an empty chat or a failed read; runCatchup states [committed + 1, target] when a read reached the watermark or answered nothing, else [oldest read, before − 1]; both drop total and discovered; notificationLine carries position { scope_id, id }; the fixture Source states traversed for its recorded pages; the four test files that asserted the counters follow.

How it is proven. commands.test.ts gains tst_tgts_boot_014 (the 120/70/5/empty page) and tst_tgts_catch_002 (one-page and two-page gaps); live.test.ts gains tst_tglive_position_001; fixture.test.ts asserts traversed on a recorded page; tgflood and dispatch tests lose the counters.

Commit. feat(telegram): the Source states what each page traversed and where a live item sits; total and discovered leave the page.

##### Tasks

- [x] ACS_004 — State traversed ranges on bootstrap and catch-up pages in commands.ts and drop total/discovered; cover in commands.test.ts. (45 min) — f6623d26be50bf0c61ff8c1a7d9e4753cece2a3a
<!-- plan:task-meta:{"writes":["plugins/sources/telegram/src/surfaces/telegram/commands.ts","plugins/sources/telegram/src/surfaces/telegram/commands.test.ts"],"predictedActiveMinutes":45,"predictedCredits":10,"how":"runBootstrap computes the range from paged.messages and paged.chat (top_message, message_count); runCatchup computes it from committed, target, before and the oldest id read; the result is {envelopes, nextCursor, hasMore, traversed}","red":"bun run agent:test:backend -- plugins/sources/telegram/src/surfaces/telegram/commands.test.ts"} -->
- [x] ACS_005 — Carry position on live notifications in subscriptions.ts (live.test.ts); state traversed for fixture pages in fixture.ts (fixture.test.ts). (25 min) — f6623d26be50bf0c61ff8c1a7d9e4753cece2a3a
<!-- plan:task-meta:{"writes":["plugins/sources/telegram/src/subscriptions.ts","plugins/sources/telegram/src/live.test.ts","plugins/sources/telegram/src/surfaces/telegram/fixture.ts","plugins/sources/telegram/src/fixture.test.ts"],"predictedActiveMinutes":25,"predictedCredits":6,"how":"notificationLine and livePushes add position {scope_id: String(chat_id), id: message_id} to the params; fixture.fetchResult states traversed per chat from the recorded messages and drops nothing else","red":"bun run agent:test:backend -- plugins/sources/telegram/src/live.test.ts"} -->
- [x] ACS_006 — Drop the total/discovered assertions from tst_src_tgflood_001.test.ts and dispatch.test.ts; assert traversed where a page is read. (15 min) — f6623d26be50bf0c61ff8c1a7d9e4753cece2a3a
<!-- plan:task-meta:{"writes":["plugins/sources/telegram/src/tst_src_tgflood_001.test.ts","plugins/sources/telegram/src/dispatch.test.ts"],"predictedActiveMinutes":15,"predictedCredits":3,"how":"the journeys assert hasMore and the traversed ranges of the pages they drive instead of the counters","red":"bun run agent:test:backend -- plugins/sources/telegram/src/tst_src_tgflood_001.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- plugins/sources/telegram/src/surfaces/telegram/commands.test.ts plugins/sources/telegram/src/live.test.ts plugins/sources/telegram/src/fixture.test.ts` exits 0 — f6623d26be50bf0c61ff8c1a7d9e4753cece2a3a
- [ ] `git grep -l 'discovered' -- plugins/sources/telegram/src/surfaces/telegram/commands.ts plugins/sources/telegram/src/surfaces/telegram/fixture.ts` prints nothing
- [x] Commit — f6623d26be50bf0c61ff8c1a7d9e4753cece2a3a

##### Results

<!-- plan:results:D1-S3:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| ACS_004 | f6623d26be50bf0c61ff8c1a7d9e4753cece2a3a | 2026-09-19T19:47:36.921Z–2026-09-19T20:10:26.000Z | 23 / 23 min | unavailable: runner did not expose usage | runBootstrap states [oldest, max(top, newest)] per hydrated chat, [1, top] for a whole history, nothing for an empty chat or a failed read; runCatchup states [oldest, before-1] while a gap continues and [committed+1, target] once the read crosses the watermark; total/discovered leave the results; notificationLine and liveUpdatePushes carry position {scope_id, id}; the fixture Source states traversed for its pages. Source suite 163/163; typecheck and lint clean; hook 66/66. |
| ACS_005 | f6623d26be50bf0c61ff8c1a7d9e4753cece2a3a | 2026-09-19T19:47:36.921Z–2026-09-19T20:10:26.000Z | 23 / 23 min | unavailable: runner did not expose usage | runBootstrap states [oldest, max(top, newest)] per hydrated chat, [1, top] for a whole history, nothing for an empty chat or a failed read; runCatchup states [oldest, before-1] while a gap continues and [committed+1, target] once the read crosses the watermark; total/discovered leave the results; notificationLine and liveUpdatePushes carry position {scope_id, id}; the fixture Source states traversed for its pages. Source suite 163/163; typecheck and lint clean; hook 66/66. |
| ACS_006 | f6623d26be50bf0c61ff8c1a7d9e4753cece2a3a | 2026-09-19T19:47:36.921Z–2026-09-19T20:10:26.000Z | 23 / 23 min | unavailable: runner did not expose usage | runBootstrap states [oldest, max(top, newest)] per hydrated chat, [1, top] for a whole history, nothing for an empty chat or a failed read; runCatchup states [oldest, before-1] while a gap continues and [committed+1, target] once the read crosses the watermark; total/discovered leave the results; notificationLine and liveUpdatePushes carry position {scope_id, id}; the fixture Source states traversed for its pages. Source suite 163/163; typecheck and lint clean; hook 66/66. |
<!-- plan:results:D1-S3:end -->
<!-- plan:stage:D1-S3:end -->

<!-- plan:stage:D1-S4:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S3"],"parallelWith":[],"writes":["plugins/sources/google/src/surfaces/email/gmail.ts","plugins/sources/google/src/surfaces/email/gmail.test.ts","plugins/sources/google/src/progress.ts","plugins/modules/email/module/service.ts","plugins/modules/email/module/__tests__/emailIngest.test.ts","plugins/modules/email/manifest.toml","scripts/bundled-item-schemas.test.ts","plugins/sources/google/src/connector.ts","plugins/sources/google/src/__tests__/serde-parity.test.ts","plugins/sources/google/src/__tests__/googleContract.test.ts"],"tempRoot":".tmp/code-production/account-sync-catalog/D1-S4","verifyActiveMinutes":10,"verifyCredits":3} -->
#### Stage D1-S4 — Gmail carries the mailbox count on its first page and the email module states the plan

- Owner: agent-1; Profile: fast; Depends: D1-S3; Parallel with: none.
- Writes: `plugins/sources/google/src/surfaces/email/gmail.ts`, `plugins/sources/google/src/surfaces/email/gmail.test.ts`, `plugins/sources/google/src/progress.ts`, `plugins/modules/email/module/service.ts`, `plugins/modules/email/module/__tests__/emailIngest.test.ts`, `plugins/modules/email/manifest.toml`, `scripts/bundled-item-schemas.test.ts`, `plugins/sources/google/src/connector.ts`, `plugins/sources/google/src/__tests__/serde-parity.test.ts`, `plugins/sources/google/src/__tests__/googleContract.test.ts`.
- Temp root: `.tmp/code-production/account-sync-catalog/D1-S4` (must be absent at handoff).
- Predict: 88 active min / 21 credits.
- Of which verification: 10 active min / 3 credits.

What this Stage solves. The Gmail Source threads messagesTotal through its cursor as a total the backend no longer reads; the email module states nothing, so a Google account prints messages alone.

What is built. fetchMessagePage emits, first in the first bootstrap page, a mailbox envelope { entity_type: "mailbox", messages_total, skipped } where skipped is labels/SPAM plus labels/TRASH messagesTotal (two label reads on that page only); progress.ts and the cursor lose discovered/total; the email module's ingest states messages in full on a mailbox envelope when generation is present, +created after apply on a history page and −1 per deleted message, and skips the mailbox envelope as an entity; the manifest declares progress = { "email.message" = "messages" }.

How it is proven. gmail.test.ts asserts the mailbox envelope on page one only, with the SPAM/TRASH skipped; emailIngest.test.ts asserts the full statement, the +created page and nothing without generation; the manifest test gains the email row.

Commit. feat(google,email): the mailbox states its count on the first page and the email module states the plan.

##### Tasks

- [x] ACS_007 — Emit the mailbox envelope with messages_total and the SPAM/TRASH skipped on Gmail's first page in gmail.ts; drop discovered/total from progress.ts; cover in gmail.test.ts. (35 min) — 28bc3f959e2d9ef59da51a2e67faeee1a912ee5d
<!-- plan:task-meta:{"writes":["plugins/sources/google/src/surfaces/email/gmail.ts","plugins/sources/google/src/surfaces/email/gmail.test.ts","plugins/sources/google/src/progress.ts"],"predictedActiveMinutes":35,"predictedCredits":8,"how":"on page one (no page_token) getProfile plus labels/SPAM and labels/TRASH give the counts; the mailbox envelope precedes the messages; progressCursor/mergeProgress and the cursor keys go","red":"bun run agent:test:backend -- plugins/sources/google/src/surfaces/email/gmail.test.ts"} -->
- [x] ACS_008 — State the plan on the mailbox envelope and +created/−deleted after in email service.ts; declare messages in email manifest.toml; cover in emailIngest.test.ts, bundled-item-schemas.test.ts. (35 min) — 28bc3f959e2d9ef59da51a2e67faeee1a912ee5d
<!-- plan:task-meta:{"writes":["plugins/modules/email/module/service.ts","plugins/modules/email/module/__tests__/emailIngest.test.ts","plugins/modules/email/manifest.toml","scripts/bundled-item-schemas.test.ts"],"predictedActiveMinutes":35,"predictedCredits":8,"how":"ingest reads generation; a mailbox envelope states { \"email.message\": { total: messages_total, skipped } } and is not ingested; other pages state total +created (from the batch result) −deleted; without generation nothing","red":"bun run agent:test:backend -- plugins/modules/email/module/__tests__/emailIngest.test.ts"} -->
- [x] ACS_018 — Drop the email counters from google connector.ts; route labels/SPAM and labels/TRASH in serde-parity.test.ts and googleContract.test.ts and expect the mailbox envelope. (8 min) — 28bc3f959e2d9ef59da51a2e67faeee1a912ee5d
<!-- plan:task-meta:{"writes":["plugins/sources/google/src/connector.ts","plugins/sources/google/src/__tests__/serde-parity.test.ts","plugins/sources/google/src/__tests__/googleContract.test.ts"],"predictedActiveMinutes":8,"predictedCredits":2,"how":"the email case of fetchHandler returns {envelopes, nextCursor, hasMore}; the two shared route fakes answer the label reads; the contract expects two email envelopes and no counters","red":"bun run agent:test:backend -- plugins/sources/google/src/__tests__/serde-parity.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- plugins/sources/google/src/surfaces/email/gmail.test.ts` exits 0 — 28bc3f959e2d9ef59da51a2e67faeee1a912ee5d
- [x] `bun run agent:test:backend -- plugins/modules/email/module/__tests__/emailIngest.test.ts` exits 0 — 28bc3f959e2d9ef59da51a2e67faeee1a912ee5d
- [x] Commit — 28bc3f959e2d9ef59da51a2e67faeee1a912ee5d

##### Results

<!-- plan:results:D1-S4:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| ACS_007 | 28bc3f959e2d9ef59da51a2e67faeee1a912ee5d | 2026-09-19T20:10:33.755Z–2026-09-19T20:24:52.000Z | 15 / 15 min | unavailable: runner did not expose usage | fetchMessagePage opens page one with the mailbox envelope {entity_type mailbox, messages_total, skipped = SPAM + TRASH messagesTotal} when the profile counts, and the page and cursor carry no counters; fetchHistoryChanges likewise; the email module states the mailbox in full, +1 per live mail and -1 per delete, nothing without generation; email manifest declares messages. Gmail 17/17, email module 64/64, Google suite 71/71 under bun 1.3.13 (the pinned version; the certification receipts are minted with it), typecheck and lint clean; hook 47+15. |
| ACS_008 | 28bc3f959e2d9ef59da51a2e67faeee1a912ee5d | 2026-09-19T20:10:33.755Z–2026-09-19T20:24:52.000Z | 15 / 15 min | unavailable: runner did not expose usage | fetchMessagePage opens page one with the mailbox envelope {entity_type mailbox, messages_total, skipped = SPAM + TRASH messagesTotal} when the profile counts, and the page and cursor carry no counters; fetchHistoryChanges likewise; the email module states the mailbox in full, +1 per live mail and -1 per delete, nothing without generation; email manifest declares messages. Gmail 17/17, email module 64/64, Google suite 71/71 under bun 1.3.13 (the pinned version; the certification receipts are minted with it), typecheck and lint clean; hook 47+15. |
| ACS_018 | 28bc3f959e2d9ef59da51a2e67faeee1a912ee5d | 2026-09-19T20:10:33.755Z–2026-09-19T20:24:52.000Z | 15 / 15 min | unavailable: runner did not expose usage | fetchMessagePage opens page one with the mailbox envelope {entity_type mailbox, messages_total, skipped = SPAM + TRASH messagesTotal} when the profile counts, and the page and cursor carry no counters; fetchHistoryChanges likewise; the email module states the mailbox in full, +1 per live mail and -1 per delete, nothing without generation; email manifest declares messages. Gmail 17/17, email module 64/64, Google suite 71/71 under bun 1.3.13 (the pinned version; the certification receipts are minted with it), typecheck and lint clean; hook 47+15. |
<!-- plan:results:D1-S4:end -->
<!-- plan:stage:D1-S4:end -->

<!-- plan:stage:D1-S5:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S4"],"parallelWith":[],"writes":["plugins/sources/google/src/surfaces/contacts/contacts.ts","plugins/sources/google/src/surfaces/contacts/contacts.test.ts","plugins/modules/contacts/module/service.ts","plugins/modules/contacts/module/__tests__/contactsIngest.test.ts","plugins/modules/contacts/manifest.toml","scripts/bundled-item-schemas.test.ts","plugins/sources/google/src/connector.ts","plugins/sources/google/src/__tests__/googleContract.test.ts"],"tempRoot":".tmp/code-production/account-sync-catalog/D1-S5","verifyActiveMinutes":8,"verifyCredits":2} -->
#### Stage D1-S5 — Google contacts carries totalPeople on its first page and the contacts module states the plan

- Owner: agent-1; Profile: fast; Depends: D1-S4; Parallel with: none.
- Writes: `plugins/sources/google/src/surfaces/contacts/contacts.ts`, `plugins/sources/google/src/surfaces/contacts/contacts.test.ts`, `plugins/modules/contacts/module/service.ts`, `plugins/modules/contacts/module/__tests__/contactsIngest.test.ts`, `plugins/modules/contacts/manifest.toml`, `scripts/bundled-item-schemas.test.ts`, `plugins/sources/google/src/connector.ts`, `plugins/sources/google/src/__tests__/googleContract.test.ts`.
- Temp root: `.tmp/code-production/account-sync-catalog/D1-S5` (must be absent at handoff).
- Predict: 57 active min / 14 credits.
- Of which verification: 8 active min / 2 credits.

What this Stage solves. The People API states totalPeople on every connections page; the Source drops it and the contacts module states nothing.

What is built. fetchContacts emits a list envelope { entity_type: "list", total_people } first in the first page (no page_token) and drops discovered; the contacts module states contacts.person in full on it when generation is present, +created on later pages, and skips it as an entity; the manifest declares progress = { "contacts.person" = "contacts" }.

How it is proven. contacts.test.ts asserts the list envelope on page one only; contactsIngest.test.ts the statement and the +created page; the manifest test gains the contacts row.

Commit. feat(google,contacts): the connections list states its count on the first page and the contacts module states the plan.

##### Tasks

- [x] ACS_009 — Emit the list envelope with total_people on the first contacts page in contacts.ts and drop discovered; cover in contacts.test.ts. (20 min) — 263a0bbe06c3702f9172a8bbc68a12473856c90d
<!-- plan:task-meta:{"writes":["plugins/sources/google/src/surfaces/contacts/contacts.ts","plugins/sources/google/src/surfaces/contacts/contacts.test.ts"],"predictedActiveMinutes":20,"predictedCredits":5,"how":"read totalPeople from the connections response on the first page; the list envelope precedes the people; WindowFetchResult loses discovered","red":"bun run agent:test:backend -- plugins/sources/google/src/surfaces/contacts/contacts.test.ts"} -->
- [x] ACS_010 — State contacts in full on the list envelope and +created after in contacts service.ts; declare contacts in contacts manifest.toml; cover in contactsIngest.test.ts, bundled-item-schemas.test.ts. (25 min) — 263a0bbe06c3702f9172a8bbc68a12473856c90d
<!-- plan:task-meta:{"writes":["plugins/modules/contacts/module/service.ts","plugins/modules/contacts/module/__tests__/contactsIngest.test.ts","plugins/modules/contacts/manifest.toml","scripts/bundled-item-schemas.test.ts"],"predictedActiveMinutes":25,"predictedCredits":6,"how":"ingest reads generation; the list envelope states { \"contacts.person\": { total: total_people, skipped: 0 } }; later pages state +created; without generation nothing","red":"bun run agent:test:backend -- plugins/modules/contacts/module/__tests__/contactsIngest.test.ts"} -->
- [x] ACS_019 — Drop the contacts counter from google connector.ts; expect the list envelope in googleContract.test.ts. (4 min) — 263a0bbe06c3702f9172a8bbc68a12473856c90d
<!-- plan:task-meta:{"writes":["plugins/sources/google/src/connector.ts","plugins/sources/google/src/__tests__/googleContract.test.ts"],"predictedActiveMinutes":4,"predictedCredits":1,"how":"the contacts case of fetchHandler returns {envelopes, nextCursor, hasMore}; the contract expects three contacts envelopes and no counters","red":"bun run agent:test:backend -- plugins/sources/google/src/__tests__/googleContract.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- plugins/sources/google/src/surfaces/contacts/contacts.test.ts` exits 0 — 263a0bbe06c3702f9172a8bbc68a12473856c90d
- [x] `bun run agent:test:backend -- plugins/modules/contacts/module/__tests__/contactsIngest.test.ts` exits 0 — 263a0bbe06c3702f9172a8bbc68a12473856c90d
- [x] Commit — 263a0bbe06c3702f9172a8bbc68a12473856c90d

##### Results

<!-- plan:results:D1-S5:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| ACS_009 | 263a0bbe06c3702f9172a8bbc68a12473856c90d | 2026-09-19T20:25:35.098Z–2026-09-19T20:30:05.000Z | 5 / 5 min | unavailable: runner did not expose usage | fetchContactsPage opens page one with the list envelope {entity_type list, total_people} and any page that drops identity-less persons with {entity_type list, skipped}; the cursor carries no counter; the contacts module states total_people in full, skipped per page and nothing without generation; manifest declares contacts. Contacts 9/9 (Source) and 73/73 (module), Google suite green under bun 1.3.13, typecheck and lint clean. |
| ACS_010 | 263a0bbe06c3702f9172a8bbc68a12473856c90d | 2026-09-19T20:25:35.098Z–2026-09-19T20:30:05.000Z | 5 / 5 min | unavailable: runner did not expose usage | fetchContactsPage opens page one with the list envelope {entity_type list, total_people} and any page that drops identity-less persons with {entity_type list, skipped}; the cursor carries no counter; the contacts module states total_people in full, skipped per page and nothing without generation; manifest declares contacts. Contacts 9/9 (Source) and 73/73 (module), Google suite green under bun 1.3.13, typecheck and lint clean. |
| ACS_019 | 263a0bbe06c3702f9172a8bbc68a12473856c90d | 2026-09-19T20:25:35.098Z–2026-09-19T20:30:05.000Z | 5 / 5 min | unavailable: runner did not expose usage | fetchContactsPage opens page one with the list envelope {entity_type list, total_people} and any page that drops identity-less persons with {entity_type list, skipped}; the cursor carries no counter; the contacts module states total_people in full, skipped per page and nothing without generation; manifest declares contacts. Contacts 9/9 (Source) and 73/73 (module), Google suite green under bun 1.3.13, typecheck and lint clean. |
<!-- plan:results:D1-S5:end -->
<!-- plan:stage:D1-S5:end -->

<!-- plan:stage:D1-S6:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S5"],"parallelWith":[],"writes":["plugins/sources/google/src/surfaces/meetings/calendar.ts","plugins/sources/google/src/surfaces/meetings/calendar.test.ts","plugins/modules/meetings/module/service.ts","plugins/modules/meetings/module/__tests__/meetingsSync.test.ts","plugins/modules/meetings/manifest.toml","scripts/bundled-item-schemas.test.ts","plugins/sources/google/src/connector.ts","plugins/sources/google/src/progress.ts","plugins/sources/google/src/__tests__/serde-parity.test.ts","plugins/sources/google/src/__tests__/googleContract.test.ts"],"tempRoot":".tmp/code-production/account-sync-catalog/D1-S6","verifyActiveMinutes":8,"verifyCredits":2} -->
#### Stage D1-S6 — Google Calendar counts its window with an ids-only pass and the meetings module states the plan

- Owner: agent-1; Profile: fast; Depends: D1-S5; Parallel with: none.
- Writes: `plugins/sources/google/src/surfaces/meetings/calendar.ts`, `plugins/sources/google/src/surfaces/meetings/calendar.test.ts`, `plugins/modules/meetings/module/service.ts`, `plugins/modules/meetings/module/__tests__/meetingsSync.test.ts`, `plugins/modules/meetings/manifest.toml`, `scripts/bundled-item-schemas.test.ts`, `plugins/sources/google/src/connector.ts`, `plugins/sources/google/src/progress.ts`, `plugins/sources/google/src/__tests__/serde-parity.test.ts`, `plugins/sources/google/src/__tests__/googleContract.test.ts`.
- Temp root: `.tmp/code-production/account-sync-catalog/D1-S6` (must be absent at handoff).
- Predict: 64 active min / 15 credits.
- Of which verification: 8 active min / 2 credits.

What this Stage solves. The Calendar API states no total for a window; the Source reports cumulative discovered only, and the meetings module states nothing.

What is built. fetchEvents runs, on the first page of a pass, one ids-only pass over the window (fields=nextPageToken,items/id, maxResults=2500, singleEvents) and emits a calendar envelope { entity_type: "calendar", events_total } first; discovered goes; the meetings module states meetings.calendar_event in full on it when generation is present, +created on later pages, and skips it as an entity; the manifest declares progress = { "meetings.calendar_event" = "events" }.

How it is proven. calendar.test.ts asserts the ids-only pass and the envelope on page one only; meetingsSync.test.ts the statement and the +created page; the manifest test gains the meetings row.

Commit. feat(google,meetings): the calendar window states its count from an ids-only pass and the meetings module states the plan.

##### Tasks

- [x] ACS_011 — Count the window with an ids-only pass and emit the calendar envelope on the first meetings page in calendar.ts; drop discovered; cover in calendar.test.ts. (25 min) — 16fab453a4692953a97e6f8574d2f9c4df9ece8b
<!-- plan:task-meta:{"writes":["plugins/sources/google/src/surfaces/meetings/calendar.ts","plugins/sources/google/src/surfaces/meetings/calendar.test.ts"],"predictedActiveMinutes":25,"predictedCredits":6,"how":"listEventIds pages fields=nextPageToken,items/id at 2500 over the same window; the count rides the calendar envelope first in page one","red":"bun run agent:test:backend -- plugins/sources/google/src/surfaces/meetings/calendar.test.ts"} -->
- [x] ACS_012 — State events in full on the calendar envelope and +created after in meetings service.ts; declare events in meetings manifest.toml; cover in meetingsSync.test.ts, bundled-item-schemas.test.ts. (25 min) — 16fab453a4692953a97e6f8574d2f9c4df9ece8b
<!-- plan:task-meta:{"writes":["plugins/modules/meetings/module/service.ts","plugins/modules/meetings/module/__tests__/meetingsSync.test.ts","plugins/modules/meetings/manifest.toml","scripts/bundled-item-schemas.test.ts"],"predictedActiveMinutes":25,"predictedCredits":6,"how":"ingest reads generation; the calendar envelope states { \"meetings.calendar_event\": { total: events_total, skipped: 0 } }; later pages state +created; without generation nothing","red":"bun run agent:test:backend -- plugins/modules/meetings/module/__tests__/meetingsSync.test.ts"} -->
- [x] ACS_020 — Drop the meetings counter from google connector.ts and delete progress.ts (its last reader); expect the calendar envelope in serde-parity.test.ts and googleContract.test.ts. (6 min) — 16fab453a4692953a97e6f8574d2f9c4df9ece8b
<!-- plan:task-meta:{"writes":["plugins/sources/google/src/connector.ts","plugins/sources/google/src/progress.ts","plugins/sources/google/src/__tests__/serde-parity.test.ts","plugins/sources/google/src/__tests__/googleContract.test.ts"],"predictedActiveMinutes":6,"predictedCredits":1,"how":"the meetings case of fetchHandler returns {envelopes, nextCursor, hasMore}; git rm progress.ts once calendar.ts stops importing it; the two shared tests expect the calendar envelope first and no counters","red":"bun run agent:test:backend -- plugins/sources/google/src/__tests__/serde-parity.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- plugins/sources/google/src/surfaces/meetings/calendar.test.ts` exits 0 — 16fab453a4692953a97e6f8574d2f9c4df9ece8b
- [x] `bun run agent:test:backend -- plugins/modules/meetings/module/__tests__/meetingsSync.test.ts` exits 0 — 16fab453a4692953a97e6f8574d2f9c4df9ece8b
- [x] Commit — 16fab453a4692953a97e6f8574d2f9c4df9ece8b

##### Results

<!-- plan:results:D1-S6:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| ACS_011 | 16fab453a4692953a97e6f8574d2f9c4df9ece8b | 2026-09-19T20:30:07.253Z–2026-09-19T20:35:26.000Z | 5 / 5 min | unavailable: runner did not expose usage | fetchEventsPage counts the window with an ids-only pass (fields=nextPageToken,items(id,status), 2500 a request, cancelled not counted) and opens page one with {entity_type calendar, events_total}; a page whose event fails to convert states {skipped}; the cursor carries no counter; progress.ts deleted with its last reader; the meetings module states events_total in full, skipped per page, nothing without generation; manifest declares events. Calendar 5/5, meetings module 26/26; typecheck and lint clean; hook 37+10. The Google receipt is re-minted in the closure commit for S5 and S6 together. |
| ACS_012 | 16fab453a4692953a97e6f8574d2f9c4df9ece8b | 2026-09-19T20:30:07.253Z–2026-09-19T20:35:26.000Z | 5 / 5 min | unavailable: runner did not expose usage | fetchEventsPage counts the window with an ids-only pass (fields=nextPageToken,items(id,status), 2500 a request, cancelled not counted) and opens page one with {entity_type calendar, events_total}; a page whose event fails to convert states {skipped}; the cursor carries no counter; progress.ts deleted with its last reader; the meetings module states events_total in full, skipped per page, nothing without generation; manifest declares events. Calendar 5/5, meetings module 26/26; typecheck and lint clean; hook 37+10. The Google receipt is re-minted in the closure commit for S5 and S6 together. |
| ACS_020 | 16fab453a4692953a97e6f8574d2f9c4df9ece8b | 2026-09-19T20:30:07.253Z–2026-09-19T20:35:26.000Z | 5 / 5 min | unavailable: runner did not expose usage | fetchEventsPage counts the window with an ids-only pass (fields=nextPageToken,items(id,status), 2500 a request, cancelled not counted) and opens page one with {entity_type calendar, events_total}; a page whose event fails to convert states {skipped}; the cursor carries no counter; progress.ts deleted with its last reader; the meetings module states events_total in full, skipped per page, nothing without generation; manifest declares events. Calendar 5/5, meetings module 26/26; typecheck and lint clean; hook 37+10. The Google receipt is re-minted in the closure commit for S5 and S6 together. |
<!-- plan:results:D1-S6:end -->
<!-- plan:stage:D1-S6:end -->

<!-- plan:stage:D1-S7:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S6"],"parallelWith":[],"writes":["plugins/sources/x/src/surfaces/x/fetch.ts","plugins/sources/x/src/surfaces/x/fetch.test.ts","plugins/modules/x/module/service.ts","plugins/modules/x/module/__tests__/xIngest.test.ts","plugins/modules/x/manifest.toml","scripts/bundled-item-schemas.test.ts","plugins/sources/x/src/api.ts"],"tempRoot":".tmp/code-production/account-sync-catalog/D1-S7","verifyActiveMinutes":8,"verifyCredits":2} -->
#### Stage D1-S7 — The X profile states its planned window and the x module states the plan

- Owner: agent-1; Profile: fast; Depends: D1-S6; Parallel with: none.
- Writes: `plugins/sources/x/src/surfaces/x/fetch.ts`, `plugins/sources/x/src/surfaces/x/fetch.test.ts`, `plugins/modules/x/module/service.ts`, `plugins/modules/x/module/__tests__/xIngest.test.ts`, `plugins/modules/x/manifest.toml`, `scripts/bundled-item-schemas.test.ts`, `plugins/sources/x/src/api.ts`.
- Temp root: `.tmp/code-production/account-sync-catalog/D1-S7` (must be absent at handoff).
- Predict: 55 active min / 14 credits.
- Of which verification: 8 active min / 2 credits.

What this Stage solves. The X Source reads the recent ten posts of every tracked profile and states no count; the x module states nothing.

What is built. profileEnvelope carries posts_total = min(public_metrics.tweet_count, RECENT_TWEETS) and posts_skipped = tweet_count − posts_total; the x module states, on a profile envelope whose sync_pass on the profile entity is not this generation, profiles +1 and posts { total: posts_total, skipped: posts_skipped } and writes sync_pass on the entity in the same batch, and +created posts otherwise; the manifest declares progress = { "x.post" = "posts", "x.profile" = "profiles" }.

How it is proven. fetch.test.ts asserts the two fields on the profile; xIngest.test.ts the full statement on a new pass, +created on the same pass, nothing without generation; the manifest test gains the x row.

Commit. feat(x): the profile states its planned window and the x module states the plan.

##### Tasks

- [x] ACS_013 — Carry posts_total and posts_skipped on the X profile envelope in fetch.ts; cover in fetch.test.ts. (15 min) — eb6667ca7e46002a52c5626a344ef6a566fc8876
<!-- plan:task-meta:{"writes":["plugins/sources/x/src/surfaces/x/fetch.ts","plugins/sources/x/src/surfaces/x/fetch.test.ts"],"predictedActiveMinutes":15,"predictedCredits":4,"how":"tweet_count from public_metrics on the user lookup; posts_total = min(tweet_count, RECENT_TWEETS), posts_skipped the rest; absent metrics carry no fields","red":"bun run agent:test:backend -- plugins/sources/x/src/surfaces/x/fetch.test.ts"} -->
- [x] ACS_014 — State profiles and posts on a new pass and +created after in x service.ts; declare posts and profiles in x manifest.toml; cover in xIngest.test.ts, bundled-item-schemas.test.ts. (30 min) — eb6667ca7e46002a52c5626a344ef6a566fc8876
<!-- plan:task-meta:{"writes":["plugins/modules/x/module/service.ts","plugins/modules/x/module/__tests__/xIngest.test.ts","plugins/modules/x/manifest.toml","scripts/bundled-item-schemas.test.ts"],"predictedActiveMinutes":30,"predictedCredits":7,"how":"ingest reads generation; the existing profile entity's sync_pass decides full or +created; the batch writes sync_pass with the profile's properties","red":"bun run agent:test:backend -- plugins/modules/x/module/__tests__/xIngest.test.ts"} -->
- [x] ACS_021 — Read tweet_count from the user's public_metrics in plugins/sources/x/src/api.ts. (2 min) — eb6667ca7e46002a52c5626a344ef6a566fc8876
<!-- plan:task-meta:{"writes":["plugins/sources/x/src/api.ts"],"predictedActiveMinutes":2,"predictedCredits":1,"how":"XUser.public_metrics gains tweet_count; the user fields already request public_metrics","red":"bun run agent:test:backend -- plugins/sources/x/src/surfaces/x/fetch.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- plugins/sources/x/src/surfaces/x/fetch.test.ts` exits 0 — eb6667ca7e46002a52c5626a344ef6a566fc8876
- [x] `bun run agent:test:backend -- plugins/modules/x/module/__tests__/xIngest.test.ts` exits 0 — eb6667ca7e46002a52c5626a344ef6a566fc8876
- [x] Commit — eb6667ca7e46002a52c5626a344ef6a566fc8876

##### Results

<!-- plan:results:D1-S7:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| ACS_013 | eb6667ca7e46002a52c5626a344ef6a566fc8876 | 2026-09-19T20:35:44.778Z–2026-09-19T20:40:43.000Z | 5 / 5 min | unavailable: runner did not expose usage | profileEnvelope carries posts_total = min(tweet_count, 10) and posts_skipped = the rest when X counts the account; the x module reads the page's anchors in two Graph calls, states profiles +1 and the posts window on a profile whose sync_pass is not this pass (stamping it in the batch), +1 per post the graph did not hold in the same pass, nothing without generation; manifest declares posts and profiles. X Source 11/11 (fetch) and module 16/16; typecheck and lint clean; the x certification receipt is re-minted in the closure commit. |
| ACS_014 | eb6667ca7e46002a52c5626a344ef6a566fc8876 | 2026-09-19T20:35:44.778Z–2026-09-19T20:40:43.000Z | 5 / 5 min | unavailable: runner did not expose usage | profileEnvelope carries posts_total = min(tweet_count, 10) and posts_skipped = the rest when X counts the account; the x module reads the page's anchors in two Graph calls, states profiles +1 and the posts window on a profile whose sync_pass is not this pass (stamping it in the batch), +1 per post the graph did not hold in the same pass, nothing without generation; manifest declares posts and profiles. X Source 11/11 (fetch) and module 16/16; typecheck and lint clean; the x certification receipt is re-minted in the closure commit. |
| ACS_021 | eb6667ca7e46002a52c5626a344ef6a566fc8876 | 2026-09-19T20:35:44.778Z–2026-09-19T20:40:43.000Z | 5 / 5 min | unavailable: runner did not expose usage | profileEnvelope carries posts_total = min(tweet_count, 10) and posts_skipped = the rest when X counts the account; the x module reads the page's anchors in two Graph calls, states profiles +1 and the posts window on a profile whose sync_pass is not this pass (stamping it in the batch), +1 per post the graph did not hold in the same pass, nothing without generation; manifest declares posts and profiles. X Source 11/11 (fetch) and module 16/16; typecheck and lint clean; the x certification receipt is re-minted in the closure commit. |
<!-- plan:results:D1-S7:end -->
<!-- plan:stage:D1-S7:end -->

<!-- plan:stage:D1-S8:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S7"],"parallelWith":[],"writes":["plugins/modules/linkedin/module/service.ts","plugins/modules/linkedin/module/__tests__/linkedinIngest.test.ts","plugins/modules/linkedin/manifest.toml","scripts/bundled-item-schemas.test.ts"],"tempRoot":".tmp/code-production/account-sync-catalog/D1-S8","verifyActiveMinutes":5,"verifyCredits":1} -->
#### Stage D1-S8 — The linkedin module declares its names and states the profiles it tracks

- Owner: agent-1; Profile: fast; Depends: D1-S7; Parallel with: none.
- Writes: `plugins/modules/linkedin/module/service.ts`, `plugins/modules/linkedin/module/__tests__/linkedinIngest.test.ts`, `plugins/modules/linkedin/manifest.toml`, `scripts/bundled-item-schemas.test.ts`.
- Temp root: `.tmp/code-production/account-sync-catalog/D1-S8` (must be absent at handoff).
- Predict: 25 active min / 6 credits.
- Of which verification: 5 active min / 1 credits.

What this Stage solves. anysite lists a tracked profile's posts without a total; the linkedin module declares no names, so a LinkedIn account prints nothing it could.

What is built. The manifest declares progress = { "linkedin.profile" = "profiles", "linkedin.post" = "posts" }; the module states profiles +1 on a profile envelope whose sync_pass on the entity is not this generation, writes the stamp in the batch, and states nothing for posts (unplanned).

How it is proven. linkedinIngest.test.ts asserts profiles +1 once per pass and no posts statement; the manifest test gains the linkedin row.

Commit. feat(linkedin): the module declares profiles and posts and states the profiles it tracks; posts stay unplanned.

##### Tasks

- [x] ACS_015 — State profiles +1 per pass in linkedin service.ts; declare profiles and posts in linkedin manifest.toml; cover in linkedinIngest.test.ts and bundled-item-schemas.test.ts. (20 min) — ecdee3260a1413661986fd9400f41ddd3dcf4e70
<!-- plan:task-meta:{"writes":["plugins/modules/linkedin/module/service.ts","plugins/modules/linkedin/module/__tests__/linkedinIngest.test.ts","plugins/modules/linkedin/manifest.toml","scripts/bundled-item-schemas.test.ts"],"predictedActiveMinutes":20,"predictedCredits":5,"how":"ingest reads generation; sync_pass on the profile entity decides the +1; posts state nothing","red":"bun run agent:test:backend -- plugins/modules/linkedin/module/__tests__/linkedinIngest.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- plugins/modules/linkedin/module/__tests__/linkedinIngest.test.ts` exits 0 — ecdee3260a1413661986fd9400f41ddd3dcf4e70
- [x] Commit — ecdee3260a1413661986fd9400f41ddd3dcf4e70

##### Results

<!-- plan:results:D1-S8:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| ACS_015 | ecdee3260a1413661986fd9400f41ddd3dcf4e70 | 2026-09-19T20:40:44.762Z–2026-09-19T20:45:08.000Z | 4 / 4 min | unavailable: runner did not expose usage | the linkedin manifest declares profiles and posts; ingest reads the page's profile anchors in two Graph calls, states profiles +1 on a profile whose sync_pass is not this pass (stamping it in the batch), never states posts, nothing without generation. Module 14/14; typecheck and lint clean; hook 12+8. |
<!-- plan:results:D1-S8:end -->
<!-- plan:stage:D1-S8:end -->

<!-- plan:stage:D1-S9:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S8"],"parallelWith":[],"writes":["docs/plugins/source.md","docs/plugins/module.md","docs/plugins/manifest.md"],"tempRoot":".tmp/code-production/account-sync-catalog/D1-S9","verifyActiveMinutes":5,"verifyCredits":1} -->
#### Stage D1-S9 — The plugin docs describe the receipt, the traversed ranges and the manifest line

- Owner: agent-1; Profile: fast; Depends: D1-S8; Parallel with: none.
- Writes: `docs/plugins/source.md`, `docs/plugins/module.md`, `docs/plugins/manifest.md`.
- Temp root: `.tmp/code-production/account-sync-catalog/D1-S9` (must be absent at handoff).
- Predict: 30 active min / 7 credits.
- Of which verification: 5 active min / 1 credits.

What this Stage solves. docs/plugins/source.md still describes FetchResult with total/discovered, and module.md and manifest.md say nothing of the receipt's plan, the excluded scopes, the pass generation or the progress line.

What is built. source.md: the fetch result is { envelopes, nextCursor, hasMore, traversed }, a scope envelope carries its count, a live notification carries position; module.md: the ingest params carry generation, the answer carries plan and excluded, __sync_complete__ answers departed and plan; manifest.md: [surfaces.<surface>] progress and the reconciliation modes.

How it is proven. The plan gate reads the pages; the statements match the Stages above.

Commit. docs(plugins): counts on the scope envelope, traversed ranges on the page, plan deltas in the receipt, progress names in the manifest.

##### Tasks

- [x] ACS_016 — Describe the fetch result, the scope count and the live position in docs/plugins/source.md; the receipt and reconcile answer in module.md; the progress line in manifest.md. (25 min) — 7aabf0ab09299080140eb94489585d7234ffa748
<!-- plan:task-meta:{"writes":["docs/plugins/source.md","docs/plugins/module.md","docs/plugins/manifest.md"],"predictedActiveMinutes":25,"predictedCredits":6,"how":"replace the FetchResult line; add the receipt and generation paragraphs; add the progress line beside item","red":"bun run agent:test:backend -- scripts/bundled-item-schemas.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:verify:docs` exits 0 — 7aabf0ab09299080140eb94489585d7234ffa748
- [x] Commit — 7aabf0ab09299080140eb94489585d7234ffa748

##### Results

<!-- plan:results:D1-S9:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| ACS_016 | 7aabf0ab09299080140eb94489585d7234ffa748 | 2026-09-19T20:45:09.557Z–2026-09-19T20:46:28.000Z | 2 / 2 min | unavailable: runner did not expose usage | source.md: the fetch result {envelopes, nextCursor, hasMore, traversed}, the scope counts per Source, the skipped statement, the live position; module.md: generation on the page, the receipt's plan (relative to the last statement) and excluded, the __sync_complete__ answer; manifest.md: the [surfaces.<surface>] progress line and the reconciliation modes. agent:verify:docs passes. |
<!-- plan:results:D1-S9:end -->
<!-- plan:stage:D1-S9:end -->

<!-- plan:stage:D1-S10:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S9"],"parallelWith":[],"writes":["plugins/modules/telegram/module/service.ts","plugins/modules/telegram/module/__tests__/syncPlan.test.ts","plugins/modules/telegram/module/__tests__/telegramIngest.test.ts"],"tempRoot":".tmp/code-production/account-sync-catalog/D1-S10","verifyActiveMinutes":5,"verifyCredits":1} -->
#### Stage D1-S10 — The Telegram module's reconcile passes the host's window contract

- Owner: agent-1; Profile: fast; Depends: D1-S9; Parallel with: none.
- Writes: `plugins/modules/telegram/module/service.ts`, `plugins/modules/telegram/module/__tests__/syncPlan.test.ts`, `plugins/modules/telegram/module/__tests__/telegramIngest.test.ts`.
- Temp root: `.tmp/code-production/account-sync-catalog/D1-S10` (must be absent at handoff).
- Predict: 15 active min / 4 credits.
- Of which verification: 5 active min / 1 credits.

What this Stage solves. magnis-app's Telegram stand refused the reconcile of D1-S2: the host's list_entities_window requires filter_eq with every filter_field, so the `exists` window over sync_pass never ran (plugin hook telegram.__sync_complete__: filter needs both filter_field and filter_eq).

What is built. onSyncComplete reads one edge-filtered window — `filter_op: "distinct", filter_eq: generation` (IS DISTINCT FROM, which keeps the edges never stamped as well as those stamped in another pass) — decays every edge it finds that is not decayed already, answers every such chat as departed, and gives a statement back only for the chats a pass stated (sync_pass present). syncPlan.test.ts and telegramIngest.test.ts model the window as IS DISTINCT FROM and expect a never-stated chat to leave without a statement.

How it is proven. tst_module_telegram_plan_001 runs the reconcile through one distinct window; tst_module_telegram_ingest_002 decays the stamped and the never-stamped chat and gives back only the stamped one's statement; magnis-app's tst_src_int_telegram_sync_001..003 pass on the stand against the archive built from this commit.

Commit. fix(telegram): reconcile through one distinct window — the host requires filter_eq with every filter_field; a never-stated chat leaves without a statement.

##### Tasks

- [x] ACS_022 — Reconcile through one distinct window over sync_pass in plugins/modules/telegram/module/service.ts; model IS DISTINCT FROM in syncPlan.test.ts and telegramIngest.test.ts. (10 min) — 2d09e60c0fd8e92676750ad0ede561e661b93fbf
<!-- plan:task-meta:{"writes":["plugins/modules/telegram/module/service.ts","plugins/modules/telegram/module/__tests__/syncPlan.test.ts","plugins/modules/telegram/module/__tests__/telegramIngest.test.ts"],"predictedActiveMinutes":10,"predictedCredits":3,"how":"observedChatsWindow takes op eq|distinct with filter_eq; onSyncComplete reads one window {edge_path: sync_pass, filter_op: distinct, filter_eq: generation}, decays every edge found, gives a statement back only where sync_pass was stamped; the two tests' window doubles model IS DISTINCT FROM","red":"bun run agent:test:backend -- plugins/modules/telegram/module/__tests__/syncPlan.test.ts"} -->

##### Acceptance criteria

- [x] `bun run agent:test:backend -- plugins/modules/telegram/module/__tests__/syncPlan.test.ts plugins/modules/telegram/module/__tests__/telegramIngest.test.ts` exits 0 — 2d09e60c0fd8e92676750ad0ede561e661b93fbf
- [x] Commit — 2d09e60c0fd8e92676750ad0ede561e661b93fbf

##### Results

<!-- plan:results:D1-S10:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
| ACS_022 | 2d09e60c0fd8e92676750ad0ede561e661b93fbf | 2026-09-19T21:07:07.382Z–2026-09-19T21:08:55.000Z | 1 / 1 min | unavailable: runner did not expose usage | onSyncComplete reads one window {edge_path sync_pass, filter_op distinct, filter_eq generation}, decays every edge found and gives back only stamped statements; the stand's three Telegram journeys pass against the archive built from this commit (magnis-app D1-S7). Module 41/41; typecheck and lint clean. |
<!-- plan:results:D1-S10:end -->
<!-- plan:stage:D1-S10:end -->

<!-- plan:stage:D1-S11:start -->
<!-- plan:stage-meta:{"deliveryId":"D1","depends":["D1-S10"],"parallelWith":[],"writes":["plugins/sources/telegram/src/live.ts","plugins/sources/telegram/src/subscriptions.ts","plugins/sources/telegram/src/live.test.ts","plugins/modules/telegram/module/service.ts","plugins/modules/telegram/module/__tests__/telegramIngest.test.ts","plugins/modules/telegram/module/__tests__/syncPlan.test.ts"],"tempRoot":".tmp/code-production/account-sync-catalog/D1-S11","verifyActiveMinutes":10,"verifyCredits":2} -->
#### Stage D1-S11 — Telegram ends membership at the provider's departure time

- Owner: agent-1; Profile: fast; Depends: D1-S10; Parallel with: none.
- Writes: `plugins/sources/telegram/src/live.ts`, `plugins/sources/telegram/src/subscriptions.ts`, `plugins/sources/telegram/src/live.test.ts`, `plugins/modules/telegram/module/service.ts`, `plugins/modules/telegram/module/__tests__/telegramIngest.test.ts`, `plugins/modules/telegram/module/__tests__/syncPlan.test.ts`.
- Temp root: `.tmp/code-production/account-sync-catalog/D1-S11` (must be absent at handoff).
- Predict: 45 active min / 11 credits.
- Of which verification: 10 active min / 2 credits.

What this Stage solves. The current reconcile closes an observed_in edge with the worker's wall clock, so valid_until says when Magnis noticed an absent chat rather than when Telegram ended the membership.

What is built. The live Telegram client recognizes the current dated chat and channel participant updates and forwards a membership-end chat envelope carrying telegram_user_id and valid_until derived only from Telegram's date. The module accepts that envelope only for the host-stamped identity, ends the active observed_in edge with the supplied time, and no longer infers an end from a chat missing at sync completion. Existing page buffering and batch calls do not change.

How it is proven. tst_src_tg_033 covers chat and channel departure transitions and ignores joins, role changes and other participant updates. tst_module_telegram_007 proves the exact provider timestamp reaches end_link and that malformed, repeated and foreign events cannot invent another end. tst_module_telegram_plan_001 proves a missing snapshot chat no longer closes an edge.

Commit. fix(telegram): end membership at Telegram's departure time — forward dated participant updates, consume them for the stamped identity, and remove wall-clock reconciliation.

##### Tasks

- [ ] ACS_023 — Forward dated Telegram chat and channel membership ends without changing live-message delivery. (25 min)
<!-- plan:task-meta:{"writes":["plugins/sources/telegram/src/live.ts","plugins/sources/telegram/src/subscriptions.ts","plugins/sources/telegram/src/live.test.ts"],"predictedActiveMinutes":25,"predictedCredits":5,"how":"extend TgClient's live handlers in plugins/sources/telegram/src/live.ts for dated UpdateChatParticipant and UpdateChannelParticipant transitions; map them in plugins/sources/telegram/src/subscriptions.ts to a telegram_chat payload carrying chat_id, top_message zero, telegram_user_id and provider-derived valid_until; add tst_src_tg_033 to plugins/sources/telegram/src/live.test.ts","red":"bun run agent:test:backend -- plugins/sources/telegram/src/live.test.ts -t tst_src_tg_033"} -->
- [ ] ACS_024 — End only the stamped identity's active observed_in edge at the envelope's valid_until and remove snapshot-time inference. (10 min)
<!-- plan:task-meta:{"writes":["plugins/modules/telegram/module/service.ts","plugins/modules/telegram/module/__tests__/telegramIngest.test.ts","plugins/modules/telegram/module/__tests__/syncPlan.test.ts"],"predictedActiveMinutes":10,"predictedCredits":4,"how":"handle live telegram_chat envelopes carrying telegram_user_id and valid_until in plugins/modules/telegram/module/service.ts before ordinary chat batching; require a valid exact timestamp and matching identity_key, resolve the active observed_in edge and call end_link once; delete onSyncComplete wall-clock inference; cover exact time, malformed/foreign/repeated events in telegramIngest.test.ts and absence-without-end in syncPlan.test.ts","red":"bun run agent:test:backend -- plugins/modules/telegram/module/__tests__/telegramIngest.test.ts -t tst_module_telegram_007"} -->

##### Acceptance criteria

- [ ] `bun run agent:test:backend -- plugins/sources/telegram/src/live.test.ts` exits 0 — dated membership updates preserve Telegram time and existing messages are unchanged
- [ ] `bun run agent:test:backend -- plugins/modules/telegram/module/__tests__/telegramIngest.test.ts plugins/modules/telegram/module/__tests__/syncPlan.test.ts` exits 0 — only exact provider evidence ends an active membership
- [ ] `bun run agent:verify:commit` exits 0 — changed catalog scope is type-correct, lint-clean and green
- [ ] Commit

##### Results

<!-- plan:results:D1-S11:start -->
| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |
|---|---|---|---:|---|---|
<!-- plan:results:D1-S11:end -->
<!-- plan:stage:D1-S11:end -->
<!-- plan:delivery:D1:end -->
<!-- plan:implementation:end -->

<!-- plan:execution:start -->
## Execution log

- lock-spec sha256:68e0aebc008e04c12bc42733e0c7e3e5f4a1c6c0cbeb772f3957078e3c598cf2 owner:approved

- put-delivery D1

- put-stage D1-S1

- put-stage D1-S2

- put-stage D1-S3

- put-stage D1-S4

- put-stage D1-S5

- put-stage D1-S6

- put-stage D1-S7

- put-stage D1-S8

- put-stage D1-S9

- approve sha256:d671787593a64da7f8977a4fba5bffa325695fa7b5a5a5926b76ab1c481a1b14 owner:approved

- record-result D1-S1 commit:d09c5f6d4d7378484420aa7bde57a888f897f722

- deviation D1-S1: the host moved (/home/marketing → /mnt/movies/dev/home) between the commit and its receipt; the worktree and its start receipt were lost, the receipt is imported anew over the same commit

- close D1-S1 closed commit:d09c5f6d4d7378484420aa7bde57a888f897f722

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:a23f5d52f56d052018be7f0c02dbb6f1d9a6eba4d122ac9cadab5c67db899f50

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:ccc5867a8ec20194f2364a7fb22b4593e2b6ec0d9bdaadd54fd7462b0115b801

- record-result D1-S2 commit:0a49abe779cc613a0d44eb4f38f8224e7b1538fc

- deviation D1-S2: the host moved between the RED and the commit; the uncommitted first copy of the work was lost and redone from the transcript (elapsed spans the move)

- close D1-S2 partial commit:0a49abe779cc613a0d44eb4f38f8224e7b1538fc

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:9c3528e81a4850b9280bc90cce1c1af89f9b694fdc82af05d38efa224d05aabb

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:120817defdedbfd31f4270d6378c345b58862fdc082a2616632b7917ffc08cb9

- record-result D1-S3 commit:f6623d26be50bf0c61ff8c1a7d9e4753cece2a3a

- close D1-S3 partial commit:f6623d26be50bf0c61ff8c1a7d9e4753cece2a3a

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:3dabe7cc9eab9f7ede444adbaefc18858e828201525e665852375a404bb03d6c

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:da39d34a6487ba6b70f4bc47b5e6c32a3cb7d0fb89d39b3da57e6a79d6e4630a

- record-result D1-S4 commit:28bc3f959e2d9ef59da51a2e67faeee1a912ee5d

- deviation D1-S4: the catalog pins bun 1.3.13 and its certification receipts hash the bundle the running bun produced: after the host move the default bun is 1.4.2, so the suites and the receipts run under mise exec bun@1.3.13; the re-minted telegram and google source receipts ride the closure commit

- close D1-S4 closed commit:28bc3f959e2d9ef59da51a2e67faeee1a912ee5d

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:b3eda3aa8f50461ddd7b5274d66f3dda56c66f46117fb857747eb14edbb7c697

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:a5e1dd48512213d823861922107d0cc9f1f626984eace91be6e71fc8887afbca

- record-result D1-S5 commit:263a0bbe06c3702f9172a8bbc68a12473856c90d

- deviation D1-S5: the SPEC's table said +created on later pages; a page states the persons it left out instead — the count the People API states is exact, so what stays out of the graph is what the plan skips

- close D1-S5 closed commit:263a0bbe06c3702f9172a8bbc68a12473856c90d

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:10b33776337675bef661155c50d95e3461e62ee88d45281ae5bce34f7e2d0c76

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:1349ea6377a1616c56156344b7f42841b620ddeeb3342b68e13f29555fa1caab

- record-result D1-S6 commit:16fab453a4692953a97e6f8574d2f9c4df9ece8b

- deviation D1-S6: the SPEC's table said +created on later pages; a page states the events it left out instead — the ids-only count is exact, so what stays out of the graph is what the plan skips

- close D1-S6 closed commit:16fab453a4692953a97e6f8574d2f9c4df9ece8b

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:cd1b34a184fbf5b632781529b918339d37e72aa17a0521d48d327757a68f1d8b

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:b807f211e636bbfb29f08a3212199753c6a60c7b86e4f874ac3afc0718152a2e

- record-result D1-S7 commit:eb6667ca7e46002a52c5626a344ef6a566fc8876

- close D1-S7 closed commit:eb6667ca7e46002a52c5626a344ef6a566fc8876

- record-result D1-S8 commit:ecdee3260a1413661986fd9400f41ddd3dcf4e70

- close D1-S8 closed commit:ecdee3260a1413661986fd9400f41ddd3dcf4e70

- record-result D1-S9 commit:7aabf0ab09299080140eb94489585d7234ffa748

- close D1-S9 closed commit:7aabf0ab09299080140eb94489585d7234ffa748

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:c31d367acd5ed5112c3d5f2a2a941e404ac5b5255c8518d9dd5880c25a39db5e

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:e525c9af1fb51e21ff34a982275e9254f919b08c8bf2e8aee78f3a4d9c4d1d69

- amend implementation owner:не спрашивай меня про такие мелки дефекты sha256:6d8c567a165d3130861e1f8b96ac2f4252c61ed26b89b8f539f3f6a68a1303ef

- record-result D1-S10 commit:2d09e60c0fd8e92676750ad0ede561e661b93fbf

- close D1-S10 closed commit:2d09e60c0fd8e92676750ad0ede561e661b93fbf

- amend implementation owner:Implement the plan. sha256:2a7bccaaf4f4383dfb348a4a8b91570fc093bab2fbc8885836ea522269017e2f

- amend implementation owner:Implement the plan. sha256:22e6ea401bc1b408f9ad4c09a9cce418aacd257ed0e016b4a7442a53d6c643fe

- amend implementation owner:Implement the plan. sha256:02c2be3b35e49aaba5268473c8dec1a3dafb81a477bec0a863205e6af06e104e
<!-- plan:execution:end -->
