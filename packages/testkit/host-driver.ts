import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SourceV2CodecError,
  SOURCE_V2_CANCELLED_CODE,
  decodeSourceV2Frame,
  decodeSourceV2Result,
  encodeSourceV2Frame,
  type SourceV2NotificationFrame,
  type SourceV2RequestId,
} from "../connector-sdk/codec";
import {
  boundedSourceV2Lines,
  systemSourceV2DeadlineScheduler,
  type SourceV2DeadlineScheduler,
} from "../connector-sdk/server";
import { sourceArtifactPackageHash } from "./receipt";
import type { ProviderOperation } from "../connector-sdk/contract/source";

export const SOURCE_HOST_MAX_STDERR_BYTES = 64 * 1024;

interface JsonRpcReply {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeReply(value: unknown, label: string): JsonRpcReply {
  if (!isRecord(value) || value.jsonrpc !== "2.0") {
    throw new Error(`${label} is not a JSON-RPC 2.0 object`);
  }
  if (typeof value.id !== "number" && typeof value.id !== "string" && value.id !== null) {
    throw new Error(`${label} has an invalid id`);
  }
  const hasResult = Object.hasOwn(value, "result");
  const hasError = Object.hasOwn(value, "error");
  if (hasResult === hasError) throw new Error(`${label} must contain exactly one of result or error`);
  if (hasError) {
    if (!isRecord(value.error) || typeof value.error.code !== "number" || typeof value.error.message !== "string") {
      throw new Error(`${label}.error is malformed`);
    }
  }
  return {
    jsonrpc: "2.0",
    id: value.id,
    ...(hasResult ? { result: value.result } : { error: value.error as JsonRpcReply["error"] }),
  };
}

export interface SourceHostEvidence {
  initialize: JsonRpcReply;
  toolsList: JsonRpcReply;
  operationProbes: Readonly<Record<string, JsonRpcReply>>;
}

export interface SourceHostEvidenceOptions {
  timeoutMs?: number;
  operationArguments?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  fixtureEnvironment?: Readonly<Record<string, string>>;
}

function probeArguments(
  operation: string,
  authored: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): Record<string, unknown> {
  const exact = authored[operation];
  if (exact !== undefined) return { ...exact };
  if (operation === "listen_start") {
    return { subscription_id: "certification-probe", _meta: { account_id: "certification" } };
  }
  if (operation === "listen_stop") return { subscription_id: "certification-probe" };
  if (operation === "magnis.sync.listen") return { _meta: { account_id: "certification" } };
  const separator = operation.indexOf(":");
  if (separator >= 0) return { action: operation.slice(separator + 1), _certification_probe: true };
  return { _certification_probe: true };
}

function requestForOperation(
  id: number,
  operation: string,
  authored: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): Record<string, unknown> {
  if (operation === "initialize") return { jsonrpc: "2.0", id, method: "initialize" };
  if (operation === "tools/list") return { jsonrpc: "2.0", id, method: "tools/list" };
  const separator = operation.indexOf(":");
  const tool = separator >= 0 ? operation.slice(0, separator) : operation;
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: tool, arguments: probeArguments(operation, authored) },
  };
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

interface TerminableSourceHost {
  readonly exitCode: number | null;
  readonly exited: Promise<number>;
  kill(signal?: number): void;
}

/** Stop a certifier-owned child without allowing an ignored SIGTERM to hang
 * the certification process forever. SIGKILL gets one final bounded wait; a
 * kernel/process-table failure remains a hard certification error. */
export async function terminateSourceHostProcess(
  child: TerminableSourceHost,
  timeoutMs = 250,
): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill();
  try {
    await withDeadline(child.exited, timeoutMs, "Source host SIGTERM shutdown");
    return;
  } catch {
    child.kill(9);
  }
  await withDeadline(child.exited, timeoutMs, "Source host SIGKILL shutdown");
}

/** Execute one dependency-closed Source artifact over its real stdio boundary.
 * Every declared operation is probed; any absent dispatcher is a certification
 * failure even when initialize and tools/list succeed. */
