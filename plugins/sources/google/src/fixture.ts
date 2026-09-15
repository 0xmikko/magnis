// Fixture / replay mode — twin of plugins/sources/google/src/fixture.rs.
//
// When GOOGLE_FIXTURE_FILE is set, `magnis.sync.fetch` is served from that
// JSON file (NO network, NO OAuth) through the SAME conversion path as live
// mode, so fixture-mode envelopes are byte-identical to real-mode ones.
// `magnis.execute` records/echoes the action (no live send/download).
//
// File format (single JSON object; missing arrays are empty):
//   { "messages":    [ <raw Gmail users.messages.get format=full> ... ],
//     "events":      [ <raw Calendar events.list item> ... ],
//     "connections": [ <raw People connections.list item> ... ] }

import { readFileSync } from "node:fs";
import type { Envelope, FetchResult } from "@magnis/connector-sdk";
import {
  flattenMailPayload,
  gmailMessageToMailMessage,
  type GmailMessage,
} from "./surfaces/email/gmail";
import {
  gcalEventToCalendarEvent,
  type GcalEvent,
} from "./surfaces/meetings/calendar";
import {
  gpeoplePersonToContact,
  type GpeoplePerson,
} from "./surfaces/contacts/contacts";
import { calendarRemoteId } from "./surfaces/meetings/schema";
import { contactRemoteId } from "./surfaces/contacts/schema";

/** Path of the active fixture file, or undefined for live mode. */
export function fixturePath(): string | undefined {
  return process.env.GOOGLE_FIXTURE_FILE;
}

interface Fixture {
  messages: unknown[];
  events: unknown[];
  connections: unknown[];
}

const EMPTY: Fixture = { messages: [], events: [], connections: [] };

function load(): Fixture {
  const path = fixturePath();
  if (path === undefined) return EMPTY;
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    throw new Error(
      `magnis-google: cannot read GOOGLE_FIXTURE_FILE ${path}: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `magnis-google: malformed GOOGLE_FIXTURE_FILE ${path}: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(`magnis-google: GOOGLE_FIXTURE_FILE ${path} must contain one object`);
  }
  const d = doc as Record<string, unknown>;
  // @tested-by: tst_gts_fx_001
  // @invariant: certification fixtures never coerce malformed provider data
  // into a successful empty page.
  const optionalArray = (key: keyof Fixture): unknown[] => {
    const value = d[key];
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      throw new Error(`magnis-google: GOOGLE_FIXTURE_FILE ${path} field '${key}' must be an array`);
    }
    return value;
  };
  return {
    messages: optionalArray("messages"),
    events: optionalArray("events"),
    connections: optionalArray("connections"),
  };
}

/** One raw Gmail message → canonical flattened email envelope (same code path
 * as live mode). Malformed entries are skipped (logged). */
function messageToEnvelope(raw: unknown): Envelope | null {
  try {
    const msg = raw as GmailMessage;
    const mail = gmailMessageToMailMessage(msg);
    const payload = { ...mail } as unknown as Record<string, unknown>;
    flattenMailPayload(payload);
    return { surface: "email", payload, remote_id: msg.id, kind: "snapshot" };
  } catch (e) {
    console.error(`magnis-google: fixture message convert failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** One raw Gcal event → canonical meeting envelope; cancelled is dropped. */
function eventToEnvelope(raw: unknown): Envelope | null {
  const ev = raw as GcalEvent;
  if (ev.status === "cancelled") return null;
  try {
    const cal = gcalEventToCalendarEvent(ev);
    return {
      surface: "meetings",
      payload: cal as unknown as Record<string, unknown>,
      remote_id: calendarRemoteId(ev.id),
      kind: "snapshot",
    };
  } catch (e) {
    console.error(`magnis-google: fixture event convert failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** One raw People connection → canonical contact envelope; identity-less
 * entries are dropped, matching live tolerance. */
function connectionToEnvelope(raw: unknown): Envelope | null {
  try {
    const contact = gpeoplePersonToContact(raw as GpeoplePerson);
    if (contact === null) return null;
    return {
      surface: "contacts",
      payload: contact as unknown as Record<string, unknown>,
      remote_id: contactRemoteId(contact.id),
      kind: "snapshot",
    };
  } catch (e) {
    console.error(`magnis-google: fixture connection convert failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Build the `magnis.sync.fetch` result for `surface` from the fixture file:
 * every item in file order, one page, end-of-stream (no total/discovered). */
export function fixtureFetchResult(surface: string): FetchResult {
  const fx = load();
  let envelopes: Envelope[];
  switch (surface) {
    case "email":
      envelopes = fx.messages
        .map(messageToEnvelope)
        .filter((e): e is Envelope => e !== null);
      break;
    case "meetings":
      envelopes = fx.events
        .map(eventToEnvelope)
        .filter((e): e is Envelope => e !== null);
      break;
    case "contacts":
      envelopes = fx.connections
        .map(connectionToEnvelope)
        .filter((e): e is Envelope => e !== null);
      break;
    default:
      // @tested-by: tst_gts_fx_001
      // @invariant: fixture mode has the same closed surface set as live mode.
      throw new Error(`unknown fixture surface '${surface}'`);
  }
  return { envelopes, nextCursor: null, hasMore: false };
}

/** Fixture-mode `magnis.execute`: no live send/download — echo the action back
 * so a caller can assert the connector accepted and routed it. */
export function fixtureExecuteResult(
  action: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  switch (action) {
    case "send_message":
      return {
        message_id: `fixture-${crypto.randomUUID()}`,
        thread_id: null,
        recorded: true,
        action: "send_message",
      };
    case "download_file":
      return {
        local_path: args.dest ?? null,
        size_bytes: 0,
        recorded: true,
        action: "download_file",
      };
    default:
      return { recorded: true, action };
  }
}
