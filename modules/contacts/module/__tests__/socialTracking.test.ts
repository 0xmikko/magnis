/**
 * @layer: module
 * @test-id: tst_module_contacts_tracking_read_001
 * @scenario: scn_compact_removed_workflows_001
 * @covers: modules/contacts/module/service.ts::get_social_tracking_by_handle,list_social_tracking,rename_if_placeholder
 * @deterministic: yes
 * @fixtures: stored tracked and untracked contacts
 */
import { describe, expect, it } from "vitest";
import { entity, mockGraph, mountModule } from "@magnis/testkit/module";
import { ContactsModule } from "../service.ts";

describe("retained social ingestion reads", () => {
  const tracked = entity("p1", "jack", { schema_id: "contacts.person", properties: {
    tracking: [{ platform: "x", handle: "Jack", enabled: true }],
  }});
  const untracked = entity("p2", "Ann", { schema_id: "contacts.person", properties: {
    tracking: [{ platform: "linkedin", handle: "ann", enabled: false }],
  }});
  it("reads existing tracking without exposing write workflows", async () => {
    const graph = mockGraph({
      get_entity: async () => tracked,
      list_entities_window: async () => ({ items: [tracked, untracked].map(entity => ({ entity, data: null })), total: 2 }),
    });
    const { module } = mountModule(ContactsModule, { graph });
    for (const name of ["set_social_tracking", "track_social_profile", "batch_track_social"]) expect(name in module).toBe(false);
    expect(await module.get_social_tracking_by_handle({ platform: "x", handle: "jack" })).toMatchObject({ contact_id: "p1", tracked: true });
    expect(await module.get_social_tracking_by_handle({ platform: "linkedin", handle: "ann" })).toMatchObject({ contact_id: "p2", tracked: false });
    expect(await module.get_social_tracking_by_handle({ platform: "x", handle: "missing" })).toBeNull();
    expect(await module.list_social_tracking({ platform: "x" })).toMatchObject([{ contact_id: "p1", handle: "Jack" }]);
    expect(await module.list_social_tracking({ platform: "linkedin" })).toEqual([]);
  });
  it("renames only an unchanged placeholder during profile ingestion", async () => {
    const graph = mockGraph({ get_entity: async () => tracked, update_entity_name: async () => undefined });
    const { module } = mountModule(ContactsModule, { graph });
    expect(await module.rename_if_placeholder({ id: "p1", expected_name: "jack", new_name: "Jack Smith" })).toEqual({ renamed: true });
    expect(await module.rename_if_placeholder({ id: "p1", expected_name: "other", new_name: "Wrong" })).toEqual({ renamed: false });
    expect(graph.spies.update_entity_name).toHaveBeenCalledExactlyOnceWith("p1", "Jack Smith");
  });
});

