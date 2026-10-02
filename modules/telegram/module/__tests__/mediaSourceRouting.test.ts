/**
 * @layer: fe_agent
 * @test-id: tst_fe_tg_media_source_routing_001
 * @scenario: scn_tg_media_download_routing
 *
 * INV: a media message's file.object must carry the ENVELOPE's sourceId as
 * `sourceModule` — the host file worker routes the later `download_file`
 * command by (sourceModule, sourceSurface), so a hardcoded "telegram" breaks
 * every attachment download the moment the surface is served by a
 * differently-named connector (live failure: the telegram-ts rollout logged
 * thousands of `no source runtime for (telegram, telegram)` — the runtime was
 * registered as (telegram-ts, telegram)).
 *
 * Doubles come from @magnis/testkit/module. The batch (`ingest`) path is
 * exercised through the real module.
 */
import type { BatchEntityInput, BatchLink, GraphBatchInput, JsonObject, SyncEnvelope } from "@magnis/sdk";
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { TelegramModule } from "../service.ts";

type G = MockGraph;

function ingestGraph(): G {
  return mockGraph({
    // No pre-existing chat/sender entities: lookups miss, batch creates.
    apply_batch: (frag) =>
      Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        linksAdded: 0,
        droppedKeys: [],
      }),
    web_register: () => Promise.resolve("web-id"),
    web_register_batch: (links: readonly unknown[]) => Promise.resolve(links.map(() => "web-id")),
    find_by_external_id: () => Promise.resolve(null),
    find_by_external_ids: (externalIds) => Promise.resolve(externalIds.map(() => null)),
    file_register: () => Promise.resolve("file-id"),
    file_register_batch: (files: readonly unknown[]) => Promise.resolve(files.map(() => "file-id")),
    create_entity: () => Promise.resolve(entity("created-id", "")),
    delete_entity: () => Promise.resolve(),
  });
}

const mediaEnvelope = (sourceId: string, sender: JsonObject = {}): SyncEnvelope => ({
  sourceId,
  surface: "telegram",
  accountId: "acct-1",
  userId: "u1",
  kind: "snapshot",
  identityKey: "9001",
  remoteId: "tg:msg:42:7",
  payload: {
    entity_type: "message",
    message_id: 7,
    chat_id: 42,
    text: "",
    date: "2026-07-01T00:00:00Z",
    media_type: "photo",
    has_media: true,
    file_name: "photo.jpg",
    source_ref: { chat_id: 42, message_id: 7, dest_subpath: "telegram/42/7/photo.jpg" },
    ...sender,
  },
  timestamp: "2026-07-01T00:00:00Z",
});

describe("tst_fe_tg_media_source_routing_001 — file.object sourceModule = envelope sourceId", () => {
  it("batch ingest stamps the envelope's sourceId (telegram-ts), never a hardcoded name", async () => {
    const graph = ingestGraph();
    const mod = mountModule(TelegramModule, { graph, ctx: { extensionId: "telegram" } }).module;

    await mod.ingest({ envelopes: [mediaEnvelope("telegram-ts")] });

    const fileRegister = graph.spies.file_register_batch;
    if (fileRegister === undefined) throw new Error("batch ingest: missing file_register_batch spy");
    expect(fileRegister).toHaveBeenCalledTimes(1);
    const callArgs = fileRegister.mock.calls[0];
    if (callArgs === undefined) throw new Error("batch ingest: no file_register call recorded");
    // One call now carries the page's whole attachment list.
    const batch = callArgs[0] as Record<string, unknown>[];
    expect(batch).toHaveLength(1);
    const call = batch[0] as Record<string, unknown>;
    expect(call.externalId).toBe("file:telegram:42:7");
    expect(call.sourceModule).toBe("telegram-ts");
    expect(call.sourceSurface).toBe("telegram");
  });

  it("the message batch also mints the sender's account replica + edges (S4)", async () => {
    const graph = ingestGraph();
    const mod = mountModule(TelegramModule, { graph, ctx: { extensionId: "telegram" } }).module;

    await mod.ingest({ envelopes: [mediaEnvelope("telegram-ts", { sender_id: 501, sender_name: "Ann" })] });

    const applyBatch = graph.spies.apply_batch;
    if (applyBatch === undefined) throw new Error("missing apply_batch spy");
    const frag = applyBatch.mock.calls[0]?.[0] as GraphBatchInput;
    const msg: BatchEntityInput | undefined = frag.entities.find((e) => e.key === "tg:msg:42:7");
    expect(msg?.externalId).toBe("tg:msg:42:7");
    expect(msg?.properties).not.toHaveProperty("chat_id");
    expect(msg?.properties).not.toHaveProperty("sender_id");
    const acct = frag.entities.find((e) => e.key === "acct:501");
    expect(acct?.schemaId).toBe("telegram.account");
    expect(acct?.externalId).toBe("tg:account:501");
    expect(acct?.properties).toMatchObject({ telegram_user_id: 501, display_name: "Ann" });
    const kinds = frag.links.map((l: BatchLink) => `${l.fromKey}→${l.toKey}:${l.kind}`);
    expect(kinds).toContain("tg:msg:42:7→acct:501:authored_by");
    expect(kinds).toContain("tg:msg:42:7→chat:42:in_chat");
    expect(kinds).toContain("acct:501→chat:42:observed_participant");
  });
});
