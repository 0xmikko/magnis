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
import { describe, expect, it } from "vitest";
import { reachedEndpoints, type LinkSummary } from "../index.ts";

function link(from_id: string, to_id: string, kind: string): LinkSummary {
  return { id: `${from_id}-${to_id}-${kind}`, from_id, to_id, kind };
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

    expect(reached.get("out")).toBe("in_chat");
    expect(reached.get("watcher")).toBe("~watches");
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

    expect(reached.get("shared")).toBe("works_at");
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
