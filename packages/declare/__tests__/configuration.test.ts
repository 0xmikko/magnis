import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { moduleConfigurationFromManifest, sourceConfigurationFromManifest } from "../configuration.ts";

const REPO = join(import.meta.dirname, "../../..");

/**
 * @test-id: tst_cat_configuration_002
 * @scenario: scn_provider_declared_configuration
 * @covers: packages/declare/configuration.ts
 * @deterministic: yes
 * @fixtures: admitted Google/Telegram/Anysite and email manifests
 */
test("tst_cat_configuration_002 declarations preserve deployment and account boundaries", () => {
  for (const id of ["google", "telegram", "anysite"]) {
    const raw = parseToml(readFileSync(join(REPO, "sources", id, "manifest.toml"), "utf8"));
    const declaration = sourceConfigurationFromManifest(raw);
    expect(declaration?.kind).toBe("source");
    if (declaration?.kind !== "source") throw new Error("Missing Source declaration");
    expect(declaration.fields.every(field => field.environment && field.kind === "secret")).toBe(true);
    if (id === "google") expect(declaration.fields.map(field => field.kind === "secret" ? field.key : field.field.key)).toEqual(["client_id", "client_secret"]);
  }
  const ordinary = moduleConfigurationFromManifest(parseToml(readFileSync(join(REPO, "modules", "email", "manifest.toml"), "utf8")));
  expect(ordinary?.kind).toBe("module");
  if (ordinary?.kind !== "module") throw new Error("Missing Module declaration");
  expect(ordinary.schema.fields[0]).toMatchObject({ key: "newSenderSyncEnabled", fieldType: { type: "boolean" }, defaultValue: "true", description: null });

  const field = { kind: "secret", key: "token", label: "Token", required: true, environment: true, delivery: "extension" };
  const source = { id: "example", auth: { type: "oauth2" }, credentials: { keys: ["token"], minted: ["token"] }, configuration: { kind: "source", fields: [field] } };
  expect(() => sourceConfigurationFromManifest(source)).toThrow("deployment credential");
  expect(() => sourceConfigurationFromManifest({ ...source, credentials: { keys: [{ name: "token", label: "Account key" }] } })).toThrow("deployment credential");
  expect(() => sourceConfigurationFromManifest({ ...source, credentials: { keys: ["other"] } })).toThrow("deployment credential");
  expect(() => sourceConfigurationFromManifest({ ...source, configuration: { kind: "source", prefix: "SOURCE_OTHER", fields: [] } })).toThrow();
  expect(() => moduleConfigurationFromManifest({ id: "example", credentials: { keys: ["token"] } })).toThrow("ordinary settings only");
  expect(() => moduleConfigurationFromManifest({ id: "example", settings: { ...ordinary.schema, moduleId: "other" } })).toThrow("admitted module ID");
});
