import { createHash } from "node:crypto";

import type { RpcAdmissionHooks, RpcAdmissionState } from "telegram/client/telegramBaseClient";

export interface AdmissionClock {
  now(): number;
  schedule(run: () => void, delay: number): () => void;
}

const clock: AdmissionClock = {
  now: (): number => performance.now(),
  schedule: (run, delay): (() => void) => {
    const timer = setTimeout(run, delay);
    return (): void => { clearTimeout(timer); };
  },
};

export interface AdmissionEvent {
  readonly owner: string;
  readonly method: string;
  readonly attempt: number;
  readonly origin: "send" | "remoteFlood" | "localRefusal";
  readonly at: number;
  readonly holdUntil: number | null;
  readonly remaining: number | null;
  readonly queued: number;
}

interface Entry {
  readonly state: RpcAdmissionState;
  readonly promise: Promise<unknown>;
  readonly method: string;
  readonly wake: () => void;
  readonly reject: (error: unknown) => void;
  deadline: number;
  phase: "queued" | "reserved" | "sent" | "replay" | "done";
}

class LocalFloodWait extends Error {
  readonly code = 420;
  readonly errorMessage = "FLOOD_WAIT";
  constructor(readonly seconds: number, cause: unknown) {
    super(`RATE_LIMITED:${String(seconds)}`, { cause });
  }
}

const CONTROLS = new Set(["MsgsAck", "MsgsStateInfo", "Ping", "PingDelayDisconnect"]);

function method(state: RpcAdmissionState): string {
  const request = state.request;
  if (request !== null && typeof request === "object" && "className" in request &&
      typeof request.className === "string" && /^[A-Za-z][\w.]*$/.test(request.className)) return request.className;
  throw new Error("Application RPC must have a valid method name");
}

/** One process-local account owner, including exported senders and replay attempts. */
export class AccountAdmission implements RpcAdmissionHooks {
  private readonly owner: string;
  private readonly records = new WeakMap<RpcAdmissionState, Entry>();
  private readonly pending = new Set<Entry>();
  private active: Entry | undefined;
  private until = 0;
  private remoteCause: unknown;
  private closed: Error | undefined;
  private cancelTimer: (() => void) | undefined;
  private attempt = 0;
  private completedMethod: string | undefined;
  private completedCount = 0;
  private lastSentAt = -Infinity;
  private requestIntervalMs = 0;
  remoteFloods = 0;
  localRefusals = 0;

  constructor(owner: string, private readonly time: AdmissionClock = clock,
    private readonly emit: (event: AdmissionEvent) => void = (event): void => {
      process.stderr.write(`${JSON.stringify({ telegramAdmission: event })}\n`);
    }) {
    if (owner === "") throw new Error("Admission requires an explicit account owner");
    this.owner = createHash("sha256").update(owner).digest("hex").slice(0, 12);
  }

  get holdUntil(): number | null { return this.closed ? null : this.until; }
  get queued(): number { return [...this.pending].filter((entry) => entry !== this.active).length; }

  private refusal(): Error | undefined {
    if (this.closed) return this.closed;
    const remaining = this.until - this.time.now();
    return remaining > 0 ? new LocalFloodWait(Math.ceil(remaining / 1000), this.remoteCause) : undefined;
  }

  private report(origin: AdmissionEvent["origin"], name: string): void {
    this.emit({ owner: this.owner, method: name, attempt: this.attempt, origin,
      at: this.time.now(), holdUntil: this.holdUntil,
      remaining: this.closed ? null : Math.max(0, Math.ceil((this.until - this.time.now()) / 1000)), queued: this.queued });
  }

  private finish(entry: Entry): void {
    if (entry.phase === "done") return;
    entry.phase = "done";
    this.pending.delete(entry);
    if (this.active === entry) this.active = undefined;
    entry.wake();
    this.wake();
  }

  private reject(entry: Entry, error: unknown): void {
    this.finish(entry);
    entry.reject(error);
  }

  private wake(): void {
    this.cancelTimer?.();
    this.cancelTimer = undefined;
    let due = Infinity;
    const now = this.time.now();
    for (const entry of this.pending) {
      entry.wake();
      if (entry.phase !== "sent") due = Math.min(due, entry.deadline);
    }
    const nextSendAt = this.lastSentAt + this.requestIntervalMs;
    if (this.active?.phase !== "sent" && this.pending.size > 0 && nextSendAt > now) {
      due = Math.min(due, nextSendAt);
    }
    if (Number.isFinite(due)) this.cancelTimer = this.time.schedule((): void => {
      this.cancelTimer = undefined;
      for (const entry of [...this.pending]) {
        if (entry.phase !== "sent" && entry.deadline <= this.time.now()) {
          this.reject(entry, new Error("Telegram application request expired in the admission queue"));
        }
      }
      this.wake();
    }, Math.max(0, due - now));
  }