async function collectSourceHostProcessEvidence(
  artifactRoot: string,
  callableOperations: readonly string[],
  extraArgs: readonly string[],
  timeoutMs: number,
  operationArguments: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  fixtureEnvironment: Readonly<Record<string, string>>,
): Promise<SourceHostEvidence> {
  const operations = [...new Set(callableOperations)].sort();
  if (!operations.includes("initialize") || !operations.includes("tools/list")) {
    throw new Error("callable operations must include initialize and tools/list");
  }
  const requests = operations.map((operation, index) =>
    requestForOperation(index + 1, operation, operationArguments),
  );
  const child = Bun.spawn([process.execPath, "run", "dist/main.js", ...extraArgs], {
    cwd: artifactRoot,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...fixtureEnvironment,
      LANG: "C.UTF-8",
      NO_COLOR: "1",
    },
  });
  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  try {
    await child.stdin.write(`${requests.map((request) => JSON.stringify(request)).join("\n")}\n`);
    await child.stdin.end();
    const [exitCode, stdout, stderr] = await withDeadline(
      Promise.all([child.exited, stdoutPromise, stderrPromise]),
      timeoutMs,
      `Source host ${artifactRoot}`,
    );
    if (exitCode !== 0) {
      throw new Error(`Source host exited ${String(exitCode)}: ${stderr.trim()}`);
    }
    const replies = stdout
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line, index): JsonRpcReply => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(line) as unknown;
        } catch (error: unknown) {
          throw new Error(`Source host output line ${String(index + 1)} is not JSON`, { cause: error });
        }
        return decodeReply(parsed, `Source host output line ${String(index + 1)}`);
      });
    if (new Set(replies.map(({ id }) => id)).size !== replies.length) {
      throw new Error("Source host returned duplicate JSON-RPC ids");
    }
    const byId = new Map(replies.map((reply) => [reply.id, reply]));
    const evidence = new Map<string, JsonRpcReply>();
    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index];
      if (operation === undefined) continue;
      const reply = byId.get(index + 1);
      if (reply === undefined) throw new Error(`Source host omitted reply for '${operation}'`);
      if (
        reply.error?.code === -32601 &&
        /unknown tool|not available|not implemented/i.test(reply.error.message ?? "")
      ) {
        throw new Error(`Source host does not implement declared operation '${operation}'`);
      }
      evidence.set(operation, reply);
    }
    const initialize = evidence.get("initialize");
    const toolsList = evidence.get("tools/list");
    if (initialize === undefined || toolsList === undefined) {
      throw new Error("Source host did not return initialize and tools/list evidence");
    }
    return {
      initialize,
      toolsList,
      operationProbes: Object.fromEntries(
        [...evidence].filter(([operation]) => operation !== "initialize" && operation !== "tools/list"),
      ),
    };
  } finally {
    await terminateSourceHostProcess(child);
  }
}

export async function collectSourceHostEvidence(
  artifactRoot: string,
  callableOperations: readonly string[],
  options: SourceHostEvidenceOptions = {},
): Promise<SourceHostEvidence> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const operationArguments = options.operationArguments ?? {};
  const fixtureEnvironment = options.fixtureEnvironment ?? {};
  const operations = [...new Set(callableOperations)].sort();
  const authOperations = operations.filter((operation) => operation.startsWith("magnis.auth."));
  const syncOperations = operations.filter((operation) => !operation.startsWith("magnis.auth."));
  const syncEvidence = await collectSourceHostProcessEvidence(
    artifactRoot,
    syncOperations,
    [],
    timeoutMs,
    operationArguments,
    fixtureEnvironment,
  );
  if (authOperations.length === 0) return syncEvidence;
  const authEvidence = await collectSourceHostProcessEvidence(
    artifactRoot,
    ["initialize", ...authOperations, "tools/list"],
    ["--auth-mode"],
    timeoutMs,
    operationArguments,
    fixtureEnvironment,
  );
  return {
    ...syncEvidence,
    operationProbes: {
      ...syncEvidence.operationProbes,
      ...authEvidence.operationProbes,
    },
  };
}

