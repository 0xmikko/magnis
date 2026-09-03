import type {
  ProviderOperation,
  SourceProtocolVersion,
} from "./contract/source";

export const SOURCE_V2_MAX_FRAME_BYTES = 4 * 1024 * 1024;
export const SOURCE_V2_CANCELLED_CODE = -32800;

export type SourceV2RequestId = string | number;

export interface SourceV2RequestFrame {
  readonly kind: "request";
  readonly jsonrpc: "2.0";
  readonly id: SourceV2RequestId;
  readonly method: string;
  readonly params?: unknown;
}

export interface SourceV2NotificationFrame {
  readonly kind: "notification";
  readonly jsonrpc: "2.0";
  readonly method: string;
  readonly params?: unknown;
}

export interface SourceV2SuccessFrame {
  readonly kind: "success";
  readonly jsonrpc: "2.0";
  readonly id: SourceV2RequestId;
  readonly result: unknown;
}

export interface SourceV2ErrorObject {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface SourceV2ErrorFrame {
  readonly kind: "error";
  readonly jsonrpc: "2.0";
  readonly id: SourceV2RequestId;
  readonly error: SourceV2ErrorObject;
}

export type SourceV2Frame =
  | SourceV2RequestFrame
  | SourceV2NotificationFrame
  | SourceV2SuccessFrame
  | SourceV2ErrorFrame;

export type SourceV2CodecErrorKind =
  | "frame_too_large"
  | "malformed_json"
  | "invalid_frame"
  | "invalid_result"
  | "unsupported_protocol";

export class SourceV2CodecError extends Error {
  constructor(
    readonly kind: SourceV2CodecErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SourceV2CodecError";
  }
}

export class SourceV2RemoteError extends Error {
  constructor(readonly remote: SourceV2ErrorObject) {
    super(remote.message);
    this.name = "SourceV2RemoteError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function protocolLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return typeof value;
}

const stringifyUnknown: (value: unknown) => string | undefined = JSON.stringify;

function ownKeysAre(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new SourceV2CodecError("invalid_frame", `unknown frame member '${key}'`);
    }
  }
}

function decodeRequestId(value: unknown, label: string): SourceV2RequestId {
  if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
    return value;
  }
  throw new SourceV2CodecError("invalid_frame", `${label} must be a finite number or string`);
}

function frameText(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input;
  if (bytes.byteLength > SOURCE_V2_MAX_FRAME_BYTES) {
    throw new SourceV2CodecError(
      "frame_too_large",
      `Source v2 frame exceeds ${String(SOURCE_V2_MAX_FRAME_BYTES)} bytes`,
    );
  }
  return typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input);
}

/** Exact protocol selection. No alias and no failed-v2-to-v1 fallback exists. */
export function decodeSourceProtocol(value: unknown): SourceProtocolVersion {
  if (value === "magnis.source/1" || value === "magnis.source/2") return value;
  if (value === undefined || value === null) {
    throw new SourceV2CodecError("unsupported_protocol", "missing Source protocol");
  }
  throw new SourceV2CodecError(
    "unsupported_protocol",
    `unsupported Source protocol '${protocolLabel(value)}'`,
  );
}

/** Strictly decode one newline-delimited v2 frame. */
export function decodeSourceV2Frame(input: string | Uint8Array): SourceV2Frame {
  const text = frameText(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new SourceV2CodecError("malformed_json", "Source v2 frame is not valid JSON", {
      cause: error,
    });
  }
  if (!isRecord(parsed)) {
    throw new SourceV2CodecError("invalid_frame", "Source v2 frame must be an object");
  }
  if (parsed.jsonrpc !== "2.0") {
    throw new SourceV2CodecError("invalid_frame", "Source v2 frame requires jsonrpc '2.0'");
  }

  if (Object.hasOwn(parsed, "method")) {
    ownKeysAre(parsed, ["jsonrpc", "id", "method", "params"]);
    if (typeof parsed.method !== "string" || parsed.method.length === 0) {
      throw new SourceV2CodecError("invalid_frame", "Source v2 method must be a non-empty string");
    }
    if (!Object.hasOwn(parsed, "id")) {
      return {
        kind: "notification",
        jsonrpc: "2.0",
        method: parsed.method,
        ...(Object.hasOwn(parsed, "params") ? { params: parsed.params } : {}),
      };
    }
    return {
      kind: "request",
      jsonrpc: "2.0",
      id: decodeRequestId(parsed.id, "Source v2 request id"),
      method: parsed.method,
      ...(Object.hasOwn(parsed, "params") ? { params: parsed.params } : {}),
    };
  }

  const hasResult = Object.hasOwn(parsed, "result");
  const hasError = Object.hasOwn(parsed, "error");
  if (hasResult === hasError) {
    throw new SourceV2CodecError(
      "invalid_frame",
      "Source v2 response must contain exactly one of result or error",
    );
  }
  const id = decodeRequestId(parsed.id, "Source v2 response id");
  if (hasResult) {
    ownKeysAre(parsed, ["jsonrpc", "id", "result"]);
    return { kind: "success", jsonrpc: "2.0", id, result: parsed.result };
  }

  ownKeysAre(parsed, ["jsonrpc", "id", "error"]);
  if (!isRecord(parsed.error)) {
    throw new SourceV2CodecError("invalid_frame", "Source v2 error must be an object");
  }
  ownKeysAre(parsed.error, ["code", "message", "data"]);
  if (!Number.isInteger(parsed.error.code) || typeof parsed.error.message !== "string") {
    throw new SourceV2CodecError(
      "invalid_frame",
      "Source v2 error requires an integer code and string message",
    );
  }
  return {
    kind: "error",
    jsonrpc: "2.0",
    id,
    error: {
      code: parsed.error.code as number,
      message: parsed.error.message,
      ...(Object.hasOwn(parsed.error, "data") ? { data: parsed.error.data } : {}),
    },
  };
}

/** Encode only a frame that the strict decoder would admit. */
export function encodeSourceV2Frame(value: unknown): string {
  const serialized = typeof value === "string" ? value : stringifyUnknown(value);
  if (serialized === undefined) {
    throw new SourceV2CodecError("invalid_frame", "Source v2 frame is not JSON serializable");
  }
  decodeSourceV2Frame(serialized);
  return serialized;
}

/** Decode one exact typed operation reply; raw JSON is never returned. */
export function decodeSourceV2Result<T>(
  input: string | Uint8Array,
  expectedId: SourceV2RequestId,
  operation: ProviderOperation<T>,
): T {
  const frame = decodeSourceV2Frame(input);
  if (frame.kind !== "success" && frame.kind !== "error") {
    throw new SourceV2CodecError("invalid_frame", "Source v2 operation reply must be a response");
  }
  if (frame.id !== expectedId) {
    throw new SourceV2CodecError(
      "invalid_frame",
      `Source v2 reply id '${String(frame.id)}' does not match '${String(expectedId)}'`,
    );
  }
  if (frame.kind === "error") throw new SourceV2RemoteError(frame.error);
  try {
    return operation.outputSchema.parse(frame.result);
  } catch (error: unknown) {
    throw new SourceV2CodecError(
      "invalid_result",
      `invalid result for '${operation.name}'`,
      { cause: error },
    );
  }
}
