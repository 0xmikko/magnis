// Subscription protocol — TS twin of plugins/sources/telegram/src/subscriptions.rs.
// `listen_start{subscription_id, _meta}` + `listen_stop{subscription_id}`.
//
// Replaces the implicit "one listener per process" assumption of the legacy
// `magnis.sync.listen` tool with a named subscription registry. Each subscription
// owns its own cancel flag; stopping one doesn't affect others. The same
// connector process can hold N subscriptions for N account_ids concurrently.
//
// Notifications stamp `subscription_id` and `account_id` into the params
// alongside `{ payload, remote_id }` so the host can route by subscription and
// validate the account.
//
// !! WIRE NOTE: these params carry NO `surface` and NO `kind` — unlike the
// @magnis/connector-sdk default emitter, which always stamps both. That is why
// this connector does NOT route push through the SDK (see dispatch.ts).

import { credsFromMeta, accountIdFromMeta, type MessageLike } from "./client";
import { messagePayload, messageRemoteId } from "./envelope";
import { livePushes, fixturePath } from "./fixture";
import { messageToIntermediate, toNum } from "./client";
// `import type` ONLY: the gramjs stack is loaded LAZILY (live mode alone needs
// it) so fixture-mode runs and the unit tests never load the MTProto stack.
import type { TgClient } from "./live";

/** Listener mode — explicit (not read from env) so unit tests can drive the
 * registry without mutating process-global state. */
export type ListenerMode = "fixture" | "live";

/** Writes one line to the host (stdout in production; a sink in tests). */
export type LineWriter = (line: string) => void;

/** One active subscription's runtime handle. */
interface ListenerHandle {
  cancel: () => void;
}

/** Build the push notification params. EXACT Rust shape — no surface, no kind,
 * no cursor. */
export function notificationLine(
  subscriptionId: string,
  accountId: string,
  payload: Record<string, unknown>,
  remoteId: string,
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/magnis/envelope",
    params: {
      subscription_id: subscriptionId,
      account_id: accountId,
      payload,
      remote_id: remoteId,
    },
  });
}

/** Convert one live update into push `(payload, remote_id)`. Live updates carry a
 * full chat, so `msg.chat.id` IS authoritative here (unlike the bootstrap path,
 * where the caller-supplied dialog id wins over a possible "min" peer id). */
export function liveUpdatePushes(
  message: MessageLike,
  accountId: string,
): { payload: Record<string, unknown>; remote_id: string }[] {
  const chatId = message.chat === null || message.chat === undefined ? 0 : toNum(message.chat.id);
  const m = messageToIntermediate(message, accountId, chatId);
  return [{ payload: messagePayload(m), remote_id: messageRemoteId(m.chat_id, m.message_id) }];
}

/** Per-connector subscription registry. Lives for the process lifetime. */
export class SubscriptionRegistry {
  /** Running listeners + the set of ids whose start() is in flight, under ONE
   * conceptual lock so the "already running OR already starting?" check and the
   * claim are atomic. Each tools/call is dispatched concurrently, so two starts
   * for the same id can race — the claim guarantees exactly ONE builds a
   * listener and the other returns ok without a duplicate spawn. */
  private readonly running = new Map<string, ListenerHandle>();
  private readonly starting = new Set<string>();

  /** Start a listener for `subscription_id`. Idempotent: re-calling with the
   * same id is a no-op (returns ok without spawning a duplicate).
   *
   * Returns once the listener is ESTABLISHED (or already present). In live mode
   * that means the MTProto session is CONNECTED before we return, so the host's
   * listen_start ack means "the live stream is open" — no drop window between
   * subscribe and connect. Throws on malformed `_meta` or a failed connect. */
  async start(
    subscriptionId: string,
    mode: ListenerMode,
    args: Record<string, unknown>,
    write: LineWriter,
  ): Promise<void> {
    // Atomic claim: "already running" OR "already starting" → no-op.
    if (this.running.has(subscriptionId) || this.starting.has(subscriptionId)) return;
    this.starting.add(subscriptionId);

    // Build OUTSIDE the claim so a live MTProto connect never blocks other
    // subscriptions. The claim is released on BOTH the ok and err paths.
    try {
      const handle = await this.buildListener(subscriptionId, mode, args, write);
      this.running.set(subscriptionId, handle);
    } finally {
      this.starting.delete(subscriptionId);
    }
  }

