/** An in-memory Graph and byte store for the Web module's tests, applying an
 * owner fragment the way the host does: a canonical ref resolves to the
 * entity holding that key or creates the declared one, a declaration never
 * rewrites an existing entity, and a `contents` row repeated with the same
 * start refreshes its metadata and may end it. */
import { createHash, randomUUID } from "node:crypto";

import type {
  BytesReadResult,
  CanonicalEntity,
  CanonicalLink,
  GraphBatchInput,
  GraphBatchResult,
  GraphRef,
  GraphResolvedRef,
  JsonValue,
  LinkedEntity,
} from "@magnis/sdk";
import { entity, link, type GraphOverrides } from "@magnis/testkit/module";

const OWNER = "00000000-0000-4000-8000-000000000001";

interface WebGraphState {
  entities: Map<string, CanonicalEntity>;
  links: CanonicalLink[];
  bytes: Map<string, Uint8Array>;
  batches: GraphBatchInput[];
  commands: Record<string, unknown>[];
  /** The account each command named, beside its payload. */
  accounts: (string | undefined)[];
}

/** A scripted Source: each command takes the next answer. */
type SourceAnswer = Record<string, unknown> | Error;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalEntity(
  schemaId: string,
  canonicalKey: string | null,
  name: string | null,
  date: string,
  properties: JsonValue,
  createdAt = date,
): CanonicalEntity {
  return entity(randomUUID(), "", {
    owner: OWNER, schemaId, createdAt, name, indexed: true, date, properties, canonicalKey,
    source: { source: "web", account: OWNER, externalId: canonicalKey ?? randomUUID() },
  });
}

function contentsRow(from: string, to: string, metadata: JsonValue, validFrom: string, validUntil: string | null): CanonicalLink {
  return link(from, to, "contents", { id: randomUUID(), owner: OWNER, createdAt: validFrom, metadata, validFrom, validUntil });
}

