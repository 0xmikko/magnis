// Contacts surface: Google People API client + canonical conversion —
// twin of plugins/sources/google/src/contacts.rs.
//
// Each contacts envelope's `payload` is a full Contact serialization and
// `remote_id` is `gpeople:{stable_hash}` (dedup survives display-name change).

import { createHash } from "node:crypto";
import type { Envelope } from "@magnis/connector-sdk";
import {
  ContactsCursorExpiredError,
  checkRateLimit,
  fetchWithRetry,
  type FetchLike,
} from "./http";
import { mergeProgress, progressCursor } from "./progress";
import type { WindowFetchResult } from "./calendar";
import { contactRemoteId } from "./schema";
import {
  asObject,
  defaultObject,
  defaultObjectArray,
  defaultBool,
  optBool,
  optString,
  reqString,
} from "./validate";

// ── Raw Google People API shapes (camelCase, as served) ───────

interface GpeopleMetadata {
  primary?: boolean | null;
}

interface GpeopleName {
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  metadata?: GpeopleMetadata | null;
}

interface GpeopleEmail {
  value?: string | null;
  type?: string | null;
  metadata?: GpeopleMetadata | null;
}

interface GpeoplePhone {
  value?: string | null;
  canonicalForm?: string | null;
  type?: string | null;
  metadata?: GpeopleMetadata | null;
}

export interface GpeoplePerson {
  /** Always present — looks like "people/c12345…". */
  resourceName: string;
  names?: GpeopleName[] | null;
  emailAddresses?: GpeopleEmail[] | null;
  phoneNumbers?: GpeoplePhone[] | null;
  organizations?: { name?: string | null; title?: string | null; current?: boolean | null }[] | null;
  photos?: { url?: string | null; metadata?: GpeopleMetadata | null }[] | null;
  urls?: { value?: string | null; type?: string | null }[] | null;
}

interface GpeopleConnectionsResponse {
  connections?: GpeoplePerson[] | null;
  nextPageToken?: string | null;
}

// ── Response parser (serde parity — see validate.ts) ──────────

/** `GpeopleMetadata` (contacts.rs:103) — `#[serde(default)]` on the field, and
 * `primary` is itself `#[serde(default)] bool` (absent → false). */
function parseMetadata(
  o: Record<string, unknown>,
  ctx: string,
): GpeopleMetadata {
  const m = defaultObject(o, "metadata", ctx);
  return { primary: defaultBool(m, "primary", `${ctx}.metadata`) };
}

/** `GpeopleConnectionsResponse` (contacts.rs:21) — `connections` is
 * `#[serde(default)] Vec<_>`; each `GpeoplePerson.resource_name`
 * (contacts.rs:31) is required and every sub-list is `#[serde(default)]`. */
function parseGpeopleConnectionsResponse(
  v: unknown,
): GpeopleConnectionsResponse {
  const ctx = "GpeopleConnectionsResponse";
  const o = asObject(v, ctx);
  const connections = defaultObjectArray(o, "connections", ctx).map((p, i) => {
    const c = `${ctx}.connections[${String(i)}]`;
    return {
      resourceName: reqString(p, "resourceName", c),
      names: defaultObjectArray(p, "names", c).map((n, j) => ({
        displayName: optString(n, "displayName", `${c}.names[${String(j)}]`),
        givenName: optString(n, "givenName", `${c}.names[${String(j)}]`),
        familyName: optString(n, "familyName", `${c}.names[${String(j)}]`),
        metadata: parseMetadata(n, `${c}.names[${String(j)}]`),
      })),
      emailAddresses: defaultObjectArray(p, "emailAddresses", c).map((e, j) => ({
        value: optString(e, "value", `${c}.emailAddresses[${String(j)}]`),
        type: optString(e, "type", `${c}.emailAddresses[${String(j)}]`),
        metadata: parseMetadata(e, `${c}.emailAddresses[${String(j)}]`),
      })),
      phoneNumbers: defaultObjectArray(p, "phoneNumbers", c).map((ph, j) => ({
        value: optString(ph, "value", `${c}.phoneNumbers[${String(j)}]`),
        canonicalForm: optString(ph, "canonicalForm", `${c}.phoneNumbers[${String(j)}]`),
        type: optString(ph, "type", `${c}.phoneNumbers[${String(j)}]`),
        metadata: parseMetadata(ph, `${c}.phoneNumbers[${String(j)}]`),
      })),
      organizations: defaultObjectArray(p, "organizations", c).map((g, j) => ({
        name: optString(g, "name", `${c}.organizations[${String(j)}]`),
        title: optString(g, "title", `${c}.organizations[${String(j)}]`),
        current: optBool(g, "current", `${c}.organizations[${String(j)}]`),
      })),
      photos: defaultObjectArray(p, "photos", c).map((ph, j) => ({
        url: optString(ph, "url", `${c}.photos[${String(j)}]`),
        metadata: parseMetadata(ph, `${c}.photos[${String(j)}]`),
      })),
      urls: defaultObjectArray(p, "urls", c).map((u, j) => ({
        value: optString(u, "value", `${c}.urls[${String(j)}]`),
        type: optString(u, "type", `${c}.urls[${String(j)}]`),
      })),
    };
  });
  return {
    connections,
    nextPageToken: optString(o, "nextPageToken", ctx),
  };
}

