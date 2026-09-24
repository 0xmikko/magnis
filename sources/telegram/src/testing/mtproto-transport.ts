import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import bigInt from "big-integer";
import { spyOn } from "bun:test";
import { Api } from "telegram";
import { _handleUpdate } from "telegram/client/updates";
import type { TelegramClient } from "telegram";
import { AuthKey } from "telegram/crypto/AuthKey";
import { BinaryReader } from "telegram/extensions/BinaryReader";
import { Logger, LogLevel } from "telegram/extensions/Logger";
import type { MessagePacker } from "telegram/extensions/MessagePacker";
import { Connection } from "telegram/network";
import { MTProtoSender } from "telegram/network/MTProtoSender";
import type { MTProtoState } from "telegram/network/MTProtoState";
import type { RequestState } from "telegram/network/RequestState";
import { StringSession } from "telegram/sessions";
import { MessageContainer, RPCResult, TLMessage } from "telegram/tl/core";

import { createTelegramClient, TgClient } from "../live";
import { AccountAdmission } from "../request-admission";
import type { AdmissionEvent } from "../request-admission";

// Keep unwrapped I/O entrypoints when two synthetic accounts coexist.
const nativeTimeout = globalThis.setTimeout;
const realSenderConnect = Object.getOwnPropertyDescriptor(MTProtoSender.prototype, "connect")?.value as MTProtoSender["connect"];
if (typeof realSenderConnect !== "function") throw new Error("Missing real SDK connect method");

export class VirtualClock {
  private time = 0;
  private sequence = 0;
  private readonly timers = new Map<number, { at: number; run: () => void }>();

  now(): number { return this.time; }
  get timerCount(): number { return this.timers.size; }
  schedule(run: () => void, delay: number): () => void {
    const id = ++this.sequence;
    this.timers.set(id, { at: this.time + delay, run });
    return (): void => { this.timers.delete(id); };
  }
  advance(ms: number): void {
    const end = this.time + ms;
    let ticks = 0;
    for (;;) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (next === undefined || next[1].at > end) break;
      if (++ticks > 1000) throw new Error("Virtual clock detected a timer spin");
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].run();
    }
    this.time = end;
  }
}

interface SenderInternals {
  _client: TelegramClient;
  _sendQueue: MessagePacker;
  _state: MTProtoState;
  _sendLoopHandle?: Promise<void>;
  _recvLoopHandle?: Promise<void>;
}
interface Frame { readonly id: bigInt.BigInteger; readonly constructor: number }

let artifactDigests: Record<string, string> | undefined;

/** Compact evidence from synthetic data only; hashes identify the actual code. */
export function caseEvidence(test: string, parameter: string): (
  fixture: Awaited<ReturnType<typeof createTransport>>, clock: VirtualClock, details: Record<string, unknown>,
) => void {
  const startedAt = new Date().toISOString();
  if (!artifactDigests) {
    const local = ["client.ts", "live.ts", "request-admission.ts", "connector.ts", "main.ts", "auth.ts",
      "subscriptions.ts", "surfaces/telegram/commands.ts", "surfaces/telegram/envelope.ts",
      "tst_src_tgflood_001.test.ts", "testing/mtproto-transport.ts"];
    const files: [string, URL][] = local.map((path) => [path, new URL(`../${path}`, import.meta.url)]);
    files.push(["sdk.patch", new URL("../../../../patches/telegram@2.26.22.patch", import.meta.url)]);
    for (const path of ["client/telegramBaseClient.js", "client/telegramBaseClient.d.ts", "extensions/MessagePacker.js",
      "extensions/MessagePacker.d.ts", "network/MTProtoSender.js"]) {
      files.push([`telegram/${path}`, new URL(import.meta.resolve(`telegram/${path}`))]);
    }
    artifactDigests = Object.fromEntries(files.map(([name, path]) => [name, createHash("sha256").update(readFileSync(path)).digest("hex")]));
    process.stdout.write(`${JSON.stringify({ telegramTestArtifacts: artifactDigests })}\n`);
  }
  const artifactSet = createHash("sha256").update(JSON.stringify(artifactDigests)).digest("hex");
  return (fixture, clock, details): void => {
    const hold = fixture.admission.holdUntil;
    process.stdout.write(`${JSON.stringify({ test, parameter, startedAt, endedAt: new Date().toISOString(), artifactSet,
      reproduce: `bun run agent:test:backend -- sources/telegram/src/tst_src_tgflood_001.test.ts -t ${test}`,
      actualTransmissions: fixture.writes.length, virtualElapsedMs: clock.now(), remoteFloods: fixture.admission.remoteFloods,
      localRefusals: fixture.admission.localRefusals, holdUntil: hold,
      remaining: hold === null ? null : Math.max(0, Math.ceil((hold - clock.now()) / 1000)),
      maxInFlight: fixture.maximumInFlight(), ...details })}\n`);
  };
}

