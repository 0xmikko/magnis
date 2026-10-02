// Address book plugin — backend module (V8). The sync handler of the
// `addressbook` surface: provider address book contacts become cards, and a
// card finds the person it belongs to by its email addresses.

import { syncComplete, syncHandler, unseenSourceReplicas, type BatchEntityInput, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import type { GoogleContactPayload, SyncEnvelope } from "../types.ts";
import { INGEST_CHUNK, replicaDict } from "./helpers.ts";
import { CARD } from "../schema.ts";
import { CONTACT } from "../../contacts/schema.ts";
import { ADDRESS_SCHEMA, addressBatchEntity } from "../../email/schema.ts";

/** The `producer` mark on every link the address book writes. */
const PRODUCER = "addressbook";

export class AddressbookModule {
  private readonly graph: GraphService;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
  }

  // ── sync ingest (@syncHandler) ────────────────────────────────
  // Invoked by the host PluginModuleController bridge (`addressbook.__sync__`)
  // with a WHOLE page of `addressbook` envelopes (Google People API
  // snapshots). A page's contacts fold into apply_batch chunks — one card per
  // contact plus the address nodes it lists, in ONE atomic graph.apply_batch
  // per chunk.
  //
  // Idempotency: the entity key AND the anchors are the envelope
  // `remote_id` (`gpeople:{stable_id}`), so re-ingesting the same contact
  // upserts on that key — no duplicate entity (apply_batch resolves-or-creates
  // by anchor, like email's message ingest).
  @syncHandler("addressbook")
  async ingest(params: {
    envelopes?: SyncEnvelope[];
    command?: "bootstrap" | "catch_up" | "backfill";
    /** The pass the worker is in; absent for a Source effect outside a
     * worker, which states nothing. */
    generation?: string;
  }): Promise<{
    dropped_remote_ids: string[];
    trigger_checks: [];
    plan?: Record<string, { total: number; skipped: number }>;
  }> {
    const envelopes = Array.isArray(params.envelopes) ? params.envelopes : [];
    const dropped: string[] = [];
    // The sync time: the moment the links this page opens begin.
    const at = new Date().toISOString();
    // What the page states for the plan, as the People API counts the list:
    // the whole of it on the list envelope that opens a pass, and the persons
    // a page left out as skipped.
    // @tested-by: tst_module_contacts_plan_001
    const stated = typeof params.generation === "string" && params.generation !== "";
    const fullPass = params.command === "bootstrap";
    const plan = { total: 0, skipped: 0 };

    // Fold by remote_id so two envelopes for the same resourceName collapse to
    // ONE entity in the batch (last-write-wins on payload). Native parity: an
    // envelope with no owning user is skipped — the dispatcher couldn't resolve
    // user_id, so we cannot user-scope the write.
    const byRemoteId = new Map<string, SyncEnvelope>();
    for (const env of envelopes) {
      if (!env.user_id) continue;
      if (env.kind === "delete") {
        if (await this.deleteGoogleReplica(env, at) && stated && !fullPass) plan.total -= 1;
        continue;
      }
      if (env.kind !== "snapshot" && env.kind !== "live") continue;
      if (!env.remote_id) continue;
      if (env.payload?.entity_type === "list") {
        const total = env.payload.total_people;
        const skipped = env.payload.skipped;
        if (typeof total === "number" && stated && fullPass) plan.total += total;
        if (typeof skipped === "number" && stated && fullPass) plan.skipped += skipped;
        continue;
      }
      byRemoteId.set(env.remote_id, env);
    }

    let chunk: SyncEnvelope[] = [];
    const flush = async (): Promise<void> => {
      if (chunk.length > 0) {
        plan.total += await this.ingestContactBatch(chunk, params.generation, fullPass, at);
        await Promise.resolve(); // yield so waiting RPCs get the connection
      }
      chunk = [];
    };
    for (const env of byRemoteId.values()) {
      if (chunk.length >= INGEST_CHUNK) await flush();
      chunk.push(env);
    }
    await flush();

    if (!stated) return { dropped_remote_ids: dropped, trigger_checks: [] };
    return { dropped_remote_ids: dropped, trigger_checks: [], plan: { [CARD]: plan } };
  }

  /** @tested-by: tst_module_google_002, tst_module_addressbook_006 */
  private async deleteGoogleReplica(env: SyncEnvelope, at: string): Promise<boolean> {
    if (!env.remote_id) return false;
    const id = await this.graph.find_by_anchor(env.remote_id);
    if (!id) return false;
    const replica = await this.graph.get_entity(id);
    if (replica?.schema_id !== CARD || replica.properties?.source_id !== env.source_id || replica.properties?.account_id !== env.account_id) return false;
    await this.archiveCard(id, at);
    return true;
  }

  /** The host calls this only after the complete replacement pass. Never
   * touch a person; only this account's cards depart.
   * @tested-by: tst_module_google_002, tst_module_addressbook_006 */
  @syncComplete()
  async onSyncComplete(params: { source_id: string; account_id: string; generation: string }): Promise<{
    departed: string[];
    plan: Record<string, { total: number; skipped: number }>;
  }> {
    if (!params.source_id || !params.account_id || !params.generation) {
      throw new Error("addressbook sync complete requires source, account and generation");
    }
    const at = new Date().toISOString();
    for (const card of await unseenSourceReplicas(this.graph, CARD, params.source_id, params.account_id, params.generation)) {
      await this.archiveCard(card.id, at);
    }
    return { departed: [], plan: { [CARD]: { total: 0, skipped: 0 } } };
  }

  /// One chunk → one apply_batch. Each contact becomes a card anchored on its
  /// stable resourceName-derived remote_id.
  private async ingestContactBatch(envelopes: SyncEnvelope[], generation: string | undefined, fullPass: boolean, at: string): Promise<number> {
    // 1. Fold envelopes into rows: payload + its lowercased addresses.
    interface Row {
      remoteId: string;
      p: GoogleContactPayload;
      addresses: string[];
      sourceId: string;
      accountId: string;
    }
    const rows: Row[] = [];
    for (const env of envelopes) {
      const remoteId = env.remote_id;
      if (!remoteId) continue;
      if (!env.source_id || !env.account_id) throw new Error("addressbook ingest requires source and account");
      const p = (env.payload ?? {}) as GoogleContactPayload;
      const addresses = cardAddresses(p);
      rows.push({ remoteId, p, addresses, sourceId: env.source_id, accountId: env.account_id });
    }
    if (rows.length === 0) return 0;

    const deltaAnchors = generation && !fullPass ? rows.map((row) => row.remoteId) : [];
    const known = deltaAnchors.length > 0 ? await this.graph.find_by_anchors(deltaAnchors) : [];
    const existing = new Set(deltaAnchors.filter((_, index) => known[index]));

    // 2. Address nodes and cards share the sync transaction.
    // @tested-by: tst_module_contacts_ingest_002
    const allAddresses = [...new Set(rows.flatMap((r) => r.addresses))];
    const addressEntities = allAddresses.map((address) => addressBatchEntity(`addr:${address}`, address, null));

    // 3. Card nodes: fields-as-last-synced dictionaries, anchored
    // by the stable remote_id — ONE batch, and the sync never writes the
    // person.
    const entities: BatchEntityInput[] = [...addressEntities, ...rows.map(({ remoteId, p, sourceId, accountId }) => {
      const name = typeof p.display_name === "string" ? p.display_name : "";
      return {
        key: remoteId,
        schema_id: CARD,
        name,
        idx: name.toLowerCase() || undefined,
        anchor: remoteId,
        properties: { ...replicaDict(p), source_id: sourceId, account_id: accountId, ...(generation ? { sync_pass: generation } : {}) },
      };
    })];
    const batch = await this.graph.apply_batch({ entities, refs: [], links: [] });
    const addressId = new Map(allAddresses.map((address) => {
      const id = batch.ids[`addr:${address}`];
      if (!id) throw new Error(`addressbook ingest: address ${address} was not resolved`);
      return [address, id] as const;
    }));
    const created = deltaAnchors.filter((anchor) => !existing.has(anchor) && batch.ids[anchor]).length;

    // 4. Owners, on identity-grade anchors only. Fuzzy name
    // matching is never automatic.
    for (const row of rows) {
      const replicaId = batch.ids[row.remoteId];
      if (!replicaId) continue;
      const addrIds = row.addresses
        .map((a) => addressId.get(a))
        .filter((id): id is string => typeof id === "string");
      await this.attachReplica(replicaId, row.p, addrIds, at);
    }
    return created;
  }

  /// Every sync re-checks the card against what it lists now. Its first sync
  /// decides its owners by its addresses: nobody holds one → one
  /// new person; exactly one person does → that person; several do → each of
  /// them, so nothing merges. Names never match anything. Then, on every
  /// sync: with one owner, an address nobody holds links to it; an address
  /// another person holds makes that person an owner too; and each owner's
  /// addresses no card of theirs lists any more end. A card's owners are
  /// never ended here.
  /// @tested-by: tst_module_addressbook_003, tst_module_addressbook_004, tst_module_addressbook_005, tst_module_addressbook_007
  private async attachReplica(
    replicaId: string,
    p: GoogleContactPayload,
    addrIds: string[],
    at: string,
  ): Promise<void> {
    const holders = new Map<string, string[]>();
    for (const addrId of addrIds) holders.set(addrId, await this.identityOwners(addrId));
    const owners = await this.identityOwners(replicaId);
    if (owners.length === 0) {
      const found = [...new Set([...holders.values()].flat())];
      owners.push(...(found.length > 0 ? found : [await this.createPerson(p)]));
      for (const person of owners) await this.openLink(person, replicaId, at);
    }
    const [only] = owners;
    if (owners.length === 1 && only !== undefined) {
      for (const [addrId, held] of holders) {
        if (held.length === 0) await this.openLink(only, addrId, at);
      }
    }
    for (const holder of new Set([...holders.values()].flat())) {
      if (owners.includes(holder)) continue;
      await this.openLink(holder, replicaId, at);
      owners.push(holder);
    }
    for (const person of owners) await this.endUnlistedAddresses(person, at);
  }

  /// A contact that left the provider: its card is archived — `delete_entity`
  /// archives, it never deletes — and its owners' address links are re-checked
  /// without it. The owners are read first: an archived card has no links.
  private async archiveCard(cardId: string, at: string): Promise<void> {
    const owners = await this.identityOwners(cardId);
    await this.graph.delete_entity(cardId);
    for (const person of owners) await this.endUnlistedAddresses(person, at);
  }

  /// Ends the person's links to the addresses none of its cards lists any
  /// more. Only an open link the address book marked ends: a link made by
  /// hand, by email or by another module is never touched. Archived cards
  /// are gone from the person's links, so they list nothing.
  private async endUnlistedAddresses(personId: string, at: string): Promise<void> {
    const links = (await this.graph.list_links_for_entity(personId, "identity"))
      .filter((l) => l.from_id === personId && l.validUntil === null);
    if (links.length === 0) return;
    const reached = await this.graph.get_entities([...new Set(links.map((l) => l.to_id))]);
    const listed = new Set(reached.filter((e) => e.schema_id === CARD).flatMap((e) => cardAddresses(e.properties)));
    const unlisted = new Set(reached.filter((e) => e.schema_id === ADDRESS_SCHEMA && !listed.has(e.name)).map((e) => e.id));
    for (const link of links) {
      if (unlisted.has(link.to_id) && link.metadata?.producer === PRODUCER) await this.graph.end_link(link.id, at);
    }
  }

  /// The persons with a current `identity` link to the entity. A sync reads
  /// ended links too, so only a link without `validUntil` counts. Companies
  /// hold identity links to addresses too — filtered to persons.
  private async identityOwners(entityId: string): Promise<string[]> {
    const links = await this.graph.list_links_for_entity(entityId, "identity");
    const from = [...new Set(links.filter((l) => l.to_id === entityId && l.validUntil === null).map((l) => l.from_id))];
    if (from.length === 0) return [];
    return (await this.graph.get_entities(from)).filter((e) => e.schema_id === CONTACT).map((e) => e.id);
  }

  /// A new person: the name vouch and an empty dictionary — the person's card
  /// composes everything else from its cards at read time.
  private async createPerson(p: GoogleContactPayload): Promise<string> {
    const firstAddress = (p.emails ?? []).find(
      (e) => typeof e.address === "string" && e.address.length > 0,
    )?.address;
    const name =
      (typeof p.display_name === "string" && p.display_name.length > 0
        ? p.display_name
        : undefined) ??
      firstAddress ??
      "Contact";
    const person = await this.graph.create_entity({
      schema_id: CONTACT,
      name,
      idx: name.toLowerCase(),
    });
    return person.id;
  }

  /// An `identity` link the address book answers for: marked with its
  /// producer, so a later sync ends only its own links, and dated from the
  /// sync, so a returning address opens a new period beside the ended one.
  private async openLink(fromId: string, toId: string, at: string): Promise<void> {
    await this.graph.add_link({
      from_id: fromId,
      to_id: toId,
      kind: "identity",
      metadata: { producer: PRODUCER },
      validFrom: at,
      validUntil: null,
    });
  }
}

/** The addresses a card lists, as the address nodes spell them: trimmed,
 * lowercased, once each. Reads the payload and the stored card alike. */
function cardAddresses(card: { emails?: unknown } | undefined): string[] {
  const emails = Array.isArray(card?.emails) ? (card.emails as { address?: unknown }[]) : [];
  return [
    ...new Set(
      emails
        .map((e) => (typeof e.address === "string" ? e.address.trim().toLowerCase() : ""))
        .filter((a) => a.length > 0),
    ),
  ];
}
