// @bun
var __require = import.meta.require;

// packages/connector-sdk/index.ts
var RATE_LIMIT_CODE = -32002;
var CURSOR_EXPIRED_CODE = -32003;
var GENERIC_FETCH_ERROR_CODE = -32000;

class RateLimitError extends Error {
  retryAfterSecs;
  constructor(retryAfterSecs) {
    super(`rate limited; retry_after=${String(retryAfterSecs)}`);
    this.retryAfterSecs = retryAfterSecs;
    this.name = "RateLimitError";
  }
}

class CursorExpiredError extends Error {
  constructor(message) {
    super(message);
    this.name = "CursorExpiredError";
  }
}

class ConnectorError extends Error {
  data;
  code;
  constructor(message, data, code = GENERIC_FETCH_ERROR_CODE) {
    super(message);
    this.data = data;
    this.code = code;
    this.name = "ConnectorError";
  }
}
function errorReply(id, e) {
  if (e instanceof ConnectorError) {
    return { jsonrpc: "2.0", id, error: { code: e.code, message: e.message, data: e.data } };
  }
  if (e instanceof RateLimitError) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: RATE_LIMIT_CODE,
        message: e.message,
        data: { retry_after: e.retryAfterSecs }
      }
    };
  }
  if (e instanceof CursorExpiredError) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: CURSOR_EXPIRED_CODE, message: e.message }
    };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { jsonrpc: "2.0", id, error: { code: GENERIC_FETCH_ERROR_CODE, message } };
}
var liveSubscriptions = new Set;
function extractMeta(args) {
  return args._meta && typeof args._meta === "object" ? args._meta : undefined;
}
function makeEmitter(config, subscriptionId) {
  const write = config.onNotification ?? ((line) => {
    process.stdout.write(line + `
`);
  });
  return (envelope) => {
    if (!liveSubscriptions.has(subscriptionId))
      return;
    write(JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/magnis/envelope",
      params: {
        subscription_id: subscriptionId,
        surface: envelope.surface,
        remote_id: envelope.remote_id,
        kind: envelope.kind,
        payload: envelope.payload
      }
    }));
  };
}
function capabilities(config) {
  return {
    tools: {},
    experimental: {
      magnis: {
        sync: {
          surfaces: config.surfaces,
          mode: config.mode ?? "poll",
          interval_secs: config.intervalSecs ?? 300
        }
      }
    }
  };
}
async function handleMessage(msg, config) {
  const id = msg.id;
  const method = msg.method ?? "";
  if (id === undefined || id === null)
    return null;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: capabilities(config),
        serverInfo: { name: config.name, version: config.version }
      }
    };
  }
  if (method === "tools/call") {
    const name = msg.params?.name ?? "";
    if (name === "magnis.auth.probe" && config.probeAuth) {
      const args2 = msg.params?.arguments ?? {};
      const meta2 = args2._meta && typeof args2._meta === "object" ? args2._meta : undefined;
      try {
        const result = await config.probeAuth(meta2);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          jsonrpc: "2.0",
          id,
          error: { code: GENERIC_FETCH_ERROR_CODE, message, data: { kind: "auth", message } }
        };
      }
    }
    const rawArgs = msg.params?.arguments ?? {};
    const metaArg = extractMeta(rawArgs);
    if (name === "listen_start" && config.listenStart) {
      const subscriptionId = typeof rawArgs.subscription_id === "string" && rawArgs.subscription_id ? rawArgs.subscription_id : "sub:legacy";
      liveSubscriptions.add(subscriptionId);
      try {
        await config.listenStart({ subscription_id: subscriptionId, meta: metaArg }, makeEmitter(config, subscriptionId));
        return { jsonrpc: "2.0", id, result: { ok: true, subscription_id: subscriptionId } };
      } catch (e) {
        liveSubscriptions.delete(subscriptionId);
        const message = e instanceof Error ? e.message : String(e);
        return { jsonrpc: "2.0", id, error: { code: GENERIC_FETCH_ERROR_CODE, message } };
      }
    }
    if (name === "listen_stop" && config.listenStop) {
      const subscriptionId = typeof rawArgs.subscription_id === "string" ? rawArgs.subscription_id : "sub:legacy";
      liveSubscriptions.delete(subscriptionId);
      try {
        await config.listenStop({ subscription_id: subscriptionId });
        return { jsonrpc: "2.0", id, result: { ok: true } };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { jsonrpc: "2.0", id, error: { code: GENERIC_FETCH_ERROR_CODE, message } };
      }
    }
    if (name === "magnis.sync.listen" && config.listenStart) {
      const account = metaArg && typeof metaArg.account_id === "string" ? metaArg.account_id : undefined;
      const subscriptionId = account ? `sub:${account}` : "sub:legacy";
      liveSubscriptions.add(subscriptionId);
      try {
        await config.listenStart({ subscription_id: subscriptionId, meta: metaArg }, makeEmitter(config, subscriptionId));
        return { jsonrpc: "2.0", id, result: { ok: true, subscription_id: subscriptionId } };
      } catch (e) {
        liveSubscriptions.delete(subscriptionId);
        const message = e instanceof Error ? e.message : String(e);
        return { jsonrpc: "2.0", id, error: { code: GENERIC_FETCH_ERROR_CODE, message } };
      }
    }
    if (name.startsWith("magnis.auth.") && name !== "magnis.auth.probe") {
      const op = name.slice("magnis.auth.".length);
      const handler = config.auth?.[op];
      if (!handler) {
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown tool ${name}` } };
      }
      try {
        const result = await handler(rawArgs, metaArg);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          jsonrpc: "2.0",
          id,
          error: { code: GENERIC_FETCH_ERROR_CODE, message, data: { kind: "auth", message } }
        };
      }
    }
    if (name === "magnis.execute") {
      const action = typeof rawArgs.action === "string" ? rawArgs.action : "";
      const handler = config.execute?.[action];
      if (!handler) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `unknown execute action '${action}'` }
        };
      }
      try {
        const result = await handler(rawArgs, metaArg);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        return errorReply(id, e);
      }
    }
    if (name !== "magnis.sync.fetch") {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `unknown tool ${name}` }
      };
    }
    const args = rawArgs;
    const surface = typeof args.surface === "string" ? args.surface : config.surfaces[0] ?? "";
    const cursor = args.cursor;
    const direction = args.direction === "forward" || args.direction === "backward" ? args.direction : undefined;
    const tracked = Array.isArray(args.tracked_handles) ? args.tracked_handles.filter((h) => typeof h === "string") : undefined;
    const limit = typeof args.limit === "number" ? args.limit : undefined;
    const meta = metaArg;
    try {
      const result = await config.fetch({
        surface,
        cursor,
        direction,
        tracked_handles: tracked,
        limit,
        meta,
        raw: args
      });
      return { jsonrpc: "2.0", id, result };
    } catch (e) {
      return errorReply(id, e);
    }
  }
  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "magnis.sync.fetch",
            description: "Fetch a page of canonical envelopes for a surface.",
            inputSchema: {
              type: "object",
              properties: {
                surface: { type: "string" },
                cursor: { type: "integer" },
                tracked_handles: { type: "array", items: { type: "string" } },
                limit: { type: "integer" }
              },
              required: ["surface"]
            }
          }
        ]
      }
    };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method ${method}` } };
}
async function runConnector(config) {
  const { createInterface } = await import("readline");
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed)
      continue;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const reply = await handleMessage(msg, config);
    if (reply)
      process.stdout.write(JSON.stringify(reply) + `
`);
  }
}

