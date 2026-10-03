/**
 * `reachedEndpoints` is public SDK surface now, so its two contested behaviours
 * get their own coverage: direction labelling, and which pass wins when the same
 * endpoint is reached twice under DIFFERENT labels. The module tests exercise it
 * through contacts and telegram, but there the duplicate endpoint carries the
 * same kind in both passes, so ordering is unproven there by construction.
 *
 * @layer: pkg_sdk
 * @test-id: tst_pkg_sdk_endpoints_001
 * @scenario: scn_plugin_sdk_001
 * @covers packages/plugin-sdk/index.ts::reachedEndpoints
 * @deterministic pure function; no clock, no IO
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Entity, Link } from "@magnis/sdk";
import { describe, expect, it } from "vitest";
import { linkedEntitySummary, reachedEndpoints } from "../index.ts";

function link(from: string, to: string, kind: string, validUntil: string | null = null): Link {
  return {
    id: `${from}-${to}-${kind}`,
    owner: "u1",
    from,
    to,
    kind,
    createdAt: "2026-01-01T00:00:00Z",
    origin: "canonical",
    metadata: {},
    validFrom: null,
    validUntil,
  };
}

describe("tst_pkg_sdk_endpoints_001 — reachedEndpoints", () => {
  it("labels outgoing bare and incoming with a tilde", () => {
    const reached = reachedEndpoints(
      [
        {
          links: [link("self", "out", "in_chat"), link("watcher", "self", "watches")],
          ownerIds: new Set(["self"]),
        },
      ],
      new Set(["self"]),
    );

    expect(reached.get("out")?.linkKind).toBe("in_chat");
    expect(reached.get("watcher")?.linkKind).toBe("~watches");
  });

  it("the FIRST pass to reach an endpoint supplies its label", () => {
    // The same endpoint, reached with a different kind in each pass. A helper
    // that let the later pass overwrite would return `~identity` here, and a
    // contact would report its own relation using its replica's label.
    const reached = reachedEndpoints(
      [
        { links: [link("hub", "shared", "works_at")], ownerIds: new Set(["hub"]) },
        { links: [link("replica", "shared", "identity")], ownerIds: new Set(["replica"]) },
      ],
      new Set(["hub"]),
    );

    expect(reached.get("shared")?.linkKind).toBe("works_at");
    // Only the endpoint. `replica` is pass two's OWNER, never its own neighbour.
    expect([...reached.keys()]).toEqual(["shared"]);
  });

  it("excludes every id it is told to, from any pass", () => {
    const reached = reachedEndpoints(
      [
        { links: [link("hub", "addr", "identity")], ownerIds: new Set(["hub"]) },
        // The replica's edge back to the hub: the hub is not its own neighbour.
        { links: [link("addr", "hub", "identity")], ownerIds: new Set(["addr"]) },
      ],
      new Set(["hub"]),
    );

    expect([...reached.keys()]).toEqual(["addr"]);
  });
});

/**
 * @test-id: tst_cat_entity_one_type_001
 * @scenario: scn_plugin_sdk_001
 * @covers packages/plugin-sdk/index.ts::reachedEndpoints
 * @covers packages/plugin-sdk/index.ts::linkedEntitySummary
 * @deterministic pure functions; no clock, no IO
 *
 * A linked summary is the SDK `LinkedEntitySummary`: its statement fields come
 * from the link that reached the endpoint, so an agent's guess reads as one.
 */
describe("tst_cat_entity_one_type_001 — linked summaries carry the reaching link's statement", () => {
  const watcher: Entity = {
    id: "watcher",
    owner: "u1",
    schemaId: "contacts.person",
    schemaVersion: 1,
    createdAt: "2026-01-02T00:00:00Z",
    name: "Watcher",
    indexed: false,
    date: "2026-01-02T00:00:00Z",
    idx: null,
    isPinned: null,
    pinOrder: null,
    isArchived: null,
    properties: {},
    origin: "canonical",
    source: { source: "google", account: "a1", externalId: "people/1" },
  };

  it("tst_cat_entity_one_type_001 an endpoint keeps the agent link that reached it, statement included", () => {
    const guess: Link = {
      id: "l-guess",
      owner: "u1",
      from: "watcher",
      to: "self",
      kind: "mentions",
      createdAt: "2026-01-03T00:00:00Z",
      origin: "agent",
      confidence: 0.6,
      evidence: ["episode-1"],
      validFrom: null,
      validUntil: "2027-01-01T00:00:00Z",
    };
    const reached = reachedEndpoints([{ links: [guess], ownerIds: new Set(["self"]) }], new Set(["self"]));

    expect(reached.get("watcher")).toEqual({ link: guess, linkKind: "~mentions" });
    expect(linkedEntitySummary(watcher, guess, "~mentions")).toEqual({
      id: "watcher",
      name: "Watcher",
      schemaId: "contacts.person",
      linkKind: "~mentions",
      createdAt: "2026-01-02T00:00:00Z",
      origin: "agent",
      confidence: 0.6,
      validUntil: "2027-01-01T00:00:00Z",
    });
  });

  it("tst_cat_entity_one_type_001 a canonical link's summary has no confidence and keeps its end", () => {
    const record = link("self", "watcher", "member_of", "2026-06-01T00:00:00Z");

    expect(linkedEntitySummary(watcher, record, "member_of")).toEqual({
      id: "watcher",
      name: "Watcher",
      schemaId: "contacts.person",
      linkKind: "member_of",
      createdAt: "2026-01-02T00:00:00Z",
      origin: "canonical",
      confidence: null,
      validUntil: "2026-06-01T00:00:00Z",
    });
  });
});

/**
 * @test-id: tst_cat_entity_one_type_007
 * @scenario: scn_plugin_sdk_001
 * @covers packages/host-stubs/types/packages/sdk/rpc/contract.d.ts
 * @deterministic reads the committed stub declarations; no clock, no network
 *
 * plugin-sdk compiles against the host's SDK through `@magnis/host-stubs`. The
 * host deleted its wire codec, so stubs that still declare `RpcWireCodec` were
 * generated before the host's final contract and type the catalog against a
 * wire the host no longer speaks.
 */
describe("tst_cat_entity_one_type_007 — host stubs match the host's final contract", () => {
  it("tst_cat_entity_one_type_007 no host stub declaration names RpcWireCodec", () => {
    const stubRoot = fileURLToPath(new URL("../../host-stubs/types/", import.meta.url));
    const declarations = readdirSync(stubRoot, { recursive: true, encoding: "utf8" }).filter((path) =>
      path.endsWith(".d.ts"),
    );
    const naming = declarations.filter((path) => /\bRpcWireCodec\b/.test(readFileSync(join(stubRoot, path), "utf8")));

    expect(declarations.length).toBeGreaterThan(0);
    expect(naming).toEqual([]);
  });
});