  // @tested-by: tst_src_tgflood_001, tst_src_tgflood_004
  enqueue(state: RpcAdmissionState, wake: () => void): boolean {
    const name = method(state);
    if (CONTROLS.has(name)) return true;
    const prior = this.records.get(state);
    if (prior !== undefined && prior.promise === state.promise) {
      if (prior.phase === "done") return false;
      // Replay keeps the outstanding operation slot and rechecks the provider hold.
      if (prior.phase === "sent") {
        prior.phase = "replay";
        prior.deadline = this.time.now() + 20_000;
        this.wake();
      }
      return true;
    }
    const denied = this.refusal();
    if (denied) {
      this.localRefusals++;
      this.report("localRefusal", name);
      throw denied;
    }
    if (this.queued >= 32) throw new Error("Telegram application admission queue is full (32)");
    if (!state.promise) throw new Error("Application RPC has no completion promise");
    if (prior) this.finish(prior);
    const entry: Entry = { state, promise: state.promise, method: name, wake,
      reject: state.reject.bind(state), deadline: this.time.now() + 20_000, phase: "queued" };
    this.records.set(state, entry);
    this.pending.add(entry);
    // Application Promise.race timeouts do not settle this transport promise.
    void entry.promise.then(() => {
      if (this.completedMethod === entry.method) this.completedCount++;
      else { this.completedMethod = entry.method; this.completedCount = 1; }
      this.finish(entry);
    }, () => { this.finish(entry); });
    this.wake();
    return true;
  }

  select(state: RpcAdmissionState): "ready" | "wait" | "discard" {
    if (CONTROLS.has(method(state))) return "ready";
    const entry = this.records.get(state);
    if (!entry || entry.phase === "done") return "discard";
    const denied = this.refusal();
    if (denied) { this.reject(entry, denied); return "discard"; }
    if (entry.phase === "reserved") return "ready";
    if (this.active && this.active !== entry) return "wait";
    const first = [...this.pending].find((candidate) => candidate.phase !== "done");
    if (first !== entry) return "wait";
    // @tested-by: tst_src_tgflood_006
    // @invariant: provider feedback paces the next burst after its exact hold.
    if (this.time.now() < this.lastSentAt + this.requestIntervalMs) return "wait";
    this.active = entry;
    entry.phase = "reserved";
    return "ready";
  }

  // @tested-by: tst_src_tgflood_002 — called synchronously immediately before send.
  sent(state: RpcAdmissionState): void {
    if (CONTROLS.has(method(state))) return;
    const entry = this.records.get(state);
    if (!entry || entry !== this.active || entry.phase !== "reserved") throw new Error("Missing application send reservation");
    const denied = this.refusal();
    if (denied) throw denied;
    entry.phase = "sent";
    this.attempt++;
    this.lastSentAt = this.time.now();
    this.report("send", entry.method);
    this.wake();
  }

  observe(state: RpcAdmissionState | undefined, error: unknown): unknown {
    if (error === null || typeof error !== "object") return error;
    const flood = ("code" in error && error.code === 420) ||
      ("errorMessage" in error && typeof error.errorMessage === "string" && error.errorMessage.startsWith("FLOOD_WAIT"));
    if (!flood) return error;
    this.remoteFloods++;
    this.remoteCause = error;
    const seconds = "seconds" in error ? error.seconds : undefined;
    const deadline = typeof seconds === "number" ? this.time.now() + seconds * 1000 : NaN;
    if (typeof seconds !== "number" || seconds < 0 || !Number.isFinite(seconds) || !Number.isSafeInteger(Math.ceil(deadline))) {
      this.closed = new Error("Telegram flood duration is invalid; account admission is closed", { cause: error });
    } else {
      this.until = Math.max(this.until, deadline);
      const floodedMethod = state ? method(state) : undefined;
      if (floodedMethod === this.completedMethod && this.completedCount > 1) {
        this.requestIntervalMs = Math.max(this.requestIntervalMs, Math.ceil(seconds * 1000 / (this.completedCount + 1)));
      }
      this.completedMethod = undefined;
      this.completedCount = 0;
    }
    this.report("remoteFlood", state ? method(state) : "UnmatchedRpcResult");
    // A valid zero wait is still an error for this operation, never an SDK
    // sleep/retry loop or an invented cooldown for the next caller.
    const denied = this.refusal() ?? new LocalFloodWait(0, error);
    for (const entry of [...this.pending]) {
      if (entry.state !== state && entry.phase !== "sent") this.reject(entry, denied);
    }
    this.wake();
    return denied;
  }

  cancel(states: readonly RpcAdmissionState[], reason: unknown): void {
    for (const state of states) {
      const entry = this.records.get(state);
      if (entry) this.reject(entry, reason);
      else state.reject(reason);
    }
  }

  stop(): void {
    this.closed = new Error("Telegram account admission stopped");
    this.cancel([...this.pending].map((entry) => entry.state), this.closed);
  }
}