export interface FixedSourceHostCommand {
  readonly executable: string;
  readonly args: readonly string[];
}

export interface BuiltSourceArtifact {
  readonly root: string;
  /** Absolute path or a path relative to root. */
  readonly entry: string;
  /** Canonical byte identity produced by the catalog package-tree hash. */
  readonly packageHash: string;
}

export interface SourceHostDriverOptions {
  readonly artifact: BuiltSourceArtifact;
  readonly command: FixedSourceHostCommand;
  readonly timeoutMs?: number;
  readonly environment?: Readonly<Record<string, string>>;
  readonly maxQueuedNotifications?: number;
  readonly deadlineScheduler?: SourceV2DeadlineScheduler;
}

export interface SourceHostRequestOptions {
  readonly deadlineMs?: number;
  readonly signal?: AbortSignal;
}

interface InteractiveSourceHost {
  readonly exitCode: number | null;
  readonly exited: Promise<number>;
  readonly stdin: {
    write(value: string): number | Promise<number>;
    end(): number | Promise<number>;
  };
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  kill(signal?: number): void;
}

interface PendingSourceHostRequest {
  readonly settle: (line: string) => void;
  readonly reject: (error: Error) => void;
  readonly cancelDeadline: () => void;
  readonly removeAbortListener: () => void;
}

interface NotificationWaiter {
  readonly resolve: (notification: SourceV2NotificationFrame) => void;
  readonly reject: (error: Error) => void;
  readonly cancelDeadline: () => void;
}

interface CancelledResponse {
  readonly cancelDeadline: (() => void) | null;
}

export type SourceHostProtocolErrorKind =
  | "unexpected_response_id"
  | "invalid_cancel_response";

export class SourceHostProtocolError extends Error {
  constructor(
    readonly kind: SourceHostProtocolErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SourceHostProtocolError";
  }
}

function errorFromReason(reason: unknown, fallback: string): Error {
  if (reason instanceof Error) return reason;
  if (typeof reason === "string" && reason.length > 0) return new Error(reason);
  return new Error(fallback);
}

async function readCappedText(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let retainedBytes = 0;
  let truncated = false;
  try {
    let read = await reader.read();
    while (!read.done) {
      const remaining = maxBytes - retainedBytes;
      if (remaining > 0) {
        const retained = read.value.subarray(0, remaining);
        chunks.push(retained);
        retainedBytes += retained.byteLength;
      }
      if (read.value.byteLength > remaining) truncated = true;
      read = await reader.read();
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(retainedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  return truncated
    ? `${text}\n[stderr truncated at ${String(maxBytes)} bytes]`
    : text;
}

async function* readableStreamChunks(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    let read = await reader.read();
    while (!read.done) {
      yield read.value;
      read = await reader.read();
    }
  } finally {
    reader.releaseLock();
  }
}

function exactArtifactEntry(artifact: BuiltSourceArtifact): { root: string; entry: string } {
  const root = resolve(artifact.root);
  const entry = isAbsolute(artifact.entry) ? resolve(artifact.entry) : resolve(root, artifact.entry);
  const fromRoot = relative(root, entry);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRoot)) {
    throw new Error("Source artifact entry must be a file inside the exact artifact root");
  }
  return { root, entry };
}

async function assertArtifactEntry(
  artifact: BuiltSourceArtifact,
): Promise<{ root: string; entry: string }> {
  const lexical = exactArtifactEntry(artifact);
  let root: string;
  let entry: string;
  try {
    root = await realpath(lexical.root);
    if (!(await stat(root)).isDirectory()) {
      throw new Error("Source artifact root must be a directory");
    }
  } catch (error: unknown) {
    throw new Error(`Source artifact root does not exist: ${lexical.root}`, { cause: error });
  }
  try {
    entry = await realpath(lexical.entry);
  } catch (error: unknown) {
    throw new Error(`Source artifact entry does not exist: ${lexical.entry}`, { cause: error });
  }
  const fromRoot = relative(root, entry);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error("Source artifact entry resolves outside the exact artifact root");
  }
  if (!(await stat(entry)).isFile()) {
    throw new Error("Source artifact entry must be a regular file");
  }
  const actualPackageHash = sourceArtifactPackageHash(root);
  if (actualPackageHash !== artifact.packageHash) {
    throw new Error(
      `Source artifact package hash does not match: expected ${artifact.packageHash}, received ${actualPackageHash}`,
    );
  }
  return { root, entry };
}

