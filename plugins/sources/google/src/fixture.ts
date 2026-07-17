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
} from "./gmail";
import { gcalEventToCalendarEvent, type GcalEvent } from "./calendar";
import { gpeoplePersonToContact, type GpeoplePerson } from "./contacts";

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
    console.error(`magnis-google: cannot read GOOGLE_FIXTURE_FILE ${path}: ${e}`);
    return EMPTY;
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    console.error(`magnis-google: malformed GOOGLE_FIXTURE_FILE ${path}: ${e}`);
    return EMPTY;
  }
  const d = (doc ?? {}) as Record<string, unknown>;
  return {
    messages: Array.isArray(d.messages) ? d.messages : [],
    events: Array.isArray(d.events) ? d.events : [],
    connections: Array.isArray(d.connections) ? d.connections : [],
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
    console.error(`magnis-google: fixture message convert failed: ${e}`);
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
      remote_id: `gcal:${ev.id}`,
      kind: "snapshot",
    };
  } catch (e) {
    console.error(`magnis-google: fixture event convert failed: ${e}`);
    return null;
  }
}

/** One raw People connection → canonical contact envelope; identity-less
 * entries are dropped (INV-CONTACTS-2), matching live tolerance. */
function connectionToEnvelope(raw: unknown): Envelope | null {
  try {
    const contact = gpeoplePersonToContact(raw as GpeoplePerson);
    if (contact === null) return null;
    return {
      surface: "contacts",
      payload: contact as unknown as Record<string, unknown>,
      remote_id: `gpeople:${contact.id}`,
      kind: "snapshot",
    };
  } catch (e) {
    console.error(`magnis-google: fixture connection convert failed: ${e}`);
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
      envelopes = [];
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
