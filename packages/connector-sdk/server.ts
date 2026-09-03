import {
  SOURCE_V2_MAX_FRAME_BYTES,
  SOURCE_V2_CANCELLED_CODE,
  SourceV2CodecError,
  decodeSourceV2Frame,
  encodeSourceV2Frame,
  type SourceV2NotificationFrame,
  type SourceV2RequestFrame,
  type SourceV2RequestId,
} from "./codec";
import type { ProviderOutputSchema } from "./contract/source";

export { SOURCE_V2_CANCELLED_CODE } from "./codec";
export const SOURCE_V2_BACKPRESSURE_CODE = -32005;
export const SOURCE_V2_DEFAULT_MAX_CONCURRENT_REQUESTS = 32;
export const SOURCE_V2_DEFAULT_CLOSE_TIMEOUT_MS = 5_000;

export interface SourceV2OperationContext {
  readonly instanceId: string;
  readonly signal: AbortSignal;
  notify(method: string, params?: unknown): void;
}

export interface SourceV2ClientNotificationContext {
  readonly instanceId: string;
  readonly signal: AbortSignal;
}

export interface SourceV2OperationDefinition<TInput, TOutput> {
  readonly name: string;
  readonly inputSchema: ProviderOutputSchema<TInput>;
  readonly outputSchema: ProviderOutputSchema<TOutput>;
  handle(input: TInput, context: SourceV2OperationContext): Promise<TOutput>;
}

export interface RegisteredSourceV2Operation {
  readonly name: string;
  prepare(input: unknown): (context: SourceV2OperationContext) => Promise<unknown>;
}

class SourceV2ResultValidationError extends Error {
  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = "SourceV2ResultValidationError";
  }
}

export function defineSourceV2Operation<TInput, TOutput>(
  definition: SourceV2OperationDefinition<TInput, TOutput>,
): RegisteredSourceV2Operation {
  return {
    name: definition.name,
    prepare(value: unknown): (context: SourceV2OperationContext) => Promise<TOutput> {
      const input = definition.inputSchema.parse(value);
      return async (context: SourceV2OperationContext): Promise<TOutput> => {
        const output = await definition.handle(input, context);
        try {
          return definition.outputSchema.parse(output);
        } catch (error: unknown) {
          throw new SourceV2ResultValidationError(
            `invalid result for '${definition.name}'`,
            { cause: error },
          );
        }
      };
    },
  };
}

export interface SourceV2DeadlineScheduler {
  schedule(delayMs: number, onDeadline: () => void): () => void;
}

export const systemSourceV2DeadlineScheduler: SourceV2DeadlineScheduler = {
  schedule(delayMs, onDeadline): () => void {
    const timer = setTimeout(onDeadline, delayMs);
    return (): void => {
      clearTimeout(timer);
    };
  },
};

export class SourceV2CloseError extends Error {
  readonly kind = "non_cooperative_requests";

  constructor(
    readonly activeRequestIds: readonly SourceV2RequestId[],
    readonly activeNotificationIds: readonly number[],
    readonly timeoutMs: number,
  ) {
    super(
      `Source v2 server could not join ${String(activeRequestIds.length + activeNotificationIds.length)} work item(s) within ${String(timeoutMs)}ms`,
    );
    this.name = "SourceV2CloseError";
  }
}

export class SourceV2BackpressureError extends Error {
  readonly kind = "backpressure";

  constructor(readonly limit: number) {
    super(`Source v2 server concurrency limit ${String(limit)} reached`);
    this.name = "SourceV2BackpressureError";
  }
}

export interface SourceV2ServerConfig {
  readonly instanceId: string;
  readonly operations: readonly RegisteredSourceV2Operation[];
  readonly maxConcurrentRequests?: number;
  readonly closeTimeoutMs?: number;
  readonly deadlineScheduler?: SourceV2DeadlineScheduler;
  readonly onNotification?: (frame: string) => void;
  readonly onClientNotification?: (
    frame: SourceV2NotificationFrame,
    context: SourceV2ClientNotificationContext,
  ) => void | Promise<void>;
}

class SourceV2CancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceV2CancellationError";
  }
}

interface ActiveRequest {
  readonly controller: AbortController;
  readonly settled: Promise<void>;
}

