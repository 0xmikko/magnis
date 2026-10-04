/**
 * @test-id: tst_module_x_settings_001
 * @scenario: scn_x_sync_001
 * @covers: modules/x/manifest.toml
 * @deterministic: yes
 * @fixtures: the module's own manifest
 *
 * The host reads a module's settings as one `[settings]` table naming its
 * module, with the fields under it; anything else refuses the package.
 */
import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import { expect, it } from "vitest";

it("tst_module_x_settings_001 declares its new-profile rule in the host's settings form", () => {
  const manifest = parse(readFileSync(new URL("../../manifest.toml", import.meta.url), "utf8"));

  // @tested-by: tst_module_x_settings_001
  // @invariant: the rule the module reads through moduleSettings is a field of
  // the one settings table the host accepts.
  expect(manifest.settings).toEqual({
    moduleId: "x",
    label: "X",
    fields: [{
      key: "newProfileSyncEnabled",
      label: "Synchronize newly discovered profiles",
      defaultValue: "false",
      fieldType: { type: "boolean" },
    }],
  });
});