function frames(data: Buffer, offset = 0): Frame[] {
  const id = bigInt(data.readBigInt64LE(offset).toString());
  const constructor = data.readUInt32LE(offset + 16);
  if (constructor !== MessageContainer.CONSTRUCTOR_ID) return [{ id, constructor }];
  const result: Frame[] = [];
  const count = data.readInt32LE(offset + 20);
  let position = offset + 24;
  for (let index = 0; index < count; index++) {
    result.push(...frames(data, position));
    position += 16 + data.readInt32LE(position + 12);
  }
  return result;
}

function requestMethod(state: RequestState): string {
  const request: unknown = state.request;
  if (request !== null && typeof request === "object" && "className" in request && typeof request.className === "string") return request.className;
  throw new Error("Recorded application request has no method name");
}
export interface Transmission {
  readonly sender: MTProtoSender;
  readonly state: RequestState;
  readonly method: string;
  readonly msgId: bigInt.BigInteger;
  readonly at: number;
}

/** Real serializer, crypto, sender, RPC parser and Source glue; only I/O is fake. */
export async function createTransport(clock: VirtualClock, shared?: AccountAdmission, normalConnect = false,
  launch?: (transport: NonNullable<Parameters<typeof createTelegramClient>[4]>, session: string) => Promise<unknown>): Promise<{
  client: TelegramClient;
  tg: TgClient;
  sender: MTProtoSender;
  writes: Transmission[];
  admission: AccountAdmission;
  events: AdmissionEvent[];
  packets: { at: number; methods: string[] }[];
  application: (index: number) => Promise<Transmission>;
  connected: Promise<boolean>;
  releaseSleep: (delay: number) => void;
  waitSleep: (delay: number) => Promise<void>;
  incoming: (object: { getBytes(): Buffer }) => Promise<void>;
  disconnectCount: () => number;
  exportedSender: (dcId: number) => Promise<MTProtoSender>;
  ping: () => Promise<void>;
  faults: { packing?: Error; encryption?: Error; send?: Error };
  maximumInFlight: () => number;
  pauseEncryption: () => { entered: Promise<void>; release(): void };
  reply: (sent: Transmission, result: { getBytes(): Buffer }) => Promise<void>;
  close: () => Promise<void>;
}> {
  const logger = new Logger(LogLevel.NONE);
  const events: AdmissionEvent[] = [];
  const writes: Transmission[] = [];
  const packets: { at: number; methods: string[] }[] = [];
  const waiting = new Map<number, ((sent: Transmission) => void)[]>();
  const encoded = new WeakMap<Buffer, { frames: Frame[]; sender: MTProtoSender }>();
  const senders = new Set<MTProtoSender>();
  let controlSent: ((sent: Transmission) => void) | undefined;
  const inFlight = new Set<Promise<unknown>>();
  let maximumInFlight = 0;
  const faults: { packing?: Error; encryption?: Error; send?: Error } = {};
  let encryptionPause: { enter(): void; released: Promise<void> } | undefined;
  const admission = shared ?? new AccountAdmission("fixture-A", clock, (event) => { events.push(event); });
  const authKey = new AuthKey();
  await authKey.setKey(Buffer.alloc(256, 7));
  const session = new StringSession("");
  session.setDC(1, "fixture.invalid", 443);
  session.setAuthKey(authKey);
  let disconnectCount = 0;
  let transportReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => { transportReady = resolve; });
  class FakeConnection extends Connection {
    private rejectReceive: ((error: Error) => void) | undefined;
    override connect(): Promise<void> {
      this._connected = true;
      transportReady?.();
      return Promise.resolve();
    }
    override send(bytes: Buffer): Promise<void> {
      const error = faults.send;
      delete faults.send;
      return error ? Promise.reject(error) : recordFrame(bytes);
    }
    override recv(): Promise<Buffer> {
      if (!this._connected) return Promise.reject(new Error("fixture disconnected"));
      return new Promise((_resolve, reject) => { this.rejectReceive = reject; });
    }
    override disconnect(): Promise<void> {
      disconnectCount++;
      this._connected = false;
      this.rejectReceive?.(new Error("fixture disconnected"));
      this.rejectReceive = undefined;
      return Promise.resolve();
    }
  }
  const transport = { baseLogger: logger, connection: FakeConnection };
  let client = createTelegramClient(session, 1, "fixture-only", admission, transport);
  const connectSpy = spyOn(MTProtoSender.prototype, "connect").mockImplementation(async function (this: MTProtoSender, connection, force): Promise<boolean> {
    if (connection instanceof FakeConnection) {
      client = (this as unknown as SenderInternals)._client;
      attach(this);
      // Synthetic crypto boundary for provisional auth; no DH/socket traffic.
      if (!this.authKey.getKey()) await this.authKey.setKey(Buffer.alloc(256, 7));
    }
    return realSenderConnect.call(this, connection, force);
  });
  const sleepers = new Map<number, (() => void)[]>();
  const sleepWaiters = new Map<number, (() => void)[]>();
  const fakeTimeout = (callback: TimerHandler, delay?: number, ...args: unknown[]): ReturnType<typeof setTimeout> => {
    if (typeof callback !== "function") throw new Error("Fixture expects a callable SDK timer");
    const invoke = (): void => { Reflect.apply(callback, undefined, args); };
    const timer = nativeTimeout(invoke, delay);
    if (delay === 9000 || delay === 2000 || delay === 1000) {
      clearTimeout(timer);
      const callbacks = sleepers.get(delay) ?? [];
      callbacks.push(invoke);
      sleepers.set(delay, callbacks);
      for (const resolve of sleepWaiters.get(delay) ?? []) resolve();
      sleepWaiters.delete(delay);
    }
    return timer;
  };
  // Select the Node/Bun overload, not the browser's numeric timer declaration.
  const timerHost: { setTimeout(callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]): ReturnType<typeof setTimeout> } = globalThis;
  const timerSpy = spyOn(timerHost, "setTimeout").mockImplementation(fakeTimeout);
  const releaseSleep = (delay: number): void => {
    const callbacks = sleepers.get(delay) ?? [];
    sleepers.delete(delay);
    for (const callback of callbacks) callback();
  };
  const connected = launch ? launch(transport, session.save()).then(() => true) : normalConnect ? client.connect() : Promise.resolve(true);
  if (normalConnect) await ready;
  const sender = normalConnect ? connectedSender(client) : new MTProtoSender(authKey, {
    logger, client, dcId: 1, retries: 1, reconnectRetries: 0,
    delay: 0, autoReconnect: false, connectTimeout: 0, authKeyCallback: undefined,
    isMainSender: true, securityChecks: true, _exportedSenderPromises: new Map(),
    updateCallback: _handleUpdate,
  });
  const tg = new TgClient(client);
  function attach(target: MTProtoSender): void {
    if (senders.has(target)) return;
    senders.add(target);
    const internal = target as unknown as SenderInternals;
    const pack = internal._state.writeDataAsMessage.bind(internal._state);
    internal._state.writeDataAsMessage = async (...args): Promise<bigInt.BigInteger> => {
      const error = faults.packing;
      delete faults.packing;
      if (error) throw error;
      return pack(...args);
    };
    const encrypt = internal._state.encryptMessageData.bind(internal._state);
    internal._state.encryptMessageData = async (data): Promise<Buffer> => {
      const error = faults.encryption;
      delete faults.encryption;
      if (error) throw error;
      const encrypted = await encrypt(data);
      encoded.set(encrypted, { frames: frames(data), sender: target });
      const pause = encryptionPause;
      encryptionPause = undefined;
      if (pause) { pause.enter(); await pause.released; }
      return encrypted;
    };
  }
  function recordFrame(bytes: Buffer): Promise<void> {
      if (bytes.length < 24) throw new Error("Expected real encrypted MTProto bytes");
      const packet = encoded.get(bytes);
      if (!packet) throw new Error("Transmission bypassed real packet encryption");
      const methods: string[] = [];
      for (const frame of packet.frames) {
        const state = packet.sender._pendingState.get(frame.id);
        if (!state) {
          if (frame.constructor !== Api.MsgsAck.CONSTRUCTOR_ID) throw new Error("Uncorrelated non-acknowledgement frame");
          methods.push("MsgsAck");
          continue;
        }
        const method = requestMethod(state);
        methods.push(method);
        const sent = { sender: packet.sender, state, method, msgId: frame.id, at: clock.now() };
        if (["Ping", "PingDelayDisconnect", "MsgsStateInfo"].includes(method)) {
          controlSent?.(sent);
          controlSent = undefined;
          continue;
        }
        const index = writes.length;
        const completion = state.promise;
        if (!completion) throw new Error("Transmitted application has no completion promise");
        inFlight.add(completion);
        maximumInFlight = Math.max(maximumInFlight, inFlight.size);
        void completion.then(() => { inFlight.delete(completion); }, () => { inFlight.delete(completion); });
        writes.push(sent);
        for (const resolve of waiting.get(index) ?? []) resolve(sent);
        waiting.delete(index);
      }
      packets.push({ at: clock.now(), methods });
      return Promise.resolve();
  }
  if (!normalConnect) {
    client._sender = sender;
    client._connectedDeferred.resolve();
    await sender.connect(new FakeConnection({ ip: "fixture.invalid", port: 443, dcId: 1,
      loggers: logger, socket: client.networkSocket, testServers: false }), false);
  }
  let responseId = bigInt(100);
  return {
    client, tg, sender, writes, admission, events, packets, connected, releaseSleep, faults,
    pauseEncryption: (): { entered: Promise<void>; release(): void } => {
      let enter = (): void => { throw new Error("Encryption barrier not initialized"); };
      let release = (): void => { throw new Error("Encryption barrier not initialized"); };
      const entered = new Promise<void>((resolve) => { enter = resolve; });
      const released = new Promise<void>((resolve) => { release = resolve; });
      encryptionPause = { enter, released };
      return { entered, release };
    },
    disconnectCount: (): number => disconnectCount,
    maximumInFlight: (): number => maximumInFlight,
    ping: async (): Promise<void> => {
      const transmitted = new Promise<Transmission>((resolve) => { controlSent = resolve; });
      const pending = sender.send(new Api.Ping({ pingId: bigInt(7) }));
      const sent = await transmitted;
      responseId = responseId.add(4);
      const pong: unknown = new BinaryReader(new Api.Pong({ msgId: sent.msgId, pingId: bigInt(7) }).getBytes()).tgReadObject();
      await sender._processMessage(new TLMessage(responseId, 1, pong));
      await pending;
    },
    exportedSender: async (dcId): Promise<MTProtoSender> => {
      const exported = client._createExportedSender(dcId);
      await exported.authKey.setKey(Buffer.alloc(256, 7));
      await exported.connect(new FakeConnection({ ip: "fixture.invalid", port: 443, dcId,
        loggers: logger, socket: client.networkSocket, testServers: false }), false);
      client._exportedSenderPromises.set(dcId, Promise.resolve(exported));
      return exported;
    },
    waitSleep: (delay): Promise<void> => {
      if (sleepers.has(delay)) return Promise.resolve();
      return new Promise((resolve) => {
        const waiters = sleepWaiters.get(delay) ?? [];
        waiters.push(resolve);
        sleepWaiters.set(delay, waiters);
      });
    },
    incoming: async (object): Promise<void> => {
      responseId = responseId.add(4);
      const decoded: unknown = new BinaryReader(object.getBytes()).tgReadObject();
      await sender._processMessage(new TLMessage(responseId, 1, decoded));
    },
    application: (index): Promise<Transmission> => {
      const sent = writes[index];
      if (sent) return Promise.resolve(sent);
      return new Promise((resolve) => {
        const subscribers = waiting.get(index) ?? [];
        subscribers.push(resolve);
        waiting.set(index, subscribers);
      });
    },
    reply: async (sent, result): Promise<void> => {
      const header = Buffer.alloc(12);
      header.writeUInt32LE(RPCResult.CONSTRUCTOR_ID);
      header.writeBigInt64LE(BigInt(sent.msgId.toString()), 4);
      const decoded: unknown = new BinaryReader(Buffer.concat([header, result.getBytes()])).tgReadObject();
      responseId = responseId.add(4);
      try { await sent.sender._processMessage(new TLMessage(responseId, 1, decoded)); }
      catch (error) {
        // A remote error belongs to the receiver, never to connection.send().
        if (!(result instanceof Api.RpcError)) throw error;
      }
    },
    close: async (): Promise<void> => {
      try {
        const loops = [...senders].flatMap((target) => {
          const internal = target as unknown as SenderInternals;
          return [internal._sendLoopHandle, internal._recvLoopHandle];
        });
        await client.destroy();
        const timers = client as unknown as { _exportedSenderReleaseTimeouts: Map<number, ReturnType<typeof setTimeout>> };
        for (const timer of timers._exportedSenderReleaseTimeouts.values()) clearTimeout(timer);
        for (const target of senders) await target.disconnect();
        releaseSleep(9000);
        await Promise.all(loops.filter((loop): loop is Promise<void> => loop !== undefined));
      } finally { timerSpy.mockRestore(); connectSpy.mockRestore(); }
    },
  };
}

