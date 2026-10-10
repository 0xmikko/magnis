/**
 * @layer: module
 * @test-id: tst_module_contacts_tracking_read_001
 * @scenario: scn_compact_removed_workflows_001
 * @covers: modules/contacts/module/service.ts::get_social_tracking_by_handle,list_social_tracking,rename_if_placeholder
 * @deterministic: yes
 * @fixtures: stored tracked and untracked contacts
 */
import type { JsonObject, JsonValue } from "@magnis/sdk";
import { describe, expect, it } from "vitest";
import { entity, entityId, entityRead, entityExtras, link, mockGraph, mountModule, page, syncStateDouble } from "@magnis/testkit/module";
import { ContactsModule } from "../service.ts";

describe("retained social ingestion reads", () => {
  const tracked = entity("p1", "jack", { schemaId: "contacts.person", properties: {
    tracking: [{ platform: "x", handle: "Jack", enabled: true }],
  }});
  const untracked = entity("p2", "Ann", { schemaId: "contacts.person", properties: {
    tracking: [{ platform: "linkedin", handle: "ann", enabled: false }],
  }});
  it("reads existing tracking without exposing write workflows", async () => {
    const graph = mockGraph({
      getEntity: async () => tracked,
      listEntitiesWindow: async () => page([tracked, untracked]),
    });
    const { module } = mountModule(ContactsModule, { graph });
    for (const name of ["set_social_tracking", "track_social_profile", "batch_track_social"]) expect(name in module).toBe(false);
    expect(await module.get_social_tracking_by_handle({ platform: "x", handle: "jack" })).toMatchObject({ contact_id: entityId("p1"), tracked: true });
    expect(await module.get_social_tracking_by_handle({ platform: "linkedin", handle: "ann" })).toMatchObject({ contact_id: entityId("p2"), tracked: false });
    expect(await module.get_social_tracking_by_handle({ platform: "x", handle: "missing" })).toBeNull();
    expect(await module.list_social_tracking({ platform: "x" })).toMatchObject([{ contact_id: entityId("p1"), handle: "Jack" }]);
    expect(await module.list_social_tracking({ platform: "linkedin" })).toEqual([]);
  });
  it("renames only an unchanged placeholder during profile ingestion", async () => {
    const graph = mockGraph({ getEntity: async () => tracked, updateEntityName: async () => undefined });
    const { module } = mountModule(ContactsModule, { graph });
    expect(await module.rename_if_placeholder({ id: entityId("p1"), expected_name: "jack", new_name: "Jack Smith" })).toEqual({ renamed: true });
    expect(await module.rename_if_placeholder({ id: entityId("p1"), expected_name: "other", new_name: "Wrong" })).toEqual({ renamed: false });
    expect(graph.spies.updateEntityName).toHaveBeenCalledExactlyOnceWith(entityId("p1"), "Jack Smith");
  });
});

it("removes only a committed X migration entry and preserves LinkedIn", async () => {
  const contact = entity("contact", "Jack", { schemaId: "contacts.person", properties: { tracking: [
    { platform: "x", handle: "Jack", enabled: false }, { platform: "linkedin", handle: "jack", enabled: true },
  ] } });
  const profile = entityRead(entity("profile", "Jack", { schemaId: "x.profile", source: { source: "test", account: "a1", externalId: "x:profile:12" }, properties: { handle: "jack" } }), entityExtras({ syncEnabled: true, syncRevision: "0" }));
  let linked = false;
  const graph = mockGraph({
    getEntityFull: async () => ({ entity: contact, links: linked ? [link("contact", "profile", "identity", { id: entityId("link") })] : [] }),
    getEntity: async () => profile,
    updateProperties: async (params) => { contact.properties = { ...(contact.properties as JsonObject), ...(params.properties as JsonObject) }; },
  });
  const mounted = await mountModule(ContactsModule, { mode: "dispatch", graph, ctx: { extensionId: "contacts" } });
  const params = { contactId: entityId("contact"), profileId: entityId("profile"), handle: "jack", enabled: false };
  await expect(mounted.rpc("completeXSyncMigration", params)).rejects.toThrow();
  expect(graph.spies.updateProperties).not.toHaveBeenCalled();
  linked = true;
  profile.entity.properties = { handle: "someone_else" };
  await expect(mounted.rpc("completeXSyncMigration", params)).rejects.toThrow("identity does not match");
  expect(graph.spies.updateProperties).not.toHaveBeenCalled();
  profile.entity.properties = { handle: "jack" };
  expect(await mounted.rpc("completeXSyncMigration", params)).toEqual({ removed: true });
  expect(contact.properties).toEqual({ tracking: [{ platform: "linkedin", handle: "jack", enabled: true }] });
  expect(await mounted.rpc("completeXSyncMigration", params)).toEqual({ removed: false });
});

