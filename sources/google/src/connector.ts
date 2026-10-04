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
import { fetchEventsPage } from "./surfaces/meetings/calendar";
import { fetchContactsPage } from "./surfaces/addressbook/contacts";
import { fixtureExecuteResult, fixtureFetchResult, fixturePath } from "./fixture";
import {
  downloadAttachment,
  fetchHistoryChanges,
  fetchImapMessagePage,
  fetchMessagePage,
  getGmailEmailAddress,
  parseMailDraft,
  sendMessage,
} from "./surfaces/email/gmail";
import { downloadImapAttachment, openGoogleImapMailbox, type OpenImapMailbox } from "./surfaces/email/imap";
import type { FetchLike } from "./http";
import { exchange, revoke } from "./oauth";
import { SURFACES } from "./schema";

type ExecuteHandler = (
  args: Record<string, unknown>,
  meta: Record<string, unknown> | undefined,
) => Promise<Record<string, unknown>>;

function emailSelection(value: unknown): NonNullable<FetchArgs["senderSync"]> {
  if (typeof value !== "object" || value === null || !("unknownSenderEnabled" in value) || typeof value.unknownSenderEnabled !== "boolean"
    || !("choices" in value) || typeof value.choices !== "object" || value.choices === null || Array.isArray(value.choices)) throw new Error("Gmail requires explicit senderSync choices and unknownSenderEnabled");
  const choices: Record<string, boolean> = {};
  for (const [address, enabled] of Object.entries(value.choices)) {
    if (typeof enabled !== "boolean" || address !== address.trim().toLowerCase() || !/^[^\s<>@]+@[^\s<>@]+$/.test(address)) throw new Error("Gmail senderSync requires exact normalized addresses and boolean choices");
    choices[address] = enabled;
  }
  return { choices, unknownSenderEnabled: value.unknownSenderEnabled };
}

/** Build the connector config. `fetchFn` is injectable for tests; production
 * uses the global fetch. */
export function buildConnectorConfig(
  fetchFn: FetchLike = fetch,
  openImapMailbox: OpenImapMailbox = openGoogleImapMailbox,
): ConnectorConfig {
  /** Reuse the token owned by auth.ts for each `_meta` credential tuple. */
  const accessToken = (meta: Record<string, unknown> | undefined): Promise<string> =>
    refreshAccessToken(credsFromMeta(meta), fetchFn);

  // ── magnis.sync.fetch ───────────────────────────────────────
  const fetchHandler = async (args: FetchArgs): Promise<FetchResult> => {
    const surface = args.surface;
    const senderSync = surface === "email" ? emailSelection(args.senderSync) : undefined;
    let recoverySender: string | undefined;
    if (surface === "email" && args.target?.kind === "trackedIdentities") {
      recoverySender = args.target.identities[0];
      if (args.target.identities.length !== 1 || recoverySender === undefined
        || senderSync?.choices[recoverySender] !== true) throw new Error("Gmail recovery requires one enabled exact normalized sender");
    }

    // Fixture mode short-circuits BEFORE creds/HTTP (isolated e2e).
    if (fixturePath() !== undefined) {
      const result = fixtureFetchResult(surface);
      if (senderSync === undefined) return result;
      return { ...result, envelopes: result.envelopes.flatMap((envelope) => {
        if (envelope.payload.entity_type === "mailbox" || envelope.kind === "delete") return [envelope];
        const raw = envelope.payload.from_address;
        if (typeof raw !== "string") throw new Error("Gmail fixture message has no From address");
        const address = raw.trim().toLowerCase();
        const known = Object.hasOwn(senderSync.choices, address);
        const enabled = known ? senderSync.choices[address] : senderSync.unknownSenderEnabled;
        return enabled ? [envelope] : known ? [] : [{ ...envelope, kind: "snapshot" as const,
          payload: { entity_type: "sender", from_address: address, from_name: envelope.payload.from_name } }];
      }) };
    }

    const direction = args.direction ?? "backward";
    const cursor = args.cursor;
    const token = await accessToken(args.meta);

    switch (surface) {
      case "email": {
        if (senderSync === undefined) throw new Error("Gmail requires senderSync");
        if (recoverySender !== undefined) {
          const r = await fetchMessagePage(token, cursor, fetchFn, senderSync, recoverySender);
          return { ...r, progress: r.hasMore
            ? { kind: "continueTarget", continuationToken: r.nextCursor }
            : { kind: "completeTarget", forwardCheckpoint: { kind: "retain" } } };
        }
        const oldRestPage = cursor !== null && typeof cursor === "object" &&
          typeof (cursor as Record<string, unknown>).page_token === "string";
        const r =
          direction === "forward"
            ? await fetchHistoryChanges(token, cursor, fetchFn, senderSync)
            : oldRestPage
              ? await fetchMessagePage(token, cursor, fetchFn, senderSync)
              : await fetchImapMessagePage(token, cursor, fetchFn, openImapMailbox, senderSync);
        return { envelopes: r.envelopes, nextCursor: r.nextCursor, hasMore: r.hasMore };
      }
      case "meetings": {
        const r = await fetchEventsPage(token, cursor, fetchFn);
        return { envelopes: r.envelopes, nextCursor: r.nextCursor, hasMore: r.hasMore };
      }
      case "addressbook": {
        const r = await fetchContactsPage(token, cursor, fetchFn);
        return { envelopes: r.envelopes, nextCursor: r.nextCursor, hasMore: r.hasMore };
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
    if (sourceRef === undefined) {
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

    const bytes = attachmentId.startsWith("imap:")
      ? await downloadImapAttachment(await getGmailEmailAddress(token, fetchFn), token, messageId, attachmentId, openImapMailbox)
      : await downloadAttachment(token, messageId, attachmentId, fetchFn);
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
      return (args): Promise<Record<string, unknown>> => {
        if (fixturePath() !== undefined) return Promise.resolve(fixtureExecuteResult(prop, args));
        return Promise.reject(new Error(`Unknown gmail execute action: ${prop}`));
      };
    },
  });

  return {
    name: "magnis-google",
    version: "2.0.0",
    surfaces: SURFACES,
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