  /** Convenience: choose the mode from TELEGRAM_FIXTURE_FILE. Used by the
   * dispatcher so production paths stay one-call; tests pass mode explicitly. */
  async startFromEnv(
    subscriptionId: string,
    args: Record<string, unknown>,
    write: LineWriter,
  ): Promise<void> {
    const mode: ListenerMode = fixturePath() !== undefined ? "fixture" : "live";
    await this.start(subscriptionId, mode, args, write);
  }

  private async buildListener(
    subscriptionId: string,
    mode: ListenerMode,
    args: Record<string, unknown>,
    write: LineWriter,
  ): Promise<ListenerHandle> {
    // NO FALLBACKS: account_id is required for SessionPool routing AND for
    // notification stamping. Missing → error, the caller fixes their _meta.
    const accountId = accountIdFromMeta(args);

    if (mode === "fixture") {
      return spawnFixtureListener(subscriptionId, accountId, write);
    }
    const creds = credsFromMeta(args);
    const { pool } = await import("./live");
    const client = await pool().getOrCreate(accountId, creds);
    return spawnLiveListener(subscriptionId, accountId, client, write);
  }

  /** Cancel the named listener. Returns whether one was found and cancelled.
   * Other subscriptions stay alive. */
  stop(subscriptionId: string): boolean {
    const handle = this.running.get(subscriptionId);
    if (handle === undefined) return false;
    this.running.delete(subscriptionId);
    handle.cancel();
    return true;
  }

  /** Number of active subscriptions — tests / diagnostics. */
  size(): number {
    return this.running.size;
  }
}

/** Fixture mode: emit the file's pre-recorded live pushes, then EXIT (the
 * fixture is finite). Cancelling interrupts mid-replay. */
function spawnFixtureListener(
  subscriptionId: string,
  accountId: string,
  write: LineWriter,
): ListenerHandle {
  let cancelled = false;
  // WIRE PARITY (diff-connectors.ts): the replay MUST NOT start until the
  // caller has written the listen ack. The Rust oracle gets this for free —
  // subscriptions.rs:233 `tokio::spawn(async move { … })` hands the replay to
  // the scheduler, so main.rs:318 writes `{ok, subscription_id}` FIRST and the
  // notifications/magnis/envelope frames follow. An async IIFE is NOT the same:
  // its body runs SYNCHRONOUSLY until the first await, so the first write()
  // landed before spawnFixtureListener even returned — the host saw a push for
  // a subscription it had not yet been told about (it routes by
  // subscription_id). `setImmediate` defers past the pending microtasks the ack
  // path awaits, restoring the Rust frame order (ack → push).
  const replay = async (): Promise<void> => {
    for (const { payload, remote_id } of livePushes()) {
      if (cancelled) return;
      write(notificationLine(subscriptionId, accountId, payload, remote_id));
      // Yield so a concurrent stop can interrupt the replay.
      await Promise.resolve();
    }
  };
  setImmediate(() => {
    if (cancelled) return;
    void replay();
  });
  return {
    cancel: () => {
      cancelled = true;
    },
  };
}

/** Live mode: forward MTProto updates from an ALREADY-CONNECTED client as
 * notifications. Best-effort: a handler error logs to stderr and terminates the
 * loop (no reconnect), matching the Rust listener. */
function spawnLiveListener(
  subscriptionId: string,
  accountId: string,
  client: TgClient,
  write: LineWriter,
): ListenerHandle {
  let cancelled = false;
  client.addLiveHandler((message) => {
    if (cancelled) return;
    try {
      for (const { payload, remote_id } of liveUpdatePushes(message, accountId)) {
        write(notificationLine(subscriptionId, accountId, payload, remote_id));
      }
    } catch (e) {
      console.error(`magnis-telegram-ts: live update error: ${String(e)}`);
      cancelled = true;
    }
  });
  return {
    cancel: () => {
      cancelled = true;
    },
  };
}