it("fans one approved contact action out to current identities through permitted owner routes", async () => {
  const { readFileSync } = await import("node:fs");
  const { parse } = await import("smol-toml");
  const { EmailModule } = await import("../../../email/module/service.ts");
  const { XModule } = await import("../../../x/module/service.ts");
  const { TelegramModule } = await import("../../../telegram/module/service.ts");
  const contact = entity("contact", "Jack", { schemaId: "contacts.person", properties: {} });
  const identity = (id: string, schemaId: string, syncEnabled: boolean, properties: JsonObject = {}) => entityRead(entity(id, id, { schemaId, properties }), entityExtras({ syncEnabled, syncRevision: "0" }));
  const rows = [identity("mail", "email.address", true), identity("x", "x.profile", true),
    identity("tg", "telegram.account", true, { telegram_user_id: 7 }),
    identity("missing-dm", "telegram.account", true, { telegram_user_id: 8 }),
    identity("chat", "telegram.chat", true, { type: "private" }), identity("linkedin", "linkedin.profile", true),
    identity("later", "email.address", true)];
  const links = ["mail", "mail", "x", "tg", "missing-dm", "linkedin"].map((id, i) => link(contact.id, id, "identity", { id: `link${String(i)}` }));
  const graph = mockGraph({
    getEntityFull: async () => ({ entity: contact, links: [...links, link(contact.id, "later", "identity", { id: entityId("retired"), validUntil: "2026-01-01" })] }),
    getEntities: async (ids, options) => rows.filter(row => ids.includes(row.entity.id)).map(row => options?.extras ? row : row.entity),
    getEntity: async (id, options) => { const row = rows.find(row => row.entity.id === id); return row === undefined ? null : options?.extras ? row : row.entity; },
    findByExternalId: async externalId => externalId === "tg:chat:7" ? entityId("chat") : null,
    updateEntitySyncEnabled: async params => {
      const row = rows.find(row => row.entity.id === params.id);
      if (!row || row.extras.syncRevision === null) throw new Error("missing target state");
      if (row.extras.syncEnabled !== params.syncEnabled) { row.extras.syncEnabled = params.syncEnabled; row.extras.syncRevision = String(Number(row.extras.syncRevision) + 1); }
      return { syncRevision: row.extras.syncRevision };
    },
    syncState: syncStateDouble(),
  });
  const email = await mountModule(EmailModule, { mode: "dispatch", graph, ctx: { extensionId: "email" } });
  const x = await mountModule(XModule, { mode: "dispatch", graph, ctx: { extensionId: "x" } });
  const telegram = await mountModule(TelegramModule, { mode: "dispatch", graph, ctx: { extensionId: "telegram" } });
  const manifest = parse(readFileSync(new URL("../../manifest.toml", import.meta.url), "utf8"));
  const permissions = manifest.permissions;
  const calls: string[] = [];
  const contacts = await mountModule(ContactsModule, { mode: "dispatch", graph, ctx: { extensionId: "contacts" }, rpc: { execute: async (method, params) => {
    if (typeof permissions !== "object" || Array.isArray(permissions) || permissions === null || !("call" in permissions)
      || !Array.isArray(permissions.call) || !permissions.call.includes(method)) throw new Error(`undeclared call ${method}`);
    calls.push(method);
    const owner = method.startsWith("email.") ? email : method.startsWith("x.") ? x : telegram;
    return owner.rpc(method, params as JsonValue);
  } } });
  expect(contacts.tools.find(tool => tool.name === "contacts.person.setSyncEnabled")).toMatchObject({ requiresApproval: true });
  expect(await contacts.rpc("contacts.person.setSyncEnabled", { id: entityId("contact"), syncEnabled: false })).toEqual({ results: [
    { identityId: entityId("mail"), targetId: entityId("mail"), kind: "saved", syncEnabled: false, syncRevision: "1", application: { kind: "pending" } },
    { identityId: entityId("x"), targetId: entityId("x"), kind: "saved", syncEnabled: false, syncRevision: "1", application: { kind: "pending" } },
    { identityId: entityId("tg"), targetId: entityId("chat"), kind: "saved", syncEnabled: false, syncRevision: "1", application: { kind: "pending" } },
    { identityId: entityId("missing-dm"), targetId: null, kind: "failed", message: "Telegram identity has no stored direct chat" },
  ] });
  expect(calls).toEqual(["email.address.setSyncEnabled", "x.profile.setSyncEnabled", "telegram.account.setSyncEnabled", "telegram.account.setSyncEnabled"]);
  expect(contact.properties).toEqual({});
  expect(rows.find(row => row.entity.id === entityId("later"))?.extras.syncEnabled).toBe(true);
  links.push(link(contact.id, "later", "identity", { id: entityId("new") }));
  // A subsequent explicit action includes the new identity; repeating Stop does not reset old revisions.
  await contacts.rpc("contacts.person.setSyncEnabled", { id: entityId("contact"), syncEnabled: false });
  expect(rows.find(row => row.entity.id === entityId("later"))?.extras.syncEnabled).toBe(false);
  expect(rows.find(row => row.entity.id === entityId("mail"))?.extras.syncRevision).toBe("1");
  expect(rows.find(row => row.entity.id === entityId("linkedin"))?.extras.syncEnabled).toBe(true);
});