type ActiveNotification = ActiveRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cancellation(frame: SourceV2NotificationFrame): {
  requestId: SourceV2RequestId;
  reason: string;
} {
  if (!isRecord(frame.params)) {
    throw new SourceV2CodecError("invalid_frame", "cancellation params must be an object");
  }
  const keys = Object.keys(frame.params);
  const unknown = keys.find((key) => key !== "requestId" && key !== "reason");
  if (unknown !== undefined) {
    throw new SourceV2CodecError("invalid_frame", `unknown cancellation member '${unknown}'`);
  }
  const requestId = frame.params.requestId;
  if (
    typeof requestId !== "string" &&
    !(typeof requestId === "number" && Number.isFinite(requestId))
  ) {
    throw new SourceV2CodecError(
      "invalid_frame",
      "cancellation requestId must be a finite number or string",
    );
  }
  if (frame.params.reason !== undefined && typeof frame.params.reason !== "string") {
    throw new SourceV2CodecError("invalid_frame", "cancellation reason must be a string");
  }
  return {
    requestId,
    reason: frame.params.reason ?? "Source v2 request cancelled",
  };
}

function errorFrame(
  id: SourceV2RequestId,
  code: number,
  message: string,
  data?: unknown,
): string {
  return encodeSourceV2Frame({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  });
}

/** One v2 server instance owns exactly its operations and pending requests. */
export class SourceV2Server {
  private readonly operations = new Map<string, RegisteredSourceV2Operation>();
  private readonly active = new Map<SourceV2RequestId, ActiveRequest>();
  private readonly activeNotifications = new Map<number, ActiveNotification>();
  private readonly maxConcurrentRequests: number;
  private readonly closeTimeoutMs: number;
  private readonly deadlineScheduler: SourceV2DeadlineScheduler;
  private closeResult: Promise<void> | undefined;
  private nextNotificationId = 1;
  private closing = false;

  constructor(private readonly config: SourceV2ServerConfig) {
    this.maxConcurrentRequests =
      config.maxConcurrentRequests ?? SOURCE_V2_DEFAULT_MAX_CONCURRENT_REQUESTS;
    this.closeTimeoutMs = config.closeTimeoutMs ?? SOURCE_V2_DEFAULT_CLOSE_TIMEOUT_MS;
    this.deadlineScheduler = config.deadlineScheduler ?? systemSourceV2DeadlineScheduler;
    if (!Number.isInteger(this.maxConcurrentRequests) || this.maxConcurrentRequests <= 0) {
      throw new Error("Source v2 maxConcurrentRequests must be a positive integer");
    }
    if (!Number.isFinite(this.closeTimeoutMs) || this.closeTimeoutMs <= 0) {
      throw new Error("Source v2 closeTimeoutMs must be positive and finite");
    }
    for (const operation of config.operations) {
      if (operation.name.length === 0) throw new Error("Source v2 operation name must not be empty");
      if (this.operations.has(operation.name)) {
        throw new Error(`duplicate Source v2 operation '${operation.name}'`);
      }
      this.operations.set(operation.name, operation);
    }
  }

  get pendingRequestCount(): number {
    return this.active.size;
  }

  get pendingNotificationCount(): number {
    return this.activeNotifications.size;
  }

  private get pendingWorkCount(): number {
    return this.active.size + this.activeNotifications.size;
  }

  async handleFrame(input: string | Uint8Array): Promise<string | null> {
    const frame = decodeSourceV2Frame(input);
    if (frame.kind === "notification") {
      await this.handleNotification(frame);
      return null;
    }
    if (frame.kind !== "request") {
      throw new SourceV2CodecError("invalid_frame", "Source v2 server accepts requests and notifications only");
    }
    return await this.handleRequest(frame);
  }

