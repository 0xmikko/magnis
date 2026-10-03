/**
 * @layer: pkg_sdk
 * @test-id: tst_pkg_sdk_graph_001
 * @scenario: scn_google_pull_001
 * @covers: packages/plugin-sdk/contract/module.ts::GraphService
 * @deterministic: yes
 * @fixtures: none
 */
import { expectTypeOf, test } from "vitest";
import type { GraphService } from "../contract/module.ts";

test("tst_pkg_sdk_graph_001 accepts a link kind in listLinksForEntity", () => {
  expectTypeOf<Parameters<GraphService["listLinksForEntity"]>[1]>()
    .toEqualTypeOf<string | undefined>();
});