/** A hermetic fixed host with one root/entry/package-hash execution contract. */
export function testkitFixedSourceHostCommand(): FixedSourceHostCommand {
  return {
    executable: process.execPath,
    args: ["run", fileURLToPath(import.meta.url), "--fixed-source-host"],
  };
}

export async function runFixedSourceHost(artifact: BuiltSourceArtifact): Promise<void> {
  const { root, entry } = await assertArtifactEntry(artifact);
  process.chdir(root);
  await import(pathToFileURL(entry).href);
}

/** Interactive client for a built artifact behind one fixed Source host. */
export class SourceHostDriver {
  private readonly pending = new Map<SourceV2RequestId, PendingSourceHostRequest>();
  private readonly cancelledResponses = new Map<SourceV2RequestId, CancelledResponse>();
  private readonly notifications: SourceV2NotificationFrame[] = [];
  private readonly notificationWaiters: NotificationWaiter[] = [];
  private readonly timeoutMs: number;
  private readonly maxQueuedNotifications: number;
  private readonly deadlineScheduler: SourceV2DeadlineScheduler;
  private readonly stdoutDone: Promise<void>;
  private readonly stderrText: Promise<string>;
  private nextRequestId = 1;
  private failure: Error | undefined;
  private closing = false;
  private joined = false;

  private constructor(
    private readonly child: InteractiveSourceHost,
    options: SourceHostDriverOptions,
  ) {
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.maxQueuedNotifications = options.maxQueuedNotifications ?? 256;
    this.deadlineScheduler = options.deadlineScheduler ?? systemSourceV2DeadlineScheduler;
    this.stderrText = readCappedText(child.stderr, SOURCE_HOST_MAX_STDERR_BYTES);
    this.stdoutDone = this.consumeStdout();
    void child.exited.then(async (code) => {
      if (!this.closing) {
        const stderr = (await this.stderrText).trim();
        this.fail(new Error(`Source host exited ${String(code)}${stderr.length > 0 ? `: ${stderr}` : ""}`));
      }
    });
  }