  private async handleNotification(frame: SourceV2NotificationFrame): Promise<void> {
    if (frame.method === "notifications/cancelled") {
      const { requestId, reason } = cancellation(frame);
      this.active.get(requestId)?.controller.abort(new SourceV2CancellationError(reason));
      return;
    }
    if (this.closing) throw new SourceV2CancellationError("Source v2 server is closing");
    if (this.pendingWorkCount >= this.maxConcurrentRequests) {
      throw new SourceV2BackpressureError(this.maxConcurrentRequests);
    }
    const notificationId = this.nextNotificationId;
    this.nextNotificationId += 1;
    const controller = new AbortController();
    let settleActive: (() => void) | undefined;
    const settled = new Promise<void>((resolve) => {
      settleActive = resolve;
    });
    this.activeNotifications.set(notificationId, { controller, settled });
    try {
      await this.config.onClientNotification?.(frame, {
        instanceId: this.config.instanceId,
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (!controller.signal.aborted) throw error;
    } finally {
      this.activeNotifications.delete(notificationId);
      settleActive?.();
    }
  }

  private async handleRequest(frame: SourceV2RequestFrame): Promise<string> {
    if (this.closing) return errorFrame(frame.id, -32004, "Source v2 server is closing");
    if (this.active.has(frame.id)) {
      return errorFrame(frame.id, -32600, `duplicate active request id '${String(frame.id)}'`);
    }
    const operation = this.operations.get(frame.method);
    if (operation === undefined) {
      return errorFrame(frame.id, -32601, `unknown operation '${frame.method}'`);
    }
    if (this.pendingWorkCount >= this.maxConcurrentRequests) {
      return errorFrame(
        frame.id,
        SOURCE_V2_BACKPRESSURE_CODE,
        `Source v2 server concurrency limit ${String(this.maxConcurrentRequests)} reached`,
        { kind: "backpressure", limit: this.maxConcurrentRequests },
      );
    }

    let invoke: (context: SourceV2OperationContext) => Promise<unknown>;
    try {
      invoke = operation.prepare(Object.hasOwn(frame, "params") ? frame.params : {});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return errorFrame(frame.id, -32602, `invalid params for '${frame.method}': ${message}`);
    }

    const controller = new AbortController();
    let settleActive: (() => void) | undefined;
    const settled = new Promise<void>((resolve) => {
      settleActive = resolve;
    });
    this.active.set(frame.id, { controller, settled });
    try {
      const result = await invoke({
        instanceId: this.config.instanceId,
        signal: controller.signal,
        notify: (method: string, params?: unknown): void => {
          if (this.closing) throw new SourceV2CancellationError("Source v2 server is closing");
          const encoded = encodeSourceV2Frame({
            jsonrpc: "2.0",
            method,
            ...(params === undefined ? {} : { params }),
          });
          if (this.config.onNotification === undefined) {
            throw new Error("Source v2 notification writer is not configured");
          }
          this.config.onNotification(encoded);
        },
      });
      return encodeSourceV2Frame({ jsonrpc: "2.0", id: frame.id, result });
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason as unknown;
        const message = reason instanceof Error ? reason.message : String(reason);
        return errorFrame(frame.id, SOURCE_V2_CANCELLED_CODE, message, { kind: "cancelled" });
      }
      if (error instanceof SourceV2ResultValidationError) {
        const cause = error.cause;
        const message = cause instanceof Error ? cause.message : String(cause);
        return errorFrame(frame.id, -32603, `${error.message}: ${message}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      return errorFrame(frame.id, -32000, message, { kind: "operation" });
    } finally {
      this.active.delete(frame.id);
      settleActive?.();
    }
  }

  async close(): Promise<void> {
    if (this.closeResult !== undefined) {
      await this.closeResult;
      return;
    }
    this.closing = true;
    const activeRequests = [...this.active.entries()];
    const activeNotifications = [...this.activeNotifications.entries()];
    for (const [, request] of activeRequests) {
      request.controller.abort(new SourceV2CancellationError("Source v2 server closed"));
    }
    for (const [, notification] of activeNotifications) {
      notification.controller.abort(new SourceV2CancellationError("Source v2 server closed"));
    }
    if (activeRequests.length === 0 && activeNotifications.length === 0) return;
    this.closeResult = new Promise<void>((resolve, reject) => {
      let complete = false;
      const cancelDeadline = this.deadlineScheduler.schedule(this.closeTimeoutMs, () => {
        if (complete) return;
        complete = true;
        const activeRequestIds = activeRequests
          .map(([id]) => id)
          .filter((id) => this.active.has(id));
        const activeNotificationIds = activeNotifications
          .map(([id]) => id)
          .filter((id) => this.activeNotifications.has(id));
        if (activeRequestIds.length === 0 && activeNotificationIds.length === 0) {
          resolve();
          return;
        }
        reject(
          new SourceV2CloseError(
            activeRequestIds,
            activeNotificationIds,
            this.closeTimeoutMs,
          ),
        );
      });
      void Promise.all([
        ...activeRequests.map(([, { settled }]) => settled),
        ...activeNotifications.map(([, { settled }]) => settled),
      ]).then(() => {
        if (complete) return;
        complete = true;
        cancelDeadline();
        resolve();
      });
    });
    await this.closeResult;
  }
}

export type SourceV2ServerInput = NodeJS.ReadableStream &
  AsyncIterable<unknown> & { destroy(error?: Error): void };

export interface SourceV2ServerIo {
  readonly input?: SourceV2ServerInput;
  readonly write?: (frame: string) => void;
}

function isBlankFrame(value: Uint8Array): boolean {
  return value.every((byte) => byte === 9 || byte === 10 || byte === 13 || byte === 32);
}

export async function* boundedSourceV2Lines(
  input: AsyncIterable<unknown>,
): AsyncGenerator<Uint8Array> {
  let buffered = Buffer.alloc(0);
  for await (const raw of input) {
    const chunk =
      typeof raw === "string"
        ? Buffer.from(raw)
        : raw instanceof Uint8Array
          ? Buffer.from(raw)
          : undefined;
    if (chunk === undefined) {
      throw new SourceV2CodecError("invalid_frame", "Source v2 input yielded a non-byte chunk");
    }
    let offset = 0;
    let newline = chunk.indexOf(10, offset);
    while (newline >= 0) {
      const segment = chunk.subarray(offset, newline);
      if (buffered.byteLength + segment.byteLength > SOURCE_V2_MAX_FRAME_BYTES) {
        throw new SourceV2CodecError(
          "frame_too_large",
          `Source v2 frame exceeds ${String(SOURCE_V2_MAX_FRAME_BYTES)} bytes before newline`,
        );
      }
      const frame = buffered.byteLength === 0 ? segment : Buffer.concat([buffered, segment]);
      if (!isBlankFrame(frame)) yield frame;
      buffered = Buffer.alloc(0);
      offset = newline + 1;
      newline = chunk.indexOf(10, offset);
    }
    const remainder = chunk.subarray(offset);
    if (buffered.byteLength + remainder.byteLength > SOURCE_V2_MAX_FRAME_BYTES) {
      throw new SourceV2CodecError(
        "frame_too_large",
        `Source v2 frame exceeds ${String(SOURCE_V2_MAX_FRAME_BYTES)} bytes before newline`,
      );
    }
    if (remainder.byteLength > 0) buffered = Buffer.concat([buffered, remainder]);
  }
  if (buffered.byteLength > 0 && !isBlankFrame(buffered)) yield buffered;
}

/** Run one concurrent newline-delimited v2 server until stdin closes. */
export async function runSourceV2Server(
  config: SourceV2ServerConfig,
  io: SourceV2ServerIo = {},
): Promise<void> {
  const write =
    io.write ??
    ((frame: string): void => {
      process.stdout.write(`${frame}\n`);
    });
  const server = new SourceV2Server({ ...config, onNotification: write });
  const input = io.input ?? process.stdin;
  const running = new Set<Promise<void>>();
  let fatal: unknown;
  let signalTaskFailure: ((error: Error) => void) | undefined;
  const taskFailure = new Promise<{ readonly taskError: Error }>((resolve) => {
    signalTaskFailure = (taskError: Error): void => {
      resolve({ taskError });
    };
  });
  const lines = boundedSourceV2Lines(input)[Symbol.asyncIterator]();
  let pendingRead: ReturnType<typeof lines.next> | undefined;
  try {
    let reachedEof = false;
    while (!reachedEof) {
      pendingRead = lines.next();
      const nextOrFailure = await Promise.race([pendingRead, taskFailure]);
      if ("taskError" in nextOrFailure) throw nextOrFailure.taskError;
      const next = nextOrFailure;
      pendingRead = undefined;
      if (next.done) {
        reachedEof = true;
        continue;
      }
      const frame = next.value;
      // Decode synchronously before the next read. A complete malformed frame
      // must terminate this server even while the input stream stays open.
      decodeSourceV2Frame(frame);
      const task = server
        .handleFrame(frame)
        .then((reply) => {
          if (reply !== null) write(reply);
        })
        .catch((error: unknown) => {
          fatal ??= error;
          signalTaskFailure?.(
            error instanceof Error ? error : new Error("Source v2 server task failed"),
          );
        })
        .finally(() => {
          running.delete(task);
        });
      running.add(task);
    }
  } catch (error: unknown) {
    fatal ??= error;
  } finally {
    if (fatal !== undefined) {
      const failure = fatal instanceof Error
        ? fatal
        : new Error("Source v2 server failed with a non-Error reason");
      input.destroy(failure);
      if (pendingRead !== undefined) {
        await pendingRead.catch(() => undefined);
      }
      await lines.return(undefined).catch(() => undefined);
    }
  }
  await server.close();
  await Promise.all(running);
  if (fatal instanceof Error) throw fatal;
  if (fatal !== undefined) throw new Error("Source v2 server failed with a non-Error reason");
}
