import { readFileSync } from "node:fs";

import type { FetchLike, XMedia, XTweet, XUser } from "./api";

interface XFixture {
  readonly probeUser: XUser;
  readonly users: readonly XUser[];
  readonly tweetsByUserId: Readonly<Record<string, readonly XTweet[]>>;
  readonly mediaByUserId: Readonly<Record<string, readonly XMedia[]>>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`x fixture ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`x fixture ${label} must be a non-empty string`);
  }
  return value;
}

function user(value: unknown, label: string): XUser {
  const input = record(value, label);
  return {
    ...input,
    id: nonEmptyString(input.id, `${label}.id`),
    username: nonEmptyString(input.username, `${label}.username`),
    name: nonEmptyString(input.name, `${label}.name`),
  };
}

function tweet(value: unknown, label: string): XTweet {
  const input = record(value, label);
  return {
    ...input,
    id: nonEmptyString(input.id, `${label}.id`),
    text: nonEmptyString(input.text, `${label}.text`),
  };
}

function media(value: unknown, label: string): XMedia {
  const input = record(value, label);
  return {
    ...input,
    media_key: nonEmptyString(input.media_key, `${label}.media_key`),
  };
}

function objectOfArrays<T>(
  value: unknown,
  label: string,
  decode: (entry: unknown, entryLabel: string) => T,
): Readonly<Record<string, readonly T[]>> {
  const input = record(value, label);
  return Object.fromEntries(
    Object.entries(input).map(([key, entries]) => {
      if (!Array.isArray(entries)) throw new Error(`x fixture ${label}.${key} must be an array`);
      return [key, entries.map((entry, index) => decode(entry, `${label}.${key}[${String(index)}]`))];
    }),
  );
}

/** Decode the explicitly selected captured provider payload. Missing or
 * malformed fixture bytes are certification failures, never live-network
 * fallbacks.
 *
 * @tested-by: tst_x_cert_001
 * @invariant: exact-artifact certification is hermetic and exercises the same
 * XClient conversion path as production responses.
 */
function loadFixture(): XFixture {
  const path = process.env.X_FIXTURE_FILE;
  if (path === undefined || path.length === 0) throw new Error("X_FIXTURE_FILE is not set");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error: unknown) {
    throw new Error(`x fixture '${path}' cannot be decoded`, { cause: error });
  }
  const input = record(parsed, "root");
  if (!Array.isArray(input.users)) throw new Error("x fixture users must be an array");
  return {
    probeUser: user(input.probe_user, "probe_user"),
    users: input.users.map((entry, index) => user(entry, `users[${String(index)}]`)),
    tweetsByUserId: objectOfArrays(input.tweets_by_user_id, "tweets_by_user_id", tweet),
    mediaByUserId: input.media_by_user_id === undefined
      ? {}
      : objectOfArrays(input.media_by_user_id, "media_by_user_id", media),
  };
}

function response(
  status: number,
  body: unknown,
): Awaited<ReturnType<FetchLike>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  };
}

/** Captured X v2 transport used only when X_FIXTURE_FILE is explicitly set. */
export function fixtureFetch(
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
): ReturnType<FetchLike> {
  if (init?.headers?.authorization?.startsWith("Bearer ") !== true) {
    return Promise.resolve(response(401, { detail: "missing bearer" }));
  }
  const fixture = loadFixture();
  const request = new URL(url);
  if (request.pathname === "/2/users/me") {
    return Promise.resolve(response(200, { data: fixture.probeUser }));
  }

  const usernameMatch = /^\/2\/users\/by\/username\/([^/]+)$/.exec(request.pathname);
  if (usernameMatch !== null) {
    const encoded = usernameMatch[1];
    if (encoded === undefined) throw new Error("x fixture username route is malformed");
    const username = decodeURIComponent(encoded);
    const match = fixture.users.find((candidate) => candidate.username === username);
    return Promise.resolve(match === undefined
      ? response(404, { detail: "not found" })
      : response(200, { data: match }));
  }

  const tweetsMatch = /^\/2\/users\/([^/]+)\/tweets$/.exec(request.pathname);
  if (tweetsMatch !== null) {
    const encoded = tweetsMatch[1];
    if (encoded === undefined) throw new Error("x fixture tweets route is malformed");
    const userId = decodeURIComponent(encoded);
    return Promise.resolve(response(200, {
      data: fixture.tweetsByUserId[userId] ?? [],
      includes: { media: fixture.mediaByUserId[userId] ?? [] },
    }));
  }

  return Promise.reject(new Error(`x fixture has no captured route for ${request.pathname}`));
}