  static async open(options: SourceHostDriverOptions): Promise<SourceHostDriver> {
    const { root, entry } = await assertArtifactEntry(options.artifact);
    const child = Bun.spawn(
      [
        options.command.executable,
        ...options.command.args,
        root,
        entry,
        options.artifact.packageHash,
      ],
      {
        cwd: root,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...(options.environment ?? {}),
          LANG: "C.UTF-8",
          NO_COLOR: "1",
        },
      },
    );
    return new SourceHostDriver(child, options);
  }

  get pendingRequestCount(): number {
    return this.pending.size;
  }

  get pendingCancellationCount(): number {
    return this.cancelledResponses.size;
  }

  get isJoined(): boolean {
    return this.joined;
  }

  get pendingNotificationWaiterCount(): number {
    return this.notificationWaiters.length;
  }

  async request<T>(
    operation: ProviderOperation<T>,
    params: unknown,
    options: SourceHostRequestOptions = {},
  ): Promise<T> {
    if (this.failure !== undefined) throw this.failure;
    if (this.closing) throw new Error("Source host driver is closing");
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    const frame = encodeSourceV2Frame({
      jsonrpc: "2.0",
      id,
      method: operation.name,
      params,
    });
    const deadlineMs = options.deadlineMs ?? this.timeoutMs;

    return await new Promise<T>((resolveRequest, rejectRequest) => {
      const reject = (error: Error): void => {
        rejectRequest(error);
      };
      const onAbort = (): void => {
        this.cancelPending(
          id,
          errorFromReason(options.signal?.reason, `Source host request '${operation.name}' cancelled`),
        );
      };
      if (options.signal?.aborted === true) {
        reject(errorFromReason(options.signal.reason, `Source host request '${operation.name}' cancelled`));
        return;
      }
      options.signal?.addEventListener("abort", onAbort, { once: true });
      const cancelDeadline = this.deadlineScheduler.schedule(deadlineMs, () => {
        this.cancelPending(
          id,
          new Error(`Source host request '${operation.name}' timed out after ${String(deadlineMs)}ms`),
        );
      });
      this.pending.set(id, {
        cancelDeadline,
        removeAbortListener: (): void => options.signal?.removeEventListener("abort", onAbort),
        reject,
        settle: (line: string): void => {
          try {
            resolveRequest(decodeSourceV2Result(line, id, operation));
          } catch (error: unknown) {
            reject(errorFromReason(error, `Source host request '${operation.name}' failed`));
          }
        },
      });
      void Promise.resolve(this.child.stdin.write(`${frame}\n`)).catch((error: unknown) => {
        this.rejectPending(id, errorFromReason(error, "Source host stdin write failed"));
      });
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (this.failure !== undefined) throw this.failure;
    if (this.closing) throw new Error("Source host driver is closing");
    const frame = encodeSourceV2Frame({
      jsonrpc: "2.0",
      method,
      ...(params === undefined ? {} : { params }),
    });
    await this.child.stdin.write(`${frame}\n`);
  }

  async nextNotification(deadlineMs = this.timeoutMs): Promise<SourceV2NotificationFrame> {
    if (this.closing || this.joined) throw new Error("Source host driver is closed");
    const queued = this.notifications.shift();
    if (queued !== undefined) return queued;
    if (this.failure !== undefined) throw this.failure;
    return await new Promise<SourceV2NotificationFrame>((resolveNotification, rejectNotification) => {
      const waiter: NotificationWaiter = {
        resolve: resolveNotification,
        reject: rejectNotification,
        cancelDeadline: this.deadlineScheduler.schedule(deadlineMs, () => {
          const index = this.notificationWaiters.indexOf(waiter);
          if (index >= 0) this.notificationWaiters.splice(index, 1);
          rejectNotification(new Error(`Source host notification timed out after ${String(deadlineMs)}ms`));
        }),
      };
      this.notificationWaiters.push(waiter);
    });
  }

  async close(): Promise<void> {
    if (this.joined) return;
    this.closing = true;
    this.notifications.splice(0);
    for (const waiter of this.notificationWaiters.splice(0)) {
      waiter.cancelDeadline();
      waiter.reject(new Error("Source host driver closed"));
    }
    for (const id of [...this.pending.keys()]) {
      this.cancelPending(id, new Error("Source host driver closed"));
    }
    try {
      await this.child.stdin.end();
    } catch {
      // A crashed child has already closed the pipe; its exit is still joined.
    }
    try {
      await withDeadline(this.child.exited, this.timeoutMs, "Source host graceful close");
    } catch {
      await terminateSourceHostProcess(this.child, this.timeoutMs);
    }
    await this.stdoutDone;
    await this.stderrText;
    this.clearCancelledResponses();
    this.notifications.splice(0);
    this.joined = true;
  }

  private cancelPending(id: SourceV2RequestId, error: Error): void {
    const request = this.takePending(id);
    if (request === undefined) return;
    request.reject(error);
    this.expectCancelledResponse(id);
    const frame = encodeSourceV2Frame({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: id, reason: error.message },
    });
    void Promise.resolve(this.child.stdin.write(`${frame}\n`)).catch(() => undefined);
  }

  private rejectPending(id: SourceV2RequestId, error: Error): void {
    this.takePending(id)?.reject(error);
  }

  private takePending(id: SourceV2RequestId): PendingSourceHostRequest | undefined {
    const request = this.pending.get(id);
    if (request === undefined) return undefined;
    this.pending.delete(id);
    request.cancelDeadline();
    request.removeAbortListener();
    return request;
  }

  private expectCancelledResponse(id: SourceV2RequestId): void {
    const cancelDeadline = this.closing
      ? null
      : this.deadlineScheduler.schedule(this.timeoutMs, () => {
          if (!this.cancelledResponses.delete(id)) return;
          this.fail(
            new SourceHostProtocolError(
              "invalid_cancel_response",
              `Source host omitted the terminal cancellation response for '${String(id)}'`,
            ),
          );
          this.child.kill();
        });
    this.cancelledResponses.set(id, { cancelDeadline });
  }

  private takeCancelledResponse(id: SourceV2RequestId): boolean {
    const cancelled = this.cancelledResponses.get(id);
    if (cancelled === undefined) return false;
    this.cancelledResponses.delete(id);
    cancelled.cancelDeadline?.();
    return true;
  }

  private clearCancelledResponses(): void {
    for (const { cancelDeadline } of this.cancelledResponses.values()) {
      cancelDeadline?.();
    }
    this.cancelledResponses.clear();
  }

  private async consumeStdout(): Promise<void> {
    try {
      for await (const frame of boundedSourceV2Lines(readableStreamChunks(this.child.stdout))) {
        const line = new TextDecoder("utf-8", { fatal: true }).decode(frame);
        this.acceptLine(line);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const detail = message.replace(/^Source v2 frame/, "Source host frame");
      this.fail(new Error(detail));
      this.child.kill();
    }
  }

  private acceptLine(line: string): void {
    let frame: ReturnType<typeof decodeSourceV2Frame>;
    try {
      frame = decodeSourceV2Frame(line);
    } catch (error: unknown) {
      const detail = error instanceof SourceV2CodecError ? error.message : String(error);
      this.fail(new Error(`Source host emitted a malformed frame: ${detail}`));
      this.child.kill();
      return;
    }
    if (frame.kind === "notification") {
      const waiter = this.notificationWaiters.shift();
      if (waiter !== undefined) {
        waiter.cancelDeadline();
        waiter.resolve(frame);
        return;
      }
      if (this.notifications.length >= this.maxQueuedNotifications) {
        this.fail(new Error(`Source host notification queue exceeds ${String(this.maxQueuedNotifications)}`));
        this.child.kill();
        return;
      }
      this.notifications.push(frame);
      return;
    }
    if (frame.kind === "request") {
      this.fail(new Error("Source host emitted a request instead of a response or notification"));
      this.child.kill();
      return;
    }
    const pending = this.takePending(frame.id);
    if (pending !== undefined) {
      pending.settle(line);
      return;
    }
    if (this.takeCancelledResponse(frame.id)) {
      if (frame.kind === "error" && frame.error.code === SOURCE_V2_CANCELLED_CODE) return;
      this.fail(
        new SourceHostProtocolError(
          "invalid_cancel_response",
          `Source host returned a non-cancellation result for cancelled request '${String(frame.id)}'`,
        ),
      );
      this.child.kill();
      return;
    }
    this.fail(
      new SourceHostProtocolError(
        "unexpected_response_id",
        `Source host emitted an unexpected or duplicate response id '${String(frame.id)}'`,
      ),
    );
    this.child.kill();
  }

  private fail(error: Error): void {
    if (this.failure !== undefined) return;
    this.failure = error;
    this.clearCancelledResponses();
    for (const id of [...this.pending.keys()]) this.rejectPending(id, error);
    for (const waiter of this.notificationWaiters.splice(0)) {
      waiter.cancelDeadline();
      waiter.reject(error);
    }
  }
}

if (import.meta.main && process.argv[2] === "--fixed-source-host") {
  const artifactRoot = process.argv[3];
  const entry = process.argv[4];
  const packageHash = process.argv[5];
  if (artifactRoot === undefined || entry === undefined || packageHash === undefined) {
    throw new Error("fixed source-host requires artifact root, entry and package hash arguments");
  }
  await runFixedSourceHost({ root: artifactRoot, entry, packageHash });
}
