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

// plugins/sources/anysite/src/api.ts
var ANYSITE_BASE = "https://api.anysite.io";
var DEFAULT_RETRY_AFTER_SECS = 60;
function retryAfterSecs(headers) {
  const raw = headers?.get("retry-after");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETRY_AFTER_SECS;
}

class AnysiteError extends Error {
  status;
  detail;
  constructor(status, detail) {
    super(`anysite ${String(status)}: ${detail}`);
    this.status = status;
    this.detail = detail;
    this.name = "AnysiteError";
  }
}
function firstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string")
      return v;
  }
  return "";
}
function extractUrn(u) {
  if (typeof u === "string")
    return u;
  if (u && typeof u === "object" && "value" in u) {
    return firstString(u.value);
  }
  return "";
}
function totalReactions(reactions) {
  if (reactions === null || reactions === undefined)
    return null;
  if (!Array.isArray(reactions))
    return Number(reactions) || 0;
  return reactions.reduce((sum, r) => sum + (Number(r?.count ?? 0) || 0), 0);
}
function countOrNull(v) {
  if (v === null || v === undefined)
    return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function postImages(p, repost) {
  const own = Array.isArray(p.images) ? p.images : undefined;
  const nested = repost && Array.isArray(repost.images) ? repost.images : undefined;
  return (own ?? nested ?? []).filter((x) => typeof x === "string");
}
function postText(p) {
  const own = firstString(p.text, p.commentary, p.content).trim();
  if (own)
    return own;
  const repost = p.repost && typeof p.repost === "object" ? p.repost : undefined;
  if (repost)
    return firstString(repost.text, repost.commentary, repost.content).trim();
  return "";
}
function toKolPost(p) {
  const repost = p.repost && typeof p.repost === "object" ? p.repost : undefined;
  return {
    urn: extractUrn(p.urn),
    url: firstString(p.share_url, p.url, repost?.url),
    text: postText(p),
    createdAt: p.created_at !== null && p.created_at !== undefined ? Number(p.created_at) : null,
    reactions: totalReactions(p.reactions ?? p.reaction_count ?? repost?.reactions),
    comments: countOrNull(p.comment_count ?? p.comments ?? repost?.comment_count),
    shares: countOrNull(p.share_count ?? p.repost_count ?? repost?.share_count),
    images: postImages(p, repost),
    isRepost: Boolean(p.is_empty_repost) || repost !== undefined
  };
}

class AnysiteClient {
  apiKey;
  fetchFn;
  constructor(apiKey, fetchFn) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
  }
  async post(path, body) {
    const res = await this.fetchFn(`${ANYSITE_BASE}${path}`, {
      method: "POST",
      headers: { "access-token": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.status === 429) {
      throw new RateLimitError(retryAfterSecs(res.headers));
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if ((res.status === 402 || res.status === 401) && /points|limit|exhaust|credit|quota/i.test(detail)) {
        throw new RateLimitError(retryAfterSecs(res.headers));
      }
      throw new AnysiteError(res.status, detail.slice(0, 200));
    }
    return await res.json();
  }
  async resolveProfile(handleOrUrl) {
    const d = await this.post("/api/linkedin/user", { user: handleOrUrl });
    const p = Array.isArray(d) ? d[0] : d;
    if (!p)
      return null;
    return {
      name: firstString(p.name),
      urn: extractUrn(p.urn),
      headline: firstString(p.headline),
      followerCount: Number(p.follower_count ?? 0) || 0,
      url: firstString(p.url),
      avatarUrl: typeof p.image === "string" && p.image ? p.image : null
    };
  }
  async userPosts(profileUrn, count) {
    const d = await this.post("/api/linkedin/user/posts", { urn: profileUrn, count });
    const obj = d;
    const arr = Array.isArray(d) ? d : obj?.posts ?? obj?.data ?? obj?.elements ?? [];
    return arr.map(toKolPost);
  }
}

// plugins/sources/anysite/src/surfaces/linkedin/fetch.ts
var PLATFORM = "linkedin";
var RECENT_POSTS = 5;
function toIso(epoch) {
  if (epoch === null || !Number.isFinite(epoch))
    return null;
  const ms = epoch < 1000000000000 ? epoch * 1000 : epoch;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function profileEnvelope(handle, p) {
  return {
    surface: "linkedin",
    remote_id: `linkedin:profile:${p.urn || handle}`,
    kind: "snapshot",
    payload: {
      entity_type: "profile",
      platform: PLATFORM,
      handle,
      display_name: p.name,
      url: p.url || null,
      bio: p.headline || null,
      follower_count: p.followerCount || null,
      avatar_url: p.avatarUrl
    }
  };
}
function postEnvelope(handle, post) {
  return {
    surface: "linkedin",
    remote_id: `linkedin:post:${post.urn}`,
    kind: "live",
    payload: {
      entity_type: "post",
      platform: PLATFORM,
      post_id: post.urn,
      author_handle: handle,
      text: post.text,
      created_at: toIso(post.createdAt),
      url: post.url || null,
      is_repost: post.isRepost,
      ...post.images.length ? {
        media: post.images.map((u) => ({
          type: "photo",
          url: u,
          preview_image_url: null,
          alt_text: null
        }))
      } : {},
      metrics: {
        likes: post.reactions,
        replies: post.comments,
        reposts: post.shares
      }
    }
  };
}
async function fetchLinkedIn(args, fetchFn) {
  const key = typeof args.meta?.api_key === "string" ? args.meta.api_key : "";
  if (!key) {
    throw new Error("anysite: missing api_key (set SOURCE_ANYSITE_API_KEY)");
  }
  const handles = args.tracked_handles ?? [];
  const client = new AnysiteClient(key, fetchFn);
  const envelopes = [];
  for (const handle of handles) {
    const profile = await client.resolveProfile(handle);
    if (!profile)
      continue;
    envelopes.push(profileEnvelope(handle, profile));
    if (!profile.urn)
      continue;
    for (const post of await client.userPosts(profile.urn, RECENT_POSTS)) {
      envelopes.push(postEnvelope(handle, post));
    }
  }
  const cursor = typeof args.cursor === "number" ? args.cursor : 0;
  return { envelopes, nextCursor: cursor + 1, hasMore: false };
}

// plugins/sources/anysite/src/probe.ts
async function probeLinkedInAuth(meta, fetchFn) {
  const key = typeof meta?.api_key === "string" ? meta.api_key : "";
  if (!key)
    throw new Error("anysite: missing api_key");
  const client = new AnysiteClient(key, fetchFn);
  const profile = await client.resolveProfile("linkedin");
  if (!profile)
    throw new Error("anysite: probe resolved no profile \u2014 key rejected");
  return { subject: `anysite \u2026${key.slice(-4)}` };
}

// plugins/sources/anysite/src/connector.ts
function buildConnectorConfig(fetchFn = fetch) {
  return {
    name: "anysite",
    version: "0.1.0",
    surfaces: ["linkedin"],
    intervalSecs: 600,
    fetch: (args) => fetchLinkedIn(args, fetchFn),
    probeAuth: (meta) => probeLinkedInAuth(meta, fetchFn)
  };
}

// plugins/sources/anysite/src/main.ts
await runConnector(buildConnectorConfig());
