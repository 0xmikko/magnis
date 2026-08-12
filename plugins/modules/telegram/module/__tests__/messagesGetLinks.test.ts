/**
 * `messages.get` used to return `linked_entities: []` by construction: the
 * fetch asked for no links, so there were none to report. That was not a
 * decision about what a message exposes — and the module is not link-blind,
 * since the same method reads edges to resolve a sender name.
 *
 * Telegram's choice, stated: a message exposes its chat, its sender, and
 * whatever points at it — outgoing as `kind`, incoming as `~kind`, the
 * convention `projects` and `companies` already use.
 *
 * @layer: mod_tg
 * @test-id: tst_mod_tg_001
 * @scenario: scn_telegram_001
 * @covers plugins/modules/telegram/module/service.ts::TelegramModule.messagesGet
 * @deterministic testkit graph double; no clock, no network
 *
 * INV-P4.1 `telegram.messages.get` returns the entities telegram chooses to
 *          expose, with incoming edges distinguishable from outgoing ones.
 *
 * Doubles come from @magnis/testkit/module: `mockGraph` is a throwing Proxy, so
 * any op the read path takes without being arranged here fails the test.
 */
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule, type MockGraph } from "@magnis/testkit/module";
import { TelegramModule } from "../service.ts";
import { MESSAGE } from "../../schema.ts";

type G = MockGraph;

const MESSAGE_ID = "m1";

// m1 —in_chat→ c1, m1 —authored_by→ a1, t1 —watches→ m1, plus the two outgoing
// edges a real message also carries and this module does NOT claim to expose.
const LINKS = [
  { id: "l1", from_id: MESSAGE_ID, to_id: "c1", kind: "in_chat" },
  { id: "l2", from_id: MESSAGE_ID, to_id: "a1", kind: "authored_by" },
  { id: "l3", from_id: "t1", to_id: MESSAGE_ID, kind: "watches" },
  { id: "l4", from_id: MESSAGE_ID, to_id: "web-1", kind: "references" },
  { id: "l5", from_id: MESSAGE_ID, to_id: "file-1", kind: "attachment" },
];

const NEIGHBOURS = [
  entity("c1", "Ops chat", { schema_id: "telegram.chat" }),
  entity("a1", "Alice", { schema_id: "telegram.account" }),
  entity("t1", "Watch the thread", { schema_id: "triggers.trigger" }),
  entity("web-1", "example.com", { schema_id: "web.link" }),
  entity("file-1", "invoice.pdf", { schema_id: "file.object" }),
];

function messageGraph(): G {
  return mockGraph({
    get_entity_full: () =>
      Promise.resolve({
        entity: entity(MESSAGE_ID, "", {
          schema_id: MESSAGE,
          properties: { text: "hello", date: "2026-08-11T10:00:00Z" },
        }),
        links: LINKS,
      }),
    // The sender-name resolution reads the message's edges too.
    list_links_for_entity: () => Promise.resolve(LINKS),
    get_entities: () => Promise.resolve(NEIGHBOURS),
  });
}

describe("tst_mod_tg_001 — a message exposes its own links", () => {
  it("returns the chat and sender as outgoing, and a watcher as incoming", async () => {
    const graph = messageGraph();
    const mod = mountModule(TelegramModule, {
      graph,
      ctx: { extension_id: "telegram" },
    }).module;

    const view = await mod.messagesGet({ id: MESSAGE_ID });
    const byId = new Map(view.linked_entities.map((l) => [l.id, l] as const));

    // Outgoing keeps the kind — an implementation that prefixed everything
    // with `~` would pass a weaker assertion than this one.
    expect(byId.get("c1")?.link_kind).toBe("in_chat");
    expect(byId.get("a1")?.link_kind).toBe("authored_by");
    // Incoming wears the tilde — anything that points AT the message is
    // returned whatever it is.
    expect(byId.get("t1")?.link_kind).toBe("~watches");
    // Outgoing is only what the module says a message exposes: the web link and
    // the attachment hang off this message too, and are not part of the answer.
    expect(byId.has("web-1")).toBe(false);
    expect(byId.has("file-1")).toBe(false);
    // Those three, and the message never lists itself.
    expect(view.linked_entities).toHaveLength(3);
    expect(byId.has(MESSAGE_ID)).toBe(false);
    // The batch argument, not just its count: a batch over the wrong ids would
    // otherwise leave every assertion above intact.
    expect(graph.spies.get_entities).toHaveBeenCalledWith(
      expect.arrayContaining(["c1", "a1", "t1"]),
    );
  });
});