// ── Canonical Contact shape ───────────────────────────────────

export interface Contact {
  id: string;
  display_name: string | null;
  given_name: string | null;
  family_name: string | null;
  emails: { address: string; label: string | null; is_primary: boolean }[];
  phones: { number: string; label: string | null; is_primary: boolean }[];
  organizations: { name: string | null; title: string | null; is_current: boolean }[];
  photo_url: string | null;
  external_url: string | null;
}

// ── GpeoplePerson → Contact conversion ────────────────────────

function pickPrimary<T extends { metadata?: GpeopleMetadata | null }>(
  items: T[],
): T | undefined {
  return items.find((x) => x.metadata?.primary === true) ?? items[0];
}

/** SHA-256 of the `people/{id}` resource name, hex, first 16 chars — stable
 * across fetches and short enough for a graph external-link key. */
export function stableContactId(resourceName: string): string {
  return createHash("sha256").update(resourceName, "utf-8").digest("hex").slice(0, 16);
}

/** Convert a People API Person into a canonical Contact. Returns null when the
 * person has no useful identity (no name, no email, no phone) —
 * INV-CONTACTS-2. */
export function gpeoplePersonToContact(p: GpeoplePerson): Contact | null {
  const primaryName = pickPrimary(p.names ?? []);
  const displayName =
    primaryName?.displayName ??
    ((): string | null => {
      const g = primaryName?.givenName ?? null;
      const f = primaryName?.familyName ?? null;
      if (g !== null && f !== null) return `${g} ${f}`;
      return g ?? f ?? null;
    })();

  const emails = (p.emailAddresses ?? []).flatMap((e) =>
    e.value !== null && e.value !== undefined
      ? [
          {
            address: e.value,
            label: e.type ?? null,
            is_primary: e.metadata?.primary === true,
          },
        ]
      : [],
  );

  const phones = (p.phoneNumbers ?? []).flatMap((ph) => {
    const number = ph.canonicalForm ?? ph.value ?? null;
    return number !== null
      ? [
          {
            number,
            label: ph.type ?? null,
            is_primary: ph.metadata?.primary === true,
          },
        ]
      : [];
  });

  // INV-CONTACTS-2 filter: at least ONE of {name, email, phone}.
  if (displayName === null && emails.length === 0 && phones.length === 0) {
    return null;
  }

  const organizations = (p.organizations ?? []).map((o) => ({
    name: o.name ?? null,
    title: o.title ?? null,
    is_current: o.current ?? false,
  }));

  const photoUrl = pickPrimary(p.photos ?? [])?.url ?? null;

  const profileUrl = (p.urls ?? []).find(
    (u) => u.type?.toLowerCase() === "profile",
  );
  const externalUrl = profileUrl !== undefined ? (profileUrl.value ?? null) : null;

  return {
    id: stableContactId(p.resourceName),
    display_name: displayName,
    given_name: primaryName?.givenName ?? null,
    family_name: primaryName?.familyName ?? null,
    emails,
    phones,
    organizations,
    photo_url: photoUrl,
    external_url: externalUrl,
  };
}

