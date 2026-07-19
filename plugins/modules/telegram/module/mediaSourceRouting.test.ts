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
 */
import { describe, expect, it, vi } from "vitest";
import { TelegramModule } from "./service.ts";
import type { SyncEnvelope } from "../types/index.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeGraph() {
  return {
    // No pre-existing chat/sender entities: lookups miss, batch creates.
    find_by_external_id: vi.fn(async () => null),
    list_facets_for_entity: vi.fn(async () => []),
    apply_batch: vi.fn(async (frag: { entities: { key: string }[] }) => ({
      ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
      created: frag.entities.length,
      updated: 0,
      links_added: 0,
      dropped_keys: [],
    })),
    web_register: vi.fn(async () => "web-id"),
    file_register: vi.fn(async () => "file-id"),
    attach_facet: vi.fn(async () => undefined),
    create_entity: vi.fn(async () => ({ id: "created-id" })),
    delete_entity: vi.fn(async () => undefined),
  } as any;
}

function makeModule(graph: any): TelegramModule {
  return new (TelegramModule as any)({
    graph,
    ctx: { extension_id: "telegram", user_id: "u1" },
    util: {},
    rpc: { call: vi.fn() },
  });
}

const mediaEnvelope = (sourceId: string): SyncEnvelope => ({
  source_id: sourceId,
  surface: "telegram",
  account_id: "acct-1",
  user_id: "u1",
  kind: "snapshot",
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
    const graph = makeGraph();
    const mod = makeModule(graph);

    await (mod as any).ingest({ envelopes: [mediaEnvelope("telegram-ts")] });

    expect(graph.file_register).toHaveBeenCalledTimes(1);
    const call = graph.file_register.mock.calls[0][0] as Record<string, unknown>;
    expect(call.external_id).toBe("file:telegram:42:7");
    expect(call.source_module).toBe("telegram-ts");
    expect(call.source_surface).toBe("telegram");
  });

  it("per-envelope ingestMessage stamps the envelope's source_id too", async () => {
    const graph = makeGraph();
    const mod = makeModule(graph);

    await (mod as any).ingestMessage(mediaEnvelope("telegram-ts"), mediaEnvelope("telegram-ts").payload);

    expect(graph.file_register).toHaveBeenCalledTimes(1);
    const call = graph.file_register.mock.calls[0][0] as Record<string, unknown>;
    expect(call.source_module).toBe("telegram-ts");
    expect(call.source_surface).toBe("telegram");
  });
});