export function webGraph(answers: SourceAnswer[] = []): { state: WebGraphState; overrides: GraphOverrides } {
  const state: WebGraphState = { entities: new Map(), links: [], bytes: new Map(), batches: [], commands: [], accounts: [] };
  const byKey = (schemaId: string, key: string): CanonicalEntity | undefined =>
    [...state.entities.values()].find((entity) => entity.schemaId === schemaId && entity.canonicalKey === key);

  const overrides: GraphOverrides = {
    getEntity: (id) => Promise.resolve(state.entities.get(id) ?? null),
    getEntities: (ids) => Promise.resolve(ids.flatMap((id) => { const entity = state.entities.get(id); return entity === undefined ? [] : [entity]; })),
    findByCanonicalKeys: ({ schemaId, canonicalKeys }) => Promise.resolve(canonicalKeys.map((key) => byKey(schemaId, key)?.id ?? null)),
    listLinkPeriods: ({ fromEntityId, kind, notAfter, offset, limit }) => {
      const rows = state.links
        .filter((link) => link.from === fromEntityId && link.kind === kind
          && (notAfter === null || (link.validFrom !== null && Date.parse(link.validFrom) <= Date.parse(notAfter))))
        .sort((left, right) => Date.parse(right.validFrom ?? "") - Date.parse(left.validFrom ?? ""));
      return Promise.resolve({ items: rows.slice(offset, offset + limit), total: rows.length, limit, offset });
    },
    listLinked: ({ parentId, linkKind, direction, limit, offset }) => {
      const rows: LinkedEntity[] = state.links
        .filter((link) => link.kind === linkKind && (direction === "in" ? link.to : link.from) === parentId)
        .flatMap((link) => {
          const entity = state.entities.get(direction === "in" ? link.from : link.to);
          return entity === undefined ? [] : [{ entity, link }];
        });
      return Promise.resolve({ items: rows.slice(offset, offset + limit), total: rows.length, limit, offset });
    },
    listEntitiesWindow: (spec) => {
      const rows = [...state.entities.values()]
        .filter((entity) => entity.schemaId === spec.schema)
        .filter((entity) => spec.filterOp !== "exists" || spec.filterField?.propertyPath === undefined
          || (typeof entity.properties === "object" && entity.properties !== null && !Array.isArray(entity.properties)
            && spec.filterField.propertyPath in entity.properties))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      return Promise.resolve({ items: rows.slice(spec.offset, spec.offset + spec.limit), total: rows.length, limit: spec.limit, offset: spec.offset });
    },
    bytesPut: ({ text }) => {
      const bytes = new TextEncoder().encode(text);
      const contentHash = sha256(bytes);
      state.bytes.set(contentHash, bytes);
      return Promise.resolve({ contentHash, sizeBytes: bytes.length });
    },
    bytesRead: ({ entityId, offset, length }): Promise<BytesReadResult> => {
      const entity = state.entities.get(entityId);
      if (entity === undefined) return Promise.reject(new Error(`bytesRead: entity ${entityId} not found`));
      const hash = (entity.properties as { contentHash?: unknown }).contentHash;
      const bytes = typeof hash === "string" ? state.bytes.get(hash) : undefined;
      if (bytes === undefined) return Promise.reject(new Error(`bytesRead: entity ${entityId} names no stored contentHash`));
      const slice = bytes.subarray(offset, offset + length);
      // Back off while the byte after the window continues a character.
      let cut = slice.length;
      while (cut > 0 && offset + cut < bytes.length && ((bytes[offset + cut] ?? 0) & 0xc0) === 0x80) cut -= 1;
      return Promise.resolve({ text: new TextDecoder().decode(slice.subarray(0, cut)), offset, length: cut, sizeBytes: bytes.length });
    },
    sourceCommand: (payload, accountId) => {
      state.commands.push(payload);
      state.accounts.push(accountId);
      const answer = answers.shift();
      if (answer === undefined) return Promise.reject(new Error("no scripted Source answer"));
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    applyBatch: (batch) => {
      state.batches.push(batch);
      return Promise.resolve(apply(state, batch, byKey));
    },
  };
  return { state, overrides };
}

function apply(
  state: WebGraphState,
  batch: GraphBatchInput,
  byKey: (schemaId: string, key: string) => CanonicalEntity | undefined,
): GraphBatchResult {
  const fragment = batch.fragment ?? { entities: [], links: [] };
  const resolved = new Map<string, GraphResolvedRef>();
  let created = 0;
  const declared = new Map(fragment.entities.map((entity) => [JSON.stringify(entity.ref), entity]));
  const resolve = (ref: GraphRef): string => {
    const key = JSON.stringify(ref);
    const known = resolved.get(key);
    if (known !== undefined) return known.id;
    if (ref.kind !== "canonical") throw new Error(`the fake resolves canonical refs only, got ${ref.kind}`);
    const existing = byKey(ref.schemaId, ref.canonicalKey);
    if (existing !== undefined) {
      resolved.set(key, { ref, id: existing.id, created: false });
      return existing.id;
    }
    const declaration = declared.get(key);
    if (declaration === undefined) throw new Error(`Graph reference ${key} not found`);
    const entity = canonicalEntity(ref.schemaId, ref.canonicalKey, declaration.name, declaration.date ?? new Date().toISOString(), declaration.properties);
    state.entities.set(entity.id, entity);
    created += 1;
    resolved.set(key, { ref, id: entity.id, created: true });
    return entity.id;
  };
  for (const entity of fragment.entities) resolve(entity.ref);
  let linksAdded = 0;
  for (const link of fragment.links) {
    const from = resolve(link.from);
    const to = resolve(link.to);
    const same = state.links.find((row) => row.from === from && row.to === to && row.kind === link.kind && row.validFrom === link.validFrom);
    if (same !== undefined) {
      same.metadata = link.metadata;
      if (same.validUntil === null && link.validUntil !== null) same.validUntil = link.validUntil;
      continue;
    }
    if (link.validUntil === null && state.links.some((row) => row.from === from && row.kind === link.kind && row.validUntil === null)) {
      throw new Error("a second open period overlaps the open one");
    }
    state.links.push(contentsRow(from, to, link.metadata, link.validFrom ?? "", link.validUntil));
    linksAdded += 1;
  }
  return { ids: {}, created, updated: 0, linksAdded, droppedKeys: [], resolved: [...resolved.values()] };
}
