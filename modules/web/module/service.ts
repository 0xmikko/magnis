// Web plugin — owns `web.link` and `web.page`. A link is one URL of one user;
// each distinct content that URL served is one page, which never changes; a
// `contents` period says which page the URL served when. Every read writes
// what it saw in one applyBatch, and the text lives in the host byte store.
// `sources/web` does the network: this module only commands it.
import { rpc, syncHandler, tool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import type {
  CanonicalEntity,
  EnsureHandlerResult,
  EnsureRequest,
  Entity,
  GraphBatchResult,
  GraphEntityDeclaration,
  GraphLinkDeclaration,
  GraphOwnerFragment,
  SyncHandlerParams,
  SyncReceipt,
} from "@magnis/sdk";

import type {
  ContentsMetadata,
  ContentsPeriod,
  WebLinkDetail,
  WebLinkEnsureItem,
  WebLinkGetParams,
  WebOpenParams,
  WebPageDetails,
  WebPageGetParams,
  WebPageRead,
  WebReadAnswer,
  WebSearchAnswer,
  WebSearchParams,
} from "../types.ts";
import { CONTENTS, LINK, PAGE, REFERENCES, SOURCE_ACCOUNT, SURFACE_WEB } from "../schema.ts";
import {
  contentsLink,
  isFresh,
  linkDeclaration,
  linkRef,
  nextOffsetOf,
  normalizeUrl,
  pageDeclaration,
  pageDetailsOf,
  pageKey,
  pageRef,
  periodOf,
  readAnswerOf,
  searchAnswerOf,
  WINDOW_BYTES,
  windowOf,
} from "./helpers.ts";

/** A version of a link: the page of the open period a fetch compares
 * against, or the page a fetch just recorded. */
interface Version {
  details: WebPageDetails;
  title: string | null;
  firstSeen: string;
  /** Null while this call's batch is the one that declares the page. */
  pageId: string | null;
  period: ContentsPeriod;
}

/** The link `open` reads: its URL, and its entity when it is in the Graph. */
interface Target {
  url: string;
  entity: Entity | null;
}

const OPEN_SPEC = {
  entity: LINK,
  description:
    "Read a web page by its link id or its URL. Without `at` it answers the current version: a fresh one from storage, " +
    "otherwise a new fetch, whose result is recorded as a version. With `at` it answers the version seen at that moment and fetches nothing. " +
    "Answers the first window of at most 50 KiB; continue with web.page.get.",
  params: {
    type: "object",
    properties: {
      id: { type: ["string", "null"], format: "uuid" },
      url: { type: ["string", "null"] },
      at: { type: ["string", "null"], format: "date-time" },
      forceRefresh: { type: "boolean" },
    },
    required: ["id", "url", "at", "forceRefresh"],
    additionalProperties: false,
  },
};

const PAGE_GET_SPEC = {
  entity: PAGE,
  description: "Continue a web page's text from a byte offset: one window of at most 50 KiB, and where the next one starts.",
  params: {
    type: "object",
    properties: { id: { type: "string", format: "uuid" }, offset: { type: "integer", minimum: 0 } },
    required: ["id", "offset"],
    additionalProperties: false,
  },
};

const LINK_GET_SPEC = {
  entity: LINK,
  description: "Get a web link with one page of its versions, newest first, and the first 20 entities that reference it.",
  params: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      offset: { type: "integer", minimum: 0 },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
    required: ["id", "offset", "limit"],
    additionalProperties: false,
  },
};

const SEARCH_GLOBAL_SPEC = {
  entity: LINK,
  description: "Search the internet. Answers each result's url, title and snippet and writes nothing; open a result with web.link.open.",
  params: {
    type: "object",
    properties: { query: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 10 } },
    required: ["query", "limit"],
    additionalProperties: false,
  },
};

