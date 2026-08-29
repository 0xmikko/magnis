import { readFileSync } from "node:fs";

import type { FetchLike } from "./api";

type JsonRecord = Record<string, unknown>;

interface AnysiteFixture {
  readonly probeProfile: JsonRecord;
  readonly profilesByHandle: Readonly<Record<string, JsonRecord>>;
  readonly postsByProfileUrn: Readonly<Record<string, readonly JsonRecord[]>>;
}

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`anysite fixture ${label} must be an object`);
  }
  return value as JsonRecord;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`anysite fixture ${label} must be a non-empty string`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`anysite fixture ${label} must be a finite number`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return nonEmptyString(value, label);
}

function urn(value: unknown, label: string): string | { readonly type?: string; readonly value: string } {
  if (typeof value === "string") return nonEmptyString(value, label);
  const input = record(value, label);
  const type = input.type;
  if (type !== undefined && typeof type !== "string") {
    throw new Error(`anysite fixture ${label}.type must be a string when present`);
  }
  return {
    ...(type === undefined ? {} : { type }),
    value: nonEmptyString(input.value, `${label}.value`),
  };
}

function profile(value: unknown, label: string): JsonRecord {
  const input = record(value, label);
  return {
    name: nonEmptyString(input.name, `${label}.name`),
    urn: urn(input.urn, `${label}.urn`),
    headline: nonEmptyString(input.headline, `${label}.headline`),
    follower_count: finiteNumber(input.follower_count, `${label}.follower_count`),
    url: nonEmptyString(input.url, `${label}.url`),
    image: nullableString(input.image, `${label}.image`),
  };
}

function reactions(value: unknown, label: string): readonly JsonRecord[] {
  if (!Array.isArray(value)) throw new Error(`anysite fixture ${label} must be an array`);
  return value.map((entry, index) => {
    const input = record(entry, `${label}[${String(index)}]`);
    return {
      type: nonEmptyString(input.type, `${label}[${String(index)}].type`),
      count: finiteNumber(input.count, `${label}[${String(index)}].count`),
    };
  });
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`anysite fixture ${label} must be an array`);
  return value.map((entry, index) => nonEmptyString(entry, `${label}[${String(index)}]`));
}

function post(value: unknown, label: string): JsonRecord {
  const input = record(value, label);
  return {
    urn: urn(input.urn, `${label}.urn`),
    share_url: nonEmptyString(input.share_url, `${label}.share_url`),
    text: nonEmptyString(input.text, `${label}.text`),
    created_at: finiteNumber(input.created_at, `${label}.created_at`),
    reactions: reactions(input.reactions, `${label}.reactions`),
    comment_count: finiteNumber(input.comment_count, `${label}.comment_count`),
    share_count: finiteNumber(input.share_count, `${label}.share_count`),
    images: stringArray(input.images, `${label}.images`),
  };
}

function profileMap(value: unknown, label: string): Readonly<Record<string, JsonRecord>> {
  return Object.fromEntries(
    Object.entries(record(value, label)).map(([handle, entry]) => [
      nonEmptyString(handle, `${label} key`),
      profile(entry, `${label}.${handle}`),
    ]),
  );
}

function postMap(value: unknown, label: string): Readonly<Record<string, readonly JsonRecord[]>> {
  return Object.fromEntries(
    Object.entries(record(value, label)).map(([profileUrn, entries]) => {
      if (!Array.isArray(entries)) {
        throw new Error(`anysite fixture ${label}.${profileUrn} must be an array`);
      }
      return [
        nonEmptyString(profileUrn, `${label} key`),
        entries.map((entry, index) => post(entry, `${label}.${profileUrn}[${String(index)}]`)),
      ];
    }),
  );
}

/** Decode an explicitly selected captured Anysite response set. Missing or
 * malformed bytes are terminal certification failures; fixture mode never
 * reaches the live provider transport.
 *
 * @tested-by: tst_anysite_cert_001
 * @invariant: the dependency-closed artifact uses captured provider payloads
 * through the same AnysiteClient conversion path as production.
 */
function loadFixture(): AnysiteFixture {
  const path = process.env.ANYSITE_FIXTURE_FILE;
  if (path === undefined || path.length === 0) {
    throw new Error("ANYSITE_FIXTURE_FILE is not set");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error: unknown) {
    throw new Error(`anysite fixture '${path}' cannot be decoded`, { cause: error });
  }
  const input = record(parsed, "root");
  return {
    probeProfile: profile(input.probe_profile, "probe_profile"),
    profilesByHandle: profileMap(input.profiles_by_handle, "profiles_by_handle"),
    postsByProfileUrn: postMap(input.posts_by_profile_urn, "posts_by_profile_urn"),
  };
}

function response(status: number, body: unknown): Awaited<ReturnType<FetchLike>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  };
}

function requestBody(init: Parameters<FetchLike>[1]): JsonRecord {
  if (init?.method !== "POST") throw new Error("anysite fixture requires POST");
  if (typeof init.body !== "string") throw new Error("anysite fixture requires a JSON body");
  let parsed: unknown;
  try {
    parsed = JSON.parse(init.body) as unknown;
  } catch (error: unknown) {
    throw new Error("anysite fixture request body is malformed", { cause: error });
  }
  return record(parsed, "request body");
}

/** Captured Anysite transport, activated only by ANYSITE_FIXTURE_FILE. */
export function fixtureFetch(
  url: string,
  init?: Parameters<FetchLike>[1],
): ReturnType<FetchLike> {
  const key = init?.headers?.["access-token"];
  if (typeof key !== "string" || key.length === 0) {
    return Promise.resolve(response(401, { detail: "missing access-token" }));
  }
  const fixture = loadFixture();
  const request = new URL(url);
  const body = requestBody(init);

  if (request.pathname === "/api/linkedin/user") {
    const handle = nonEmptyString(body.user, "request body.user");
    if (handle === "linkedin") return Promise.resolve(response(200, fixture.probeProfile));
    const match = fixture.profilesByHandle[handle];
    if (match === undefined) return Promise.resolve(response(200, []));
    return Promise.resolve(response(200, match));
  }
  if (request.pathname === "/api/linkedin/user/posts") {
    const profileUrn = nonEmptyString(body.urn, "request body.urn");
    finiteNumber(body.count, "request body.count");
    const posts = fixture.postsByProfileUrn[profileUrn];
    if (posts === undefined) {
      return Promise.reject(
        new Error(`anysite fixture has no captured posts for profile '${profileUrn}'`),
      );
    }
    return Promise.resolve(response(200, {
      posts,
    }));
  }
  return Promise.reject(new Error(`anysite fixture has no captured route for ${request.pathname}`));
}
