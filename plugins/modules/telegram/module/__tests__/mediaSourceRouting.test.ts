/**
 * @layer: fe_agent
 * @test-id: tst_fe_tg_media_source_routing_001
 * @scenario: scn_tg_media_download_routing
 *
 * INV: a media message's file.object must carry the ENVELOPE's source_id as
 * `source_module` — the host file worker routes the later `download_file`
 * command by (source_module, source_surface), so a hardcoded "telegram" breaks
 * every attachment download the moment the surface is served by a
 * differently-named connector (live failure: the telegram-ts rollout logged
 * thousands of `no source runtime for (telegram, telegram)` — the runtime was
 * registered as (telegram-ts, telegram)).
 *
 * Doubles come from @magnis/testkit/module. Both the batch (`ingest`) and the
 * per-envelope (`ingestMessage`) paths are exercised through the real module.
 */
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { TelegramModule } from "../service.ts";
import type { SyncEnvelope, TelegramCanonical, TelegramFacets } from "../../types.ts";

type G = MockGraph<TelegramFacets, TelegramCanonical>;

// The private ingest helpers the test drives directly.
interface TgInternals {
  ingest(p: { envelopes?: SyncEnvelope[] }): Promise<unknown>;
  ingestMessage(env: SyncEnvelope, payload: Record<string, unknown>): Promise<unknown>;
}

function ingestGraph(): G {
  return mockGraph<TelegramFacets, TelegramCanonical>({
    // No pre-existing chat/sender entities: lookups miss, batch creates.
    find_by_external_id: () => Promise.resolve(null),
    list_facets_for_entity: () => Promise.resolve([]),
    apply_batch: (frag) =>
      Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        links_added: 0,
        dropped_keys: [],
      }),
    web_register: () => Promise.resolve("web-id"),
    find_by_anchor: () => Promise.resolve(null),
    file_register: () => Promise.resolve("file-id"),
    create_entity: () => Promise.resolve(entity("created-id", "")),
    delete_entity: () => Promise.resolve(),
  });
}

const mediaEnvelope = (sourceId: string): SyncEnvelope => ({
  source_id: sourceId,
  surface: "telegram",
  account_id: "acct-1",
  user_id: "u1",
  kind: "snapshot",
  identity_key: "9001",
  remote_id: "tg:msg:42:7",
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
  },
  timestamp: "2026-07-01T00:00:00Z",
});

describe("tst_fe_tg_media_source_routing_001 — file.object source_module = envelope source_id", () => {
  it("batch ingest stamps the envelope's source_id (telegram-ts), never a hardcoded name", async () => {
    const graph = ingestGraph();
    const mod = mountModule(TelegramModule, { graph, ctx: { extension_id: "telegram" } })
      .module as unknown as TgInternals;

    await mod.ingest({ envelopes: [mediaEnvelope("telegram-ts")] });

    const fileRegister = graph.spies.file_register;
    if (fileRegister === undefined) throw new Error("batch ingest: missing file_register spy");
    expect(fileRegister).toHaveBeenCalledTimes(1);
    const callArgs = fileRegister.mock.calls[0];
    if (callArgs === undefined) throw new Error("batch ingest: no file_register call recorded");
    const call = callArgs[0] as Record<string, unknown>;
    expect(call.external_id).toBe("file:telegram:42:7");
    expect(call.source_module).toBe("telegram-ts");
    expect(call.source_surface).toBe("telegram");
  });

  it("the message batch also mints the sender's account replica + edges (S4)", async () => {
    const graph = ingestGraph();
    const mod = mountModule(TelegramModule, { graph, ctx: { extension_id: "telegram" } })
      .module as unknown as TgInternals;

    const env = mediaEnvelope("telegram-ts");
    (env.payload as Record<string, unknown>).sender_id = 501;
    (env.payload as Record<string, unknown>).sender_name = "Ann";
    await mod.ingest({ envelopes: [env] });

    const applyBatch = graph.spies.apply_batch;
    if (applyBatch === undefined) throw new Error("missing apply_batch spy");
    const frag = applyBatch.mock.calls[0]?.[0] as {
      entities: { key: string; schema_id: string; anchor?: string; properties?: Record<string, unknown> }[];
      links?: { from_key: string; to_key: string; kind: string }[];
    };
    const msg = frag.entities.find((e) => e.key === "tg:msg:42:7");
    expect(msg?.anchor).toBe("tg:msg:42:7");
    expect(msg?.properties?.chat_id).toBeUndefined();
    expect(msg?.properties?.sender_id).toBeUndefined();
    const acct = frag.entities.find((e) => e.key === "acct:501");
    expect(acct?.schema_id).toBe("telegram.account");
    expect(acct?.anchor).toBe("tg:account:501");
    expect(acct?.properties).toMatchObject({ telegram_user_id: 501, display_name: "Ann" });
    const kinds = (frag.links ?? []).map((l) => `${l.from_key}→${l.to_key}:${l.kind}`);
    expect(kinds).toContain("tg:msg:42:7→acct:501:authored_by");
    expect(kinds).toContain("tg:msg:42:7→chat:42:in_chat");
    expect(kinds).toContain("acct:501→chat:42:observed_participant");
  });
});