// ── REST client + fetch logic ─────────────────────────────────

/** True ONLY for a Google JSON error body whose `error.status` is exactly
 * `"FAILED_PRECONDITION"`. Anything else — a non-JSON body, a different
 * status, a shape we don't recognise — returns false, so the caller raises the
 * ordinary hard error. Deliberately narrow and failing-closed: a false
 * positive here would silently wipe a cursor. */
function isFailedPrecondition(body: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== "object") return false;
  const err = (parsed as Record<string, unknown>).error;
  if (err === null || typeof err !== "object") return false;
  return (err as Record<string, unknown>).status === "FAILED_PRECONDITION";
}

async function listConnectionsPage(
  token: string,
  pageToken: string | undefined,
  fetchFn: FetchLike,
): Promise<GpeopleConnectionsResponse> {
  const params = new URLSearchParams({
    personFields: "names,emailAddresses,phoneNumbers,organizations,photos,urls",
    pageSize: "100",
  });
  if (pageToken !== undefined) params.set("pageToken", pageToken);
  const url = `https://people.googleapis.com/v1/people/me/connections?${params}`;

  const resp = await fetchWithRetry(fetchFn, url, {
    headers: { authorization: `Bearer ${token}` },
  });
  checkRateLimit(resp);
  if (!resp.ok) {
    const body = await resp.text();
    // A pageToken we SENT was rejected as a failed precondition → the token is
    // no longer valid (they are ephemeral, and this one sat idle overnight).
    // Gated on `pageToken !== undefined` on purpose: the same 400 on a first
    // page means an identity/auth fault, and re-bootstrapping it would refetch
    // page 1, fail identically, and loop forever. `personFields`/`pageSize` are
    // hardcoded literals above, so the API's other documented
    // FAILED_PRECONDITION-with-a-token cause — "all other request parameters
    // must match the first call" — is unreachable here.
    if (
      resp.status === 400 &&
      pageToken !== undefined &&
      isFailedPrecondition(body)
    ) {
      throw new ContactsCursorExpiredError();
    }
    throw new Error(
      `People API list_connections failed: HTTP ${String(resp.status)} — ${body}`,
    );
  }
  return parseGpeopleConnectionsResponse(await resp.json());
}

/** Bootstrap/catch-up contacts fetch. Cumulative `discovered` only;
 * `nextCursor` is null on the last page.
 *
 * NOTE: the People API DOES have a delta token — `requestSyncToken=true` on a
 * full sync returns a `nextSyncToken` (valid 7 days) that lists only changes.
 * This connector does not use it: it persists the ephemeral `pageToken` as its
 * cursor, so there is no incremental contacts sync and every completed run
 * re-lists all connections from scratch. Documented, not fixed here. */
export async function fetchContactsPage(
  token: string,
  cursor: unknown,
  fetchFn: FetchLike,
): Promise<WindowFetchResult> {
  const c =
    cursor !== null && typeof cursor === "object"
      ? (cursor as Record<string, unknown>)
      : undefined;
  const pageToken = typeof c?.page_token === "string" ? c.page_token : undefined;

  const page = await listConnectionsPage(token, pageToken, fetchFn);

  const envelopes: Envelope[] = [];
  for (const person of page.connections ?? []) {
    const contact = gpeoplePersonToContact(person);
    if (contact === null) continue; // INV-CONTACTS-2: no useful identity
    envelopes.push({
      surface: "contacts",
      payload: contact as unknown as Record<string, unknown>,
      remote_id: contactRemoteId(contact.id),
      kind: "snapshot",
    });
  }

  const progress = progressCursor(cursor, envelopes.length, undefined);

  let nextCursor: Record<string, unknown> | null = null;
  if (typeof page.nextPageToken === "string") {
    nextCursor = { page_token: page.nextPageToken };
    mergeProgress(nextCursor, progress);
  }

  return { envelopes, nextCursor, discovered: progress.discovered };
}