// plugins/sources/x/src/api.ts
var X_API_BASE = "https://api.x.com";
var DEFAULT_RETRY_AFTER_SECS = 60;
function retryAfterSecs(headers) {
  const raw = headers?.get("retry-after");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETRY_AFTER_SECS;
}

class XApiError extends Error {
  status;
  detail;
  constructor(status, detail) {
    super(`X API ${String(status)}: ${detail}`);
    this.status = status;
    this.detail = detail;
    this.name = "XApiError";
  }
}
var USER_FIELDS = "name,username,profile_image_url,description,verified,public_metrics";
var TWEET_FIELDS = "created_at,public_metrics,text,lang,referenced_tweets,conversation_id,note_tweet,article,entities,attachments";
var TWEET_EXPANSIONS = "attachments.media_keys";
var MEDIA_FIELDS = "media_key,type,url,preview_image_url,alt_text";

class XClient {
  bearer;
  fetchFn;
  constructor(bearer, fetchFn) {
    this.bearer = bearer;
    this.fetchFn = fetchFn;
  }
  async getBody(path) {
    const res = await this.fetchFn(`${X_API_BASE}${path}`, {
      method: "GET",
      headers: { authorization: `Bearer ${this.bearer}` }
    });
    if (res.status === 429) {
      throw new RateLimitError(retryAfterSecs(res.headers));
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 402 || /credit|quota|points|exhaust/i.test(body.detail ?? "")) {
        throw new RateLimitError(retryAfterSecs(res.headers));
      }
      throw new XApiError(res.status, body.detail ?? "request failed");
    }
    return body;
  }
  async get(path) {
    return (await this.getBody(path)).data;
  }
  async userByUsername(handle) {
    try {
      return await this.get(`/2/users/by/username/${encodeURIComponent(handle)}?user.fields=${USER_FIELDS}`) ?? null;
    } catch (e) {
      if (e instanceof XApiError && e.status === 404)
        return null;
      throw e;
    }
  }
  async recentTweets(userId, max) {
    const body = await this.getBody(`/2/users/${encodeURIComponent(userId)}/tweets?max_results=${String(max)}` + `&tweet.fields=${TWEET_FIELDS}&expansions=${TWEET_EXPANSIONS}&media.fields=${MEDIA_FIELDS}`);
    return {
      tweets: Array.isArray(body.data) ? body.data : [],
      media: body.includes?.media ?? []
    };
  }
}

