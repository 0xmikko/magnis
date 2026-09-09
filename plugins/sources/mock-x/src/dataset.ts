// Dataset actions: how a dataset feeds X profiles and posts into Magnis through
// this connector, the way mock-gmail and mock-telegram feed mail and chats. The
// payloads are the same shapes `fetch.ts` emits — entity_type "profile"/"post" —
// so the x module ingests dataset records exactly as it ingests the live feed.
import { ConnectorError, type DatasetActionHandler, type Envelope } from "@magnis/connector-sdk";

type Json = Record<string, unknown>;

function requiredString(action: string, payload: Json, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ConnectorError(`invalid ${action} payload: ${key}`, { kind: "contract", field: key });
  }
  return value;
}

function optionalString(payload: Json, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

export const emitProfile: DatasetActionHandler = (args) => Promise.resolve().then(() => {
  const payload = args.payload;
  const handle = requiredString("emit_profile", payload, "handle");
  const displayName = optionalString(payload, "display_name");
  const bio = optionalString(payload, "bio");
  const envelope: Envelope = {
    surface: "x",
    remote_id: `dataset:${args.invocation_id}:0`,
    kind: "live",
    payload: {
      entity_type: "profile",
      platform: "x",
      handle,
      ...(displayName !== undefined ? { display_name: displayName } : {}),
      url: `https://x.com/${handle}`,
      ...(bio !== undefined ? { bio } : {}),
      ...(typeof payload.follower_count === "number" ? { follower_count: payload.follower_count } : {}),
    },
  };
  return { envelopes: [envelope] };
});

export const emitPost: DatasetActionHandler = (args) => Promise.resolve().then(() => {
  const payload = args.payload;
  const postId = requiredString("emit_post", payload, "post_id");
  const handle = requiredString("emit_post", payload, "handle");
  const text = requiredString("emit_post", payload, "text");
  const postedAt = requiredString("emit_post", payload, "posted_at");
  if (Number.isNaN(Date.parse(postedAt))) {
    throw new ConnectorError("invalid emit_post payload: posted_at", { kind: "contract", field: "posted_at" });
  }
  const conversationId = optionalString(payload, "conversation_id");
  const envelope: Envelope = {
    surface: "x",
    remote_id: `dataset:${args.invocation_id}:0`,
    kind: "live",
    payload: {
      entity_type: "post",
      platform: "x",
      post_id: postId,
      author_handle: handle,
      text,
      created_at: postedAt,
      url: `https://x.com/${handle}/status/${postId}`,
      post_type: optionalString(payload, "post_type") ?? "post",
      ...(conversationId !== undefined ? { conversation_id: conversationId } : {}),
    },
  };
  return { envelopes: [envelope] };
});
