// Address book plugin — backend module (V8). The sync handler of the
// `addressbook` surface: provider address book contacts become cards, and a
// card finds the person it belongs to by its email addresses.

import { type GraphService, type PluginDeps, syncComplete, syncHandler, unseenSourceReplicas } from "@magnis/plugin-sdk";
import type { BatchEntityInput, JsonObject, Link, SyncEnvelope, SyncHandlerParams, SyncHookParams, SyncReceipt, SyncReconcileAnswer } from "@magnis/sdk";
import type { GoogleContactPayload } from "../types.ts";
import { INGEST_CHUNK, replicaDict } from "./helpers.ts";
import { CARD } from "../schema.ts";
import { CONTACT } from "../../contacts/schema.ts";
import { ADDRESS_SCHEMA, addressFragment } from "../../email/schema.ts";

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
  // snapshots). A page's contacts fold into applyBatch chunks — one card per
  // contact plus the address nodes it lists, in ONE atomic graph.applyBatch
  // per chunk.
  //
  // Idempotency: the entity key AND the external ids are the envelope
  // `remoteId` (`gpeople:{stable_id}`), so re-ingesting the same contact
  // upserts on that key — no duplicate entity (applyBatch resolves-or-creates
  // by external id, like email's message ingest). `generation` is the pass
  // the worker is in; a Source effect outside a worker states nothing.
  @syncHandler("addressbook")
  async ingest(params: SyncHandlerParams): Promise<SyncReceipt> {
    const envelopes = params.envelopes;
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

    // Fold by remoteId so two envelopes for the same resourceName collapse to
    // ONE entity in the batch (last-write-wins on payload). Native parity: an
    // envelope with no owning user is skipped — the dispatcher couldn't resolve
    // userId, so we cannot user-scope the write.
    const byRemoteId = new Map<string, SyncEnvelope>();
    for (const env of envelopes) {
      if (!env.userId) continue;
      if (env.kind === "delete") {
        if (await this.deleteGoogleReplica(env, at) && stated && !fullPass) plan.total -= 1;
        continue;
      }
      if (env.kind !== "snapshot" && env.kind !== "live") continue;
      if (!env.remoteId) continue;
      const payload = env.payload as JsonObject;
      if (payload.entity_type === "list") {
        const total = payload.total_people;
        const skipped = payload.skipped;
        if (typeof total === "number" && stated && fullPass) plan.total += total;
        if (typeof skipped === "number" && stated && fullPass) plan.skipped += skipped;
        continue;
      }
      byRemoteId.set(env.remoteId, env);
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

    return {
      droppedRemoteIds: dropped,
      triggerChecks: [],
      plan: stated ? { [CARD]: plan } : null,
      excluded: [],
    };
  }

  /** @tested-by: tst_module_google_002, tst_module_addressbook_006 */
  private async deleteGoogleReplica(env: SyncEnvelope, at: string): Promise<boolean> {
    if (!env.remoteId) return false;
    const id = await this.graph.findByExternalId(env.remoteId);
    if (!id) return false;
    const replica = await this.graph.getEntity(id);
    if (replica?.schemaId !== CARD) return false;
    const properties = replica.properties as Record<string, unknown>;
    if (properties.source_id !== env.sourceId || properties.account_id !== env.accountId) return false;
    await this.archiveCard(id, at);
    return true;
  }

  /** The host calls this only after the complete replacement pass. Never
   * touch a person; only this account's cards depart.
   * @tested-by: tst_module_google_002, tst_module_addressbook_006 */
  @syncComplete()
  async onSyncComplete(params: SyncHookParams): Promise<SyncReconcileAnswer> {
    if (!params.sourceId || !params.accountId || !params.generation) {
      throw new Error("addressbook sync complete requires source, account and generation");
    }
    const at = new Date().toISOString();
    for (const card of await unseenSourceReplicas(this.graph, CARD, params.sourceId, params.accountId, params.generation)) {
      await this.archiveCard(card.id, at);
    }
    return { departed: [], plan: { [CARD]: { total: 0, skipped: 0 } } };
  }

  /// One chunk → one applyBatch. Each contact becomes a card whose external
  /// id is its stable resourceName-derived remoteId.
  private async ingestContactBatch(envelopes: SyncEnvelope[], generation: string | undefined, fullPass: boolean, at: string): Promise<number> {
    // 1. Fold envelopes into rows: payload + its lowercased addresses.
    interface Row {
      remoteId: string;
      payload: JsonObject;
      p: GoogleContactPayload;
      addresses: string[];
      sourceId: string;
      accountId: string;
    }
    const rows: Row[] = [];
    for (const env of envelopes) {
      const remoteId = env.remoteId;
      if (!remoteId) continue;
      if (!env.sourceId || !env.accountId) throw new Error("addressbook ingest requires source and account");
      const payload = env.payload as JsonObject;
      const p = payload as GoogleContactPayload;
      const addresses = cardAddresses(p);
      rows.push({ remoteId, payload, p, addresses, sourceId: env.sourceId, accountId: env.accountId });
    }
    if (rows.length === 0) return 0;

    const deltaExternalIds = generation && !fullPass ? rows.map((row) => row.remoteId) : [];
    const known = deltaExternalIds.length > 0 ? await this.graph.findByExternalIds(deltaExternalIds) : [];
    const existing = new Set(deltaExternalIds.filter((_, index) => known[index]));

    // 2. Address nodes and cards share the sync transaction. A held address
    // keeps its synchronization choice; a new one takes the email owner's rule.
    // @tested-by: tst_module_contacts_ingest_002
    // @tested-by: tst_module_addressbook_email_sync_001
    const allAddresses = [...new Set(rows.flatMap((r) => r.addresses))];
    const addressNodes = await addressFragment(this.graph, new Map(allAddresses.map((address) => [address, null])));

    // 3. Card nodes: fields-as-last-synced dictionaries, identified
    // by the stable remoteId — ONE batch, and the sync never writes the
    // person.
    const entities: BatchEntityInput[] = [...addressNodes.entities, ...rows.map(({ remoteId, payload, p, sourceId, accountId }) => {
      const name = typeof p.display_name === "string" ? p.display_name : "";
      return {
        key: remoteId,
        schemaId: CARD,
        name,
        idx: name.toLowerCase() || null,
        date: null,
        externalId: remoteId,
        properties: { ...replicaDict(payload), source_id: sourceId, account_id: accountId, ...(generation ? { sync_pass: generation } : {}) },
      };
    })];
    const batch = await this.graph.applyBatch({ entities, refs: addressNodes.refs, links: [] });
    const addressId = new Map(allAddresses.map((address) => {
      const id = batch.ids[`addr:${address}`];
      if (!id) throw new Error(`addressbook ingest: address ${address} was not resolved`);
      return [address, id] as const;
    }));
    const created = deltaExternalIds.filter((externalId) => !existing.has(externalId) && batch.ids[externalId]).length;

    // 4. Owners, on identity-grade external ids only. Fuzzy name
    // matching is never automatic.
    for (const row of rows) {
      const replicaId = batch.ids[row.remoteId];
      if (!replicaId) continue;
      const addrIds = row.addresses
        .map((a) => addressId.get(a))
        .filter((id) => typeof id === "string");
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

  /// A contact that left the provider: its card is archived — `deleteEntity`
  /// archives, it never deletes — and its owners' address links are re-checked
  /// without it. The owners are read first: an archived card has no links.
  private async archiveCard(cardId: string, at: string): Promise<void> {
    const owners = await this.identityOwners(cardId);
    await this.graph.deleteEntity(cardId);
    for (const person of owners) await this.endUnlistedAddresses(person, at);
  }

  /// Ends the person's links to the addresses none of its cards lists any
  /// more. Only an open link the address book marked ends: a link made by
  /// hand, by email or by another module is never touched. Archived cards
  /// are gone from the person's links, so they list nothing.
  private async endUnlistedAddresses(personId: string, at: string): Promise<void> {
    const links = (await this.graph.listLinksForEntity(personId, "identity"))
      .filter((l) => l.from === personId && l.validUntil === null);
    if (links.length === 0) return;
    const reached = await this.graph.getEntities([...new Set(links.map((l) => l.to))]);
    const listed = new Set(reached.filter((e) => e.schemaId === CARD).flatMap((e) => cardAddresses(e.properties)));
    const unlisted = new Set(reached.filter((e) => e.schemaId === ADDRESS_SCHEMA && (e.name === null || !listed.has(e.name))).map((e) => e.id));
    for (const link of links) {
      if (unlisted.has(link.to) && producedHere(link)) await this.graph.endLink(link.id, at);
    }
  }

  /// The persons with a current `identity` link to the entity. A sync reads
  /// ended links too, so only a link without `validUntil` counts. Companies
  /// hold identity links to addresses too — filtered to persons.
  private async identityOwners(entityId: string): Promise<string[]> {
    const links = await this.graph.listLinksForEntity(entityId, "identity");
    const from = [...new Set(links.filter((l) => l.to === entityId && l.validUntil === null).map((l) => l.from))];
    if (from.length === 0) return [];
    return (await this.graph.getEntities(from)).filter((e) => e.schemaId === CONTACT).map((e) => e.id);
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
    const person = await this.graph.createEntity({
      schemaId: CONTACT,
      name,
      idx: name.toLowerCase(),
    });
    return person.id;
  }

  /// An `identity` link the address book answers for: marked with its
  /// producer, so a later sync ends only its own links, and dated from the
  /// sync, so a returning address opens a new period beside the ended one.
  private async openLink(fromId: string, toId: string, at: string): Promise<void> {
    await this.graph.addLink({
      from: fromId,
      to: toId,
      kind: "identity",
      metadata: { producer: PRODUCER },
      validFrom: at,
    });
  }
}

/** Whether the address book wrote this link: its metadata names the producer. */
function producedHere(link: Link): boolean {
  if (link.origin !== "canonical") return false;
  const metadata = link.metadata;
  return metadata !== null && typeof metadata === "object" && !Array.isArray(metadata) && metadata.producer === PRODUCER;
}

/** The addresses a card lists, as the address nodes spell them: trimmed,
 * lowercased, once each. Reads the payload and the stored card alike. */
function cardAddresses(card: unknown): string[] {
  const emails = card !== null && typeof card === "object" && "emails" in card && Array.isArray(card.emails)
    ? (card.emails as { address?: unknown }[])
    : [];
  return [
    ...new Set(
      emails
        .map((e) => (typeof e.address === "string" ? e.address.trim().toLowerCase() : ""))
        .filter((a) => a.length > 0),
    ),
  ];
}