// plugins/sources/x/src/schema.ts
var PLATFORM = "x";
var SURFACE_X = "x";
var SURFACE_CONTACTS = "contacts";

// plugins/sources/x/src/surfaces/contacts/schema.ts
var socialContactRemoteId = (handle) => `x:social:${handle.toLowerCase()}`;

// plugins/sources/x/src/surfaces/contacts/fetch.ts
var PAGE_SIZE = 1000;
var HARD_MAX = 5000;
var USER_FIELDS2 = "name,username,profile_image_url,description,public_metrics";
function socialContactEnvelope(user) {
  return {
    surface: SURFACE_CONTACTS,
    remote_id: socialContactRemoteId(user.username),
    kind: "snapshot",
    payload: {
      kind: "social_contact",
      handle: user.username,
      display_name: user.name,
      profile_url: `https://x.com/${user.username}`
    }
  };
}
async function fetchXContacts(args, fetchFn) {
  const bearer = typeof args.meta?.bearer_token === "string" ? args.meta.bearer_token : "";
  const cursor = args.cursor ?? {};
  const spec = cursor.import;
  const handle = typeof spec?.handle === "string" ? spec.handle : "";
  if (!handle) {
    return { envelopes: [], nextCursor: null, hasMore: false };
  }
  if (!bearer)
    throw new Error("x: missing bearer_token (set SOURCE_X_BEARER_TOKEN)");
  const limit = Math.min(Math.max(spec?.limit ?? PAGE_SIZE, 1), HARD_MAX);
  const already = cursor.fetched ?? 0;
  const client = new XClient(bearer, fetchFn);
  let ownerId = cursor.owner_id;
  if (!ownerId) {
    const owner = await client.userByUsername(handle);
    if (!owner)
      throw new Error(`handle_not_found: no X account @${handle}`);
    ownerId = owner.id;
  }
  const pageSize = Math.max(Math.min(PAGE_SIZE, limit - already), 1);
  const url = `${X_API_BASE}/2/users/${encodeURIComponent(ownerId)}/following` + `?max_results=${String(pageSize)}&user.fields=${USER_FIELDS2}` + (cursor.token ? `&pagination_token=${encodeURIComponent(cursor.token)}` : "");
  const res = await fetchFn(url, {
    method: "GET",
    headers: { authorization: `Bearer ${bearer}` }
  });
  if (res.status === 429)
    throw new RateLimitError(30);
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new XApiError(res.status, "following page failed");
  const envelopes = (body.data ?? []).slice(0, limit - already).map(socialContactEnvelope);
  const fetched = already + envelopes.length;
  const nextToken = body.meta?.next_token;
  const hasMore = !!nextToken && fetched < limit;
  return {
    envelopes,
    nextCursor: hasMore ? { import: spec, owner_id: ownerId, token: nextToken, fetched } : null,
    hasMore
  };
}

// plugins/sources/x/src/surfaces/x/helpers.ts
function fullText(tweet) {
  return tweet.article?.plain_text ?? tweet.note_tweet?.text ?? tweet.text;
}
function postType(tweet, isReply) {
  if (tweet.article?.plain_text || tweet.article?.title)
    return "article";
  if (tweet.note_tweet?.text)
    return "long_form";
  if (isReply)
    return "reply";
  return "post";
}

// plugins/sources/x/src/surfaces/x/schema.ts
var profileRemoteId = (userId) => `x:profile:${userId}`;
var postRemoteId = (tweetId) => `x:post:${tweetId}`;

