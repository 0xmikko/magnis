// ConnectorConfig assembly — the TS twin of the Rust connector's
// main.rs dispatch (fetch / execute / auth.exchange / auth.revoke), wired
// through @magnis/connector-sdk. Kept separate from main.ts so tests can
// exercise the exact handlers the host talks to.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  ConnectorConfig,
  FetchArgs,
  FetchResult,
} from "@magnis/connector-sdk";
import { credsFromMeta, refreshAccessToken } from "./auth";
import { fetchEventsPage, type EventsWindow } from "./calendar";
import { fetchContactsPage } from "./contacts";
import { fixtureExecuteResult, fixtureFetchResult, fixturePath } from "./fixture";
import {
  downloadAttachment,
  fetchHistoryChanges,
  fetchMessagePage,
  parseMailDraft,
  sendMessage,
} from "./gmail";
import type { FetchLike } from "./http";
import { exchange, revoke } from "./oauth";

type ExecuteHandler = (
  args: Record<string, unknown>,
  meta: Record<string, unknown> | undefined,
) => Promise<Record<string, unknown>>;

/** Build the connector config. `fetchFn` is injectable for tests; production
 * uses the global fetch. */
export function buildConnectorConfig(
  fetchFn: FetchLike = fetch,
): ConnectorConfig {
  /** Mint an access token from the per-call `_meta` credentials (no caching —
   * every fetch/execute call refreshes, matching the Rust connector). */
  const accessToken = (meta: Record<string, unknown> | undefined) =>
    refreshAccessToken(credsFromMeta(meta), fetchFn);

  // ── magnis.sync.fetch ───────────────────────────────────────
  const fetchHandler = async (args: FetchArgs): Promise<FetchResult> => {
    const surface = args.surface;

    // Fixture mode short-circuits BEFORE creds/HTTP (isolated e2e).
    if (fixturePath() !== undefined) return fixtureFetchResult(surface);

    const direction = args.direction ?? "backward";
    const cursor = args.cursor;
    const token = await accessToken(args.meta);

    switch (surface) {
      case "email": {
        const r =
          direction === "forward"
            ? await fetchHistoryChanges(token, cursor, fetchFn)
            : await fetchMessagePage(token, cursor, fetchFn);
        return {
          envelopes: r.envelopes,
          nextCursor: r.nextCursor,
          hasMore: r.hasMore,
          total: r.total,
          discovered: r.discovered,
        };
      }
      case "meetings": {
        // Calendar is window-based: Bootstrap and CatchUp page the same time
        // window. The Rust twin passes the full action payload down and reads
        // optional `time_min`/`time_max` off it (calendar.rs:125-135), falling
        // back to now-30d..now+90d when absent OR not a string — mirrored here
        // via the SDK's verbatim `raw` args.
        const str = (k: string): string | undefined =>
          typeof args.raw?.[k] === "string"
            ? (args.raw[k])
            : undefined;
        const window: EventsWindow = {
          time_min: str("time_min"),
          time_max: str("time_max"),
        };
        const r = await fetchEventsPage(token, cursor, window, fetchFn);
        // No cheap total estimate → indeterminate "N synced…" (DEC-5).
        return {
          envelopes: r.envelopes,
          nextCursor: r.nextCursor,
          hasMore: r.nextCursor !== null,
          discovered: r.discovered,
        };
      }
      case "contacts": {
        // People API has no delta token — every page is a snapshot;
        // direction is ignored (Bootstrap and CatchUp page identically).
        const r = await fetchContactsPage(token, cursor, fetchFn);
        return {
          envelopes: r.envelopes,
          nextCursor: r.nextCursor,
          hasMore: r.nextCursor !== null,
          discovered: r.discovered,
        };
      }
      default:
        throw new Error(`unknown surface '${surface}'`);
    }
  };

  // ── magnis.execute ──────────────────────────────────────────
  const sendMessageHandler: ExecuteHandler = async (args, meta) => {
    if (fixturePath() !== undefined) {
      return fixtureExecuteResult("send_message", args);
    }
    const token = await accessToken(meta);
    const draft = parseMailDraft(args.draft);
    return sendMessage(token, draft, fetchFn);
  };

  const downloadFileHandler: ExecuteHandler = async (args, meta) => {
    if (fixturePath() !== undefined) {
      return fixtureExecuteResult("download_file", args);
    }
    const token = await accessToken(meta);
    const sourceRef = args.source_ref as Record<string, unknown> | undefined;
    if (sourceRef === undefined || sourceRef === null) {
      throw new Error("download_file: missing source_ref");
    }
    const dest = args.dest;
    if (typeof dest !== "string") throw new Error("download_file: missing dest");
    const messageId = sourceRef.message_id;
    if (typeof messageId !== "string") {
      throw new Error("download_file: missing message_id in source_ref");
    }
    const attachmentId = sourceRef.attachment_id;
    if (typeof attachmentId !== "string") {
      throw new Error("download_file: missing attachment_id in source_ref");
    }

    const bytes = await downloadAttachment(token, messageId, attachmentId, fetchFn);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
    return { local_path: dest, size_bytes: bytes.length };
  };

  const executeHandlers: Record<string, ExecuteHandler> = {
    send_message: sendMessageHandler,
    download_file: downloadFileHandler,
  };

  // Proxy so an UNKNOWN action still reaches a handler: fixture mode echoes it
  // ({ recorded, action }); live mode errors with the Rust message.
  const execute = new Proxy(executeHandlers, {
    get(target, prop): ExecuteHandler | undefined {
      if (typeof prop !== "string") return undefined;
      const known = target[prop];
      if (known !== undefined) return known;
      return async (args) => {
        if (fixturePath() !== undefined) return fixtureExecuteResult(prop, args);
        throw new Error(`Unknown gmail execute action: ${prop}`);
      };
    },
  });

  return {
    name: "magnis-google",
    version: "1.0.0",
    surfaces: ["email", "meetings", "contacts"],
    mode: "poll",
    intervalSecs: 30,
    fetch: fetchHandler,
    // Host-owned OAuth ceremony: the connector implements ONLY exchange +
    // revoke (begin/step/probe stay unimplemented → SDK answers -32601).
    auth: {
      exchange: (_args, meta) => exchange(meta, fetchFn),
      revoke: (_args, meta) => revoke(meta, fetchFn),
    },
    execute,
  };
}