it("removes only a committed X migration entry and preserves LinkedIn", async () => {
  const contact = entity("contact", "Jack", { schema_id: "contacts.person", properties: { tracking: [
    { platform: "x", handle: "Jack", enabled: false }, { platform: "linkedin", handle: "jack", enabled: true },
  ] } });
  const profile = { ...entity("profile", "Jack", { schema_id: "x.profile", anchor: "x:profile:12", properties: { handle: "jack" } }), syncEnabled: true, syncRevision: "0" };
  let linked = false;
  const graph = mockGraph({
    get_entity_full: async () => ({ entity: contact, links: linked ? [{ id: "link", from_id: "contact", to_id: "profile", kind: "identity", validUntil: null, metadata: {} }] : [] }),
    get_entity: async () => profile,
    update_properties: async (params) => { contact.properties = { ...contact.properties, ...params.properties }; },
  });
  const mounted = await mountModule(ContactsModule, { mode: "dispatch", graph, ctx: { extension_id: "contacts" } });
  const params = { contactId: "contact", profileId: "profile", handle: "jack", enabled: false };
  await expect(mounted.rpc("completeXSyncMigration", params)).rejects.toThrow();
  expect(graph.spies.update_properties).not.toHaveBeenCalled();
  linked = true;
  profile.properties = { handle: "someone_else" };
  await expect(mounted.rpc("completeXSyncMigration", params)).rejects.toThrow("identity does not match");
  expect(graph.spies.update_properties).not.toHaveBeenCalled();
  profile.properties = { handle: "jack" };
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
  const contact = entity("contact", "Jack", { schema_id: "contacts.person", properties: {} });
  const identity = (id: string, schemaId: string, syncEnabled: boolean, properties = {}) => ({ ...entity(id, id, { schema_id: schemaId, properties }), syncEnabled, syncRevision: "0" });
  const rows = [identity("mail", "email.address", true), identity("x", "x.profile", true),
    identity("tg", "telegram.account", true, { telegram_user_id: 7 }),
    identity("missing-dm", "telegram.account", true, { telegram_user_id: 8 }),
    identity("chat", "telegram.chat", true, { type: "private" }), identity("linkedin", "linkedin.profile", true),
    identity("later", "email.address", true)];
  const links = ["mail", "mail", "x", "tg", "missing-dm", "linkedin"].map((id, i) => ({ id: `link${String(i)}`, from_id: contact.id, to_id: id, kind: "identity", validUntil: null, metadata: {} }));
  const graph = mockGraph({
    get_entity_full: async () => ({ entity: contact, links: [...links, { id: "retired", from_id: contact.id, to_id: "later", kind: "identity", validUntil: "2026-01-01", metadata: {} }] }),
    get_entities: async ids => rows.filter(row => ids.includes(row.id)),
    get_entity: async id => rows.find(row => row.id === id) ?? null,
    find_by_anchor: async anchor => anchor === "tg:chat:7" ? "chat" : null,
    updateEntitySyncEnabled: async params => {
      const row = rows.find(row => row.id === params.id);
      if (!row) throw new Error("missing target");
      if (row.syncEnabled !== params.syncEnabled) { row.syncEnabled = params.syncEnabled; row.syncRevision = String(Number(row.syncRevision) + 1); }
      return { syncRevision: row.syncRevision };
    },
    syncState: async () => ({ pending: true }),
  });
  const email = await mountModule(EmailModule, { mode: "dispatch", graph, ctx: { extension_id: "email" } });
  const x = await mountModule(XModule, { mode: "dispatch", graph, ctx: { extension_id: "x" } });
  const telegram = await mountModule(TelegramModule, { mode: "dispatch", graph, ctx: { extension_id: "telegram" } });
  const manifest = parse(readFileSync(new URL("../../manifest.toml", import.meta.url), "utf8"));
  const permissions = manifest.permissions;
  const calls: string[] = [];
  const contacts = await mountModule(ContactsModule, { mode: "dispatch", graph, ctx: { extension_id: "contacts" }, rpc: { execute: async (method, params) => {
    if (typeof permissions !== "object" || Array.isArray(permissions) || permissions === null || !("call" in permissions)
      || !Array.isArray(permissions.call) || !permissions.call.includes(method)) throw new Error(`undeclared call ${method}`);
    calls.push(method);
    const owner = method.startsWith("email.") ? email : method.startsWith("x.") ? x : telegram;
    return owner.rpc(method, params);
  } } });
  expect(contacts.tools.find(tool => tool.name === "contacts.person.setSyncEnabled")).toMatchObject({ requires_approval: true });
  expect(await contacts.rpc("contacts.person.setSyncEnabled", { id: "contact", syncEnabled: false })).toEqual({ results: [
    { identityId: "mail", targetId: "mail", kind: "saved", syncEnabled: false, syncRevision: "1", application: { kind: "pending" } },
    { identityId: "x", targetId: "x", kind: "saved", syncEnabled: false, syncRevision: "1", application: { kind: "pending" } },
    { identityId: "tg", targetId: "chat", kind: "saved", syncEnabled: false, syncRevision: "1", application: { kind: "pending" } },
    { identityId: "missing-dm", targetId: null, kind: "failed", message: "Telegram identity has no stored direct chat" },
  ] });
  expect(calls).toEqual(["email.address.setSyncEnabled", "x.profile.setSyncEnabled", "telegram.account.setSyncEnabled", "telegram.account.setSyncEnabled"]);
  expect(contact.properties).toEqual({});
  expect(rows.find(row => row.id === "later")?.syncEnabled).toBe(true);
  links.push({ id: "new", from_id: contact.id, to_id: "later", kind: "identity", validUntil: null, metadata: {} });
  // A subsequent explicit action includes the new identity; repeating Stop does not reset old revisions.
  await contacts.rpc("contacts.person.setSyncEnabled", { id: "contact", syncEnabled: false });
  expect(rows.find(row => row.id === "later")?.syncEnabled).toBe(false);
  expect(rows.find(row => row.id === "mail")?.syncRevision).toBe("1");
  expect(rows.find(row => row.id === "linkedin")?.syncEnabled).toBe(true);
});

