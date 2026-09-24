// Subscription protocol — TS twin of sources/telegram/src/subscriptions.rs.
// `listen_start{subscription_id, _meta}` + `listen_stop{subscription_id}`.
//
// Named subscriptions replace the implicit "one listener per process" model. Each subscription
// owns its own cancel flag; stopping one doesn't affect others. The same
// connector process can hold N subscriptions for N account_ids concurrently.
//
// The registry owns Telegram listeners only. The shared Connector SDK owns
// notification serialization and subscription routing.

import type { Envelope } from "@magnis/connector-sdk";
import { credsFromMeta, accountIdFromMeta, type MessageLike } from "./client";
import { messagePayload } from "./surfaces/telegram/envelope";
import { chatRemoteId, messageRemoteId } from "./surfaces/telegram/schema";
import { livePushes, fixturePath } from "./surfaces/telegram/fixture";
import { messageToIntermediate, peerIdentity } from "./client";
// `import type` ONLY: the gramjs stack is loaded LAZILY (live mode alone needs
// it) so fixture-mode runs and the unit tests never load the MTProto stack.
import type { LiveUpdate, MembershipEndUpdate, TgClient } from "./live";

/** Listener mode — explicit (not read from env) so unit tests can drive the
 * registry without mutating process-global state. */
export type ListenerMode = "fixture" | "live";

/** One active subscription's runtime handle. */
interface ListenerHandle {
  cancel: () => void;
}

/** Convert a live message or dated membership end to a standard SDK envelope.
 * Missing message identity is an error. Membership is not message coverage.
 * @tested-by: tst_src_tg_032, tst_src_tg_033 */
function isMembershipEnd(update: LiveUpdate): update is MembershipEndUpdate {
  return "kind" in update;
}

export function liveUpdatePushes(update: LiveUpdate, accountId: string): Envelope[] {
  if (isMembershipEnd(update)) {
    return [{
      surface: "telegram",
      kind: "live",
      payload: {
        entity_type: "telegram_chat",
        chat_id: update.chatId,
        top_message: 0,
        telegram_user_id: update.telegramUserId,
        valid_until: update.validUntil,
      },
      remote_id: chatRemoteId(update.chatId),
    }];
  }
  const message: MessageLike = update;
  const peer = peerIdentity(message.peerId);
  if (peer === undefined) throw new Error("live update requires a valid Telegram peer identity");
  const m = messageToIntermediate(message, accountId, peer.id);
  return [{
    surface: "telegram",
    kind: "live",
    payload: messagePayload(m),
    remote_id: messageRemoteId(m.chat_id, m.message_id),
    position: { scope_id: String(m.chat_id), id: m.message_id },
  }];
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
    emit: (envelope: Envelope) => void,
  ): Promise<void> {
    // Atomic claim: "already running" OR "already starting" → no-op.
    if (this.running.has(subscriptionId) || this.starting.has(subscriptionId)) return;
    this.starting.add(subscriptionId);

    // Build OUTSIDE the claim so a live MTProto connect never blocks other
    // subscriptions. The claim is released on BOTH the ok and err paths.
    try {
      const handle = await this.buildListener(mode, args, emit);
      this.running.set(subscriptionId, handle);
    } finally {
      this.starting.delete(subscriptionId);
    }
  }

  /** Choose the mode from TELEGRAM_FIXTURE_FILE. */
  async startFromEnv(
    subscriptionId: string,
    args: Record<string, unknown>,
    emit: (envelope: Envelope) => void,
  ): Promise<void> {
    const mode: ListenerMode = fixturePath() !== undefined ? "fixture" : "live";
    await this.start(subscriptionId, mode, args, emit);
  }

  private async buildListener(
    mode: ListenerMode,
    args: Record<string, unknown>,
    emit: (envelope: Envelope) => void,
  ): Promise<ListenerHandle> {
    // NO FALLBACKS: account_id is required for SessionPool routing AND for
    // notification stamping. Missing → error, the caller fixes their _meta.
    const accountId = accountIdFromMeta(args);

    if (mode === "fixture") {
      return spawnFixtureListener(emit);
    }
    const creds = credsFromMeta(args);
    const { pool } = await import("./live");
    const client = await pool().getOrCreate(accountId, creds);
    return spawnLiveListener(accountId, client, emit);
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
  emit: (envelope: Envelope) => void,
): ListenerHandle {
  let cancelled = false;
  // WIRE PARITY (Rust-vs-TS parity diff): the replay MUST NOT start until the
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
    for (const envelope of livePushes()) {
      if (cancelled) return;
      emit(envelope);
      // Yield so a concurrent stop can interrupt the replay.
      await Promise.resolve();
    }
  };
  setImmediate(() => {
    if (cancelled) return;
    void replay();
  });
  return {
    cancel: (): void => {
      cancelled = true;
    },
  };
}

/** Live mode: forward MTProto updates from an ALREADY-CONNECTED client as
 * notifications. Best-effort: a handler error logs to stderr and terminates the
 * loop (no reconnect), matching the Rust listener. */
function spawnLiveListener(
  accountId: string,
  client: TgClient,
  emit: (envelope: Envelope) => void,
): ListenerHandle {
  let cancelled = false;
  client.addLiveHandler((message) => {
    if (cancelled) return;
    try {
      for (const envelope of liveUpdatePushes(message, accountId)) emit(envelope);
    } catch (e) {
      console.error(`magnis-telegram: live update error: ${String(e)}`);
      cancelled = true;
    }
  });
  return {
    cancel: (): void => {
      cancelled = true;
    },
  };
}