export class WebModule {
  private readonly graph: GraphService;

  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
  }

  /** The `web` surface answers commands only, so the host never routes a
   * page here; one that arrives is refused. The handler exists because the
   * host lets a module command a surface only when it receives it. */
  @syncHandler(SURFACE_WEB)
  ingest(_params: SyncHandlerParams): Promise<SyncReceipt> {
    return Promise.reject(new Error("surface web delivers no pages"));
  }

  @tool("open", OPEN_SPEC)
  async open(params: WebOpenParams): Promise<WebPageRead> {
    const target = await this.target(params);
    const now = new Date().toISOString();
    const newest = target.entity === null ? null : await this.newestPeriod(target.entity.id, params.at ?? now);
    if (params.at !== null) {
      if (newest === null) throw new Error(`web.link.open: no version at or before ${params.at}`);
      return this.readStored(newest.pageId, 0);
    }
    const open = newest !== null && newest.period.validUntil === null ? newest : null;
    if (open !== null && !params.forceRefresh && isFresh(open.period, now)) return this.readStored(open.pageId, 0);

    const base = open === null ? null : await this.storedVersion(open.pageId, open.period);
    const answer = readAnswerOf(await this.graph.sourceCommand({
      action: "read",
      url: target.url,
      etag: base?.details.etag ?? null,
      lastModified: base?.details.lastModified ?? null,
      forceRefresh: params.forceRefresh,
    }, SOURCE_ACCOUNT));
    return this.record(target.url, base, answer);
  }

  @tool("get", PAGE_GET_SPEC)
  async pageGet(params: WebPageGetParams): Promise<WebPageRead> {
    return this.readStored(params.id, params.offset);
  }

  @tool("get", LINK_GET_SPEC)
  async linkGet(params: WebLinkGetParams): Promise<WebLinkDetail> {
    const link = canonicalOf(await this.graph.getEntity(params.id), LINK, params.id);
    const periods = await this.graph.listLinkPeriods({
      fromEntityId: link.id, kind: CONTENTS, notAfter: null, offset: params.offset, limit: params.limit,
    });
    const pageIds = [...new Set(periods.items.map((row) => row.to))];
    const pages = new Map((pageIds.length === 0 ? [] : await this.graph.getEntities(pageIds)).map((page) => [page.id, page]));
    const versions = periods.items.map((row) => ({ page: canonicalOf(pages.get(row.to) ?? null, PAGE, row.to), period: periodOf(row) }));
    const referencing = await this.graph.listLinked({ parentId: link.id, linkKind: REFERENCES, direction: "in", limit: 20, offset: 0 });
    return {
      link,
      versions,
      nextOffset: nextOffsetOf(params.offset, periods.items.length, periods.total),
      referencedBy: referencing.items.map(({ entity }) => entity),
    };
  }

  @tool("search_global", SEARCH_GLOBAL_SPEC)
  async searchGlobal(params: WebSearchParams): Promise<WebSearchAnswer> {
    return searchAnswerOf(await this.graph.sourceCommand({ action: "search", query: params.query, limit: params.limit }, SOURCE_ACCOUNT));
  }

  /** `rpc.ensure` for `web.link`: one canonical ref per URL, in order, and a
   * fragment declaring the links. No Graph or network call; a malformed URL
   * fails the whole call. */
  @rpc("link.ensure", {
    description: "Declare web links for URLs another module records, without reading the Graph or the network.",
    params: {
      type: "object",
      properties: {
        schemaId: { const: LINK },
        items: {
          type: "array",
          items: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
        },
      },
      required: ["schemaId", "items"],
      additionalProperties: false,
    },
  })
  ensure(request: EnsureRequest): Promise<EnsureHandlerResult> {
    return Promise.resolve().then(() => ensureLinks(request));
  }

  // ── open ───────────────────────────────────────────────────────────────────

  /** The link by id, read as the caller, or by its normalized URL. */
  private async target(params: WebOpenParams): Promise<Target> {
    if (params.id !== null) {
      if (params.url !== null) throw new Error("web.link.open: give either id or url");
      const entity = canonicalOf(await this.graph.getEntity(params.id), LINK, params.id);
      return { url: urlOf(entity), entity };
    }
    if (params.url === null) throw new Error("web.link.open: give either id or url");
    const url = normalizeUrl(params.url);
    if (url === null) throw new Error(`web.link.open: ${JSON.stringify(params.url)} is not an http or https URL`);
    const id = await this.canonicalId(LINK, url);
    return { url, entity: id === null ? null : canonicalOf(await this.graph.getEntity(id), LINK, id) };
  }

  /** The caller's entity of one schema holding a canonical key, or null. */
  private async canonicalId(schemaId: string, key: string): Promise<string | null> {
    const [id] = await this.graph.findByCanonicalKeys({ schemaId, canonicalKeys: [key] });
    if (id === undefined) throw new Error(`findByCanonicalKeys answered no position for ${schemaId} ${key}`);
    return id;
  }

  /** The link's period with the latest `validFrom` not after `notAfter`. */
  private async newestPeriod(linkId: string, notAfter: string): Promise<{ pageId: string; period: ContentsPeriod } | null> {
    const periods = await this.graph.listLinkPeriods({ fromEntityId: linkId, kind: CONTENTS, notAfter, offset: 0, limit: 1 });
    const [row] = periods.items;
    return row === undefined ? null : { pageId: row.to, period: periodOf(row) };
  }

  private async storedVersion(pageId: string, period: ContentsPeriod): Promise<Version> {
    const page = canonicalOf(await this.graph.getEntity(pageId), PAGE, pageId);
    return {
      details: pageDetailsOf(page.id, page.properties), title: page.name, firstSeen: page.date,
      pageId: page.id, period,
    };
  }

  /** Write what one fetch saw, in one batch that is the call's last Graph
   * operation, and answer the first window from the text in hand. */
  private async record(url: string, base: Version | null, answer: WebReadAnswer): Promise<WebPageRead> {
    const fragment: { entities: GraphEntityDeclaration[]; links: GraphLinkDeclaration[] } = { entities: [linkDeclaration(url)], links: [] };
    const fetchedAt = answer.status === "changed" ? answer.page.fetchedAt : answer.fetchedAt;
    const freshness = answer.status === "changed" ? answer.page : answer.freshness;
    const confirmed: ContentsMetadata = { lastGet: fetchedAt, expiresAt: freshness.expiresAt };

    if (answer.status === "unchanged") {
      if (base === null) throw new Error(`sources/web answered unchanged for ${url} without validators`);
      // Every read happens before the batch, which is the call's last Graph operation.
      const window = await this.readStored(requiredId(base), 0);
      fragment.links.push(contentsLink(url, pageRef(base.details.contentHash, url), confirmed, base.period.validFrom, null));
      await this.apply(fragment);
      return window;
    }

    const stored = await this.graph.bytesPut({ text: answer.page.content });
    if (base !== null && stored.contentHash === base.details.contentHash) {
      // The same text again: the open period is confirmed, and the page keeps
      // the validators it was first stored with.
      fragment.links.push(contentsLink(url, pageRef(base.details.contentHash, url), confirmed, base.period.validFrom, null));
      await this.apply(fragment);
      return this.windowRead(base, answer.page.content, requiredId(base));
    }

    const details: WebPageDetails = {
      url, contentHash: stored.contentHash, mimeType: "text/markdown", sizeBytes: stored.sizeBytes,
      etag: answer.page.etag, lastModified: answer.page.lastModified,
    };
    // A text this link served before keeps its page, with its first title and
    // first-seen time: resolving the declaration never rewrites it.
    const knownId = await this.canonicalId(PAGE, pageKey(stored.contentHash, url));
    const known = knownId === null ? null : canonicalOf(await this.graph.getEntity(knownId), PAGE, knownId);
    fragment.entities.push(pageDeclaration(details, answer.page.title, fetchedAt));
    if (base !== null) {
      fragment.links.push(contentsLink(url, pageRef(base.details.contentHash, url), metadataOf(base.period), base.period.validFrom, fetchedAt));
    }
    fragment.links.push(contentsLink(url, pageRef(stored.contentHash, url), confirmed, fetchedAt, null));
    const result = await this.apply(fragment);
    const page: Version = {
      details, title: known === null ? answer.page.title : known.name, firstSeen: known === null ? fetchedAt : known.date,
      pageId: known?.id ?? null, period: { ...confirmed, validFrom: fetchedAt, validUntil: null },
    };
    return this.windowRead(page, answer.page.content, page.pageId ?? resolvedPage(result, details));
  }

  private apply(fragment: GraphOwnerFragment): Promise<GraphBatchResult> {
    return this.graph.applyBatch({ entities: [], refs: [], links: [], fragment });
  }

  private windowRead(version: Version, text: string, pageId: string): WebPageRead {
    const window = windowOf(text, 0);
    return {
      pageId, url: version.details.url, title: version.title, firstSeen: version.firstSeen,
      content: window.content, offset: 0, nextOffset: nextOffsetOf(0, window.length, window.sizeBytes), sizeBytes: window.sizeBytes,
    };
  }

  /** One window of a stored page, read as the caller. */
  private async readStored(pageId: string, offset: number): Promise<WebPageRead> {
    const page = canonicalOf(await this.graph.getEntity(pageId), PAGE, pageId);
    const details = pageDetailsOf(page.id, page.properties);
    const window = await this.graph.bytesRead({ entityId: page.id, offset, length: WINDOW_BYTES });
    return {
      pageId: page.id, url: details.url, title: page.name, firstSeen: page.date, content: window.text, offset,
      nextOffset: nextOffsetOf(offset, window.length, window.sizeBytes), sizeBytes: window.sizeBytes,
    };
  }
}