it("projects sync choices from active identities and an existing Telegram DM without inventing missing state", async () => {
  const contact = entity("contact", "Alice", { schemaId: "contacts.person", properties: {} });
  const rows = [
    entityRead(entity("mail", "Alice email", { schemaId: "email.address" }), entityExtras({ syncEnabled: false, syncRevision: "2" })),
    entityRead(entity("x", "Alice X", { schemaId: "x.profile" }), entityExtras({ syncEnabled: true, syncRevision: "0" })),
    entityRead(entity("tg", "Alice Telegram", { schemaId: "telegram.account", properties: { telegram_user_id: 7 } }), entityExtras()),
    entityRead(entity("no-dm", "Bob", { schemaId: "telegram.account", properties: { telegram_user_id: 8 } }), entityExtras()),
    entityRead(entity("pending", "Pending migration", { schemaId: "email.address" }), entityExtras()),
  ];
  const chat = entityRead(entity("chat", "Alice DM", { schemaId: "telegram.chat", properties: { type: "private" } }), entityExtras({ syncEnabled: true, syncRevision: "3" }));
  const graph = mockGraph({
    getEntityFull: async () => ({ entity: contact, extras: entityExtras(), links: [...rows.map(row => link(contact.id, row.entity.id, "identity", { id: row.entity.id })),
      link(contact.id, "old", "identity", { id: entityId("retired"), validUntil: "2026-01-01" })] }),
    getEntities: async ids => [...rows, entityRead(entity("old", "Old", { schemaId: "x.profile" }), entityExtras())].filter(row => ids.includes(row.entity.id)),
    listLinksForEntities: async () => [],
    findByExternalId: async externalId => externalId === "tg:chat:7" ? entityId("chat") : null,
    getEntity: async () => chat,
  });
  const { module } = mountModule(ContactsModule, { graph });
  expect((await module.get({ id: entityId("contact") })).syncTargets).toEqual([
    { identityId: entityId("mail"), schemaId: "email.address", name: "Alice email", state: { kind: "ready", id: entityId("mail"), syncEnabled: false, syncRevision: "2" } },
    { identityId: entityId("x"), schemaId: "x.profile", name: "Alice X", state: { kind: "ready", id: entityId("x"), syncEnabled: true, syncRevision: "0" } },
    { identityId: entityId("tg"), schemaId: "telegram.account", name: "Alice Telegram", state: { kind: "ready", id: entityId("chat"), syncEnabled: true, syncRevision: "3" } },
    { identityId: entityId("no-dm"), schemaId: "telegram.account", name: "Bob", state: { kind: "unavailable", message: "Telegram identity has no stored direct chat" } },
    { identityId: entityId("pending"), schemaId: "email.address", name: "Pending migration", state: { kind: "unavailable", message: "Identity target has no saved synchronization choice" } },
  ]);
});

it("retains successful fanout results when a later owner call fails", async () => {
  const rows = [entity("mail", "Mail", { schemaId: "email.address" }), entity("x", "X", { schemaId: "x.profile" })];
  const graph = mockGraph({
    getEntityFull: async () => ({ entity: entity("c", "C", { schemaId: "contacts.person" }), links: rows.map(row => link("c", row.id, "identity", { id: row.id })) }),
    getEntities: async () => rows,
  });
  const saved = { identityId: entityId("mail"), targetId: entityId("mail"), kind: "saved", syncEnabled: false, syncRevision: "4", application: { kind: "failed", message: "Worker unavailable" } };
  const contacts = await mountModule(ContactsModule, { mode: "dispatch", graph, ctx: { extensionId: "contacts" }, rpc: { execute: async method => {
    if (method === "email.address.setSyncEnabled") return { results: [saved] };
    throw new Error("X module unavailable");
  } } });
  expect(await contacts.rpc("contacts.person.setSyncEnabled", { id: entityId("c"), syncEnabled: false })).toEqual({ results: [saved,
    { identityId: entityId("x"), targetId: null, kind: "failed", message: "X module unavailable" },
  ] });
});