// plugins/sources/x/src/surfaces/x/fetch.ts
var RECENT_TWEETS = 10;
function profileEnvelope(user) {
  return {
    surface: SURFACE_X,
    remote_id: profileRemoteId(user.id),
    kind: "snapshot",
    payload: {
      entity_type: "profile",
      platform: PLATFORM,
      handle: user.username,
      display_name: user.name,
      url: `https://x.com/${user.username}`,
      avatar_url: user.profile_image_url ?? null,
      bio: user.description ?? null,
      verified: user.verified ?? null,
      follower_count: user.public_metrics?.followers_count ?? null
    }
  };
}
function postEnvelope(user, tweet, mediaByKey) {
  const refs = tweet.referenced_tweets ?? [];
  const m = tweet.public_metrics ?? {};
  const isReply = refs.some((r) => r.type === "replied_to");
  const media = (tweet.attachments?.media_keys ?? []).map((k) => mediaByKey.get(k)).filter((x) => !!x).map((x) => ({
    type: x.type ?? null,
    url: x.url ?? null,
    preview_image_url: x.preview_image_url ?? null,
    alt_text: x.alt_text ?? null
  }));
  const urls = (tweet.entities?.urls ?? []).map((u) => ({
    url: u.url ?? null,
    expanded_url: u.expanded_url ?? null,
    display_url: u.display_url ?? null
  }));
  return {
    surface: SURFACE_X,
    remote_id: postRemoteId(tweet.id),
    kind: "live",
    payload: {
      entity_type: "post",
      platform: PLATFORM,
      post_id: tweet.id,
      author_handle: user.username,
      text: fullText(tweet),
      post_type: postType(tweet, isReply),
      created_at: tweet.created_at ?? null,
      url: `https://x.com/${user.username}/status/${tweet.id}`,
      lang: tweet.lang ?? null,
      is_reply: isReply,
      is_repost: refs.some((r) => r.type === "retweeted"),
      ...tweet.article?.title ? { article_title: tweet.article.title } : {},
      ...tweet.conversation_id ? { conversation_id: tweet.conversation_id } : {},
      ...media.length ? { media } : {},
      ...urls.length ? { urls } : {},
      metrics: {
        likes: m.like_count ?? null,
        reposts: m.retweet_count ?? null,
        replies: m.reply_count ?? null,
        impressions: m.impression_count ?? null
      }
    }
  };
}
async function fetchX(args, fetchFn) {
  const bearer = typeof args.meta?.bearer_token === "string" ? args.meta.bearer_token : "";
  if (!bearer) {
    throw new Error("x: missing bearer_token (set SOURCE_X_BEARER_TOKEN)");
  }
  const handles = args.tracked_handles ?? [];
  const client = new XClient(bearer, fetchFn);
  const envelopes = [];
  for (const handle of handles) {
    const user = await client.userByUsername(handle);
    if (!user)
      continue;
    envelopes.push(profileEnvelope(user));
    const page = await client.recentTweets(user.id, RECENT_TWEETS);
    const mediaByKey = new Map(page.media.map((x) => [x.media_key, x]));
    for (const tweet of page.tweets) {
      envelopes.push(postEnvelope(user, tweet, mediaByKey));
    }
  }
  const cursor = typeof args.cursor === "number" ? args.cursor : 0;
  return { envelopes, nextCursor: cursor + 1, hasMore: false };
}

// plugins/sources/x/src/probe.ts
async function probeXAuth(meta, fetchFn) {
  const bearer = typeof meta?.bearer_token === "string" ? meta.bearer_token : "";
  if (!bearer)
    throw new Error("x: missing bearer_token");
  const headers = { authorization: `Bearer ${bearer}` };
  const me = await fetchFn("https://api.x.com/2/users/me", { method: "GET", headers });
  if (me.ok) {
    const body2 = await me.json();
    const username = body2.data?.username;
    if (!username)
      throw new Error("x: probe returned no username");
    return { subject: `@${username}` };
  }
  if (me.status !== 403) {
    throw new Error(`x: provider rejected the key (HTTP ${String(me.status)})`);
  }
  const probe = await fetchFn("https://api.x.com/2/users/by/username/x", {
    method: "GET",
    headers
  });
  if (!probe.ok) {
    throw new Error(`x: provider rejected the key (HTTP ${String(probe.status)})`);
  }
  const body = await probe.json();
  if (!body.data?.id)
    throw new Error("x: probe lookup returned no data");
  return { subject: `x app \u2026${bearer.slice(-4)}` };
}

// plugins/sources/x/src/connector.ts
function buildConnectorConfig(fetchFn = fetch) {
  return {
    name: "x",
    version: "0.1.0",
    surfaces: [SURFACE_X, SURFACE_CONTACTS],
    intervalSecs: 300,
    fetch: (args) => args.surface === SURFACE_CONTACTS ? fetchXContacts(args, fetchFn) : fetchX(args, fetchFn),
    probeAuth: (meta) => probeXAuth(meta, fetchFn)
  };
}

// plugins/sources/x/src/main.ts
await runConnector(buildConnectorConfig());