function canonicalOf(entity: Entity | null, schemaId: string, id: string): CanonicalEntity {
  if (entity?.schemaId !== schemaId || entity.origin !== "canonical") throw new Error(`${schemaId} ${id} not found`);
  return entity;
}

/** A link's URL is its canonical key. */
function urlOf(link: Entity): string {
  if (link.origin !== "canonical" || link.canonicalKey === null) throw new Error(`web.link ${link.id} has no canonical key`);
  return link.canonicalKey;
}

function metadataOf(period: ContentsPeriod): ContentsMetadata {
  return { lastGet: period.lastGet, expiresAt: period.expiresAt };
}

function requiredId(version: Version): string {
  if (version.pageId === null) throw new Error(`web.page ${pageKey(version.details.contentHash, version.details.url)} is not stored yet`);
  return version.pageId;
}

/** The id the batch resolved for a page it declared or referenced. */
function resolvedPage(result: GraphBatchResult, details: WebPageDetails): string {
  const key = pageKey(details.contentHash, details.url);
  const resolved = result.resolved.find(({ ref }) => ref.kind === "canonical" && ref.schemaId === PAGE && ref.canonicalKey === key);
  if (resolved === undefined) throw new Error(`the batch resolved no web.page ${key}`);
  return resolved.id;
}

function ensureLinks(request: EnsureRequest): EnsureHandlerResult {
  if (request.schemaId !== LINK) throw new Error(`web.link.ensure cannot declare ${request.schemaId}`);
  const urls = request.items.map((item, index) => {
    const url = normalizeUrl(ensureItemOf(item, index).url);
    if (url === null) throw new Error(`web.link.ensure: item ${String(index)} is not an http or https URL`);
    return url;
  });
  return { refs: urls.map(linkRef), fragment: { entities: [...new Set(urls)].map(linkDeclaration), links: [] } };
}

function ensureItemOf(item: unknown, index: number): WebLinkEnsureItem {
  const url = typeof item === "object" && !Array.isArray(item) ? (item as { url?: unknown } | null)?.url : undefined;
  if (typeof url !== "string") throw new Error(`web.link.ensure: item ${String(index)} must be { url }`);
  return { url };
}