it("projects sync choices from active identities and an existing Telegram DM without inventing missing state", async () => {
  const contact = entity("contact", "Alice", { schema_id: "contacts.person", properties: {} });
  const rows = [
    { ...entity("mail", "Alice email", { schema_id: "email.address" }), syncEnabled: false, syncRevision: "2" },
    { ...entity("x", "Alice X", { schema_id: "x.profile" }), syncEnabled: true, syncRevision: "0" },
    entity("tg", "Alice Telegram", { schema_id: "telegram.account", properties: { telegram_user_id: 7 } }),
    entity("no-dm", "Bob", { schema_id: "telegram.account", properties: { telegram_user_id: 8 } }),
    entity("pending", "Pending migration", { schema_id: "email.address" }),
  ];
  const chat = { ...entity("chat", "Alice DM", { schema_id: "telegram.chat", properties: { type: "private" } }), syncEnabled: true, syncRevision: "3" };
  const graph = mockGraph({
    get_entity_full: async () => ({ entity: contact, links: [...rows.map(row => ({ id: row.id, from_id: contact.id, to_id: row.id, kind: "identity", validUntil: null, metadata: {} })),
      { id: "retired", from_id: contact.id, to_id: "old", kind: "identity", validUntil: "2026-01-01", metadata: {} }] }),
    get_entities: async ids => [...rows, entity("old", "Old", { schema_id: "x.profile" })].filter(row => ids.includes(row.id)),
    list_links_for_entities: async () => [],
    find_by_anchor: async anchor => anchor === "tg:chat:7" ? "chat" : null,
    get_entity: async () => chat,
  });
  const { module } = mountModule(ContactsModule, { graph });
  expect((await module.get({ id: "contact" })).syncTargets).toEqual([
    { identityId: "mail", schemaId: "email.address", name: "Alice email", state: { kind: "ready", id: "mail", syncEnabled: false, syncRevision: "2" } },
    { identityId: "x", schemaId: "x.profile", name: "Alice X", state: { kind: "ready", id: "x", syncEnabled: true, syncRevision: "0" } },
    { identityId: "tg", schemaId: "telegram.account", name: "Alice Telegram", state: { kind: "ready", id: "chat", syncEnabled: true, syncRevision: "3" } },
    { identityId: "no-dm", schemaId: "telegram.account", name: "Bob", state: { kind: "unavailable", message: "Telegram identity has no stored direct chat" } },
    { identityId: "pending", schemaId: "email.address", name: "Pending migration", state: { kind: "unavailable", message: "Identity target has no saved synchronization choice" } },
  ]);
});

it("retains successful fanout results when a later owner call fails", async () => {
  const rows = [entity("mail", "Mail", { schema_id: "email.address" }), entity("x", "X", { schema_id: "x.profile" })];
  const graph = mockGraph({
    get_entity_full: async () => ({ entity: entity("c", "C", { schema_id: "contacts.person" }), links: rows.map(row => ({ id: row.id, from_id: "c", to_id: row.id, kind: "identity", validUntil: null, metadata: {} })) }),
    get_entities: async () => rows,
  });
  const saved = { identityId: "mail", targetId: "mail", kind: "saved", syncEnabled: false, syncRevision: "4", application: { kind: "failed", message: "Worker unavailable" } };
  const contacts = await mountModule(ContactsModule, { mode: "dispatch", graph, ctx: { extension_id: "contacts" }, rpc: { execute: async method => {
    if (method === "email.address.setSyncEnabled") return { results: [saved] };
    throw new Error("X module unavailable");
  } } });
  expect(await contacts.rpc("contacts.person.setSyncEnabled", { id: "c", syncEnabled: false })).toEqual({ results: [saved,
    { identityId: "x", targetId: null, kind: "failed", message: "X module unavailable" },
  ] });
});