function connectedSender(client: TelegramClient): MTProtoSender {
  const sender = client._sender;
  if (!sender) throw new Error("Real connect did not create its sender");
  return sender;
}

/** A serialized, decoded setup response, not a replacement connect implementation. */
export function setupConfig(): Api.Config {
  return new Api.Config({
    date: 0, expires: 1, testMode: false, thisDc: 1,
    dcOptions: [new Api.DcOption({ id: 1, ipAddress: "fixture.invalid", port: 443 })],
    dcTxtDomainName: "fixture.invalid", meUrlPrefix: "https://fixture.invalid/",
    chatSizeMax: 0, megagroupSizeMax: 0, forwardedCountMax: 0, onlineUpdatePeriodMs: 0,
    offlineBlurTimeoutMs: 0, offlineIdleTimeoutMs: 0, onlineCloudTimeoutMs: 0,
    notifyCloudDelayMs: 0, notifyDefaultDelayMs: 0, pushChatPeriodMs: 0, pushChatLimit: 0,
    editTimeLimit: 0, revokeTimeLimit: 0, revokePmTimeLimit: 0, ratingEDecay: 0,
    stickersRecentLimit: 0, channelsReadMediaPeriod: 0, callReceiveTimeoutMs: 0,
    callRingTimeoutMs: 0, callConnectTimeoutMs: 0, callPacketTimeoutMs: 0,
    captionLengthMax: 0, messageLengthMax: 0, webfileDcId: 0,
  });
}
