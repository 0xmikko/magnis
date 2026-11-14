import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readProviderCatalog } from "./build-provider-catalog";

function provider(id: string): string {
  return `id = "${id}"\ndisplayName = "${id}"\nadapterId = "openai-compatible"\nauthKind = "api_key"\nendpoint = "https://example.test/v1"\nrequiresEndpoint = false\ncatalogSourceIds = ["configured-provider"]\n[configuration]\nkind = "model-provider"\n[[configuration.fields]]\nkind = "secret"\nkey = "API_KEY"\nlabel = "API key"\nrequired = true\nenvironment = true\ndelivery = "host_only"\n`;
}

describe("declarative provider catalog", () => {
  test("tst_provider_catalog_001 two definitions share an adapter and build deterministically", () => {
    const root = mkdtempSync(join(tmpdir(), "provider-catalog-"));
    try {
      writeFileSync(join(root, "b.toml"), provider("service-b"));
      writeFileSync(join(root, "a.toml"), provider("service-a"));
      const document = readProviderCatalog(root);
      expect(document.schemaVersion).toBe(1);
      expect(document.entries.map(({ provider }) => [provider.id, provider.adapterId])).toEqual([["service-a", "openai-compatible"], ["service-b", "openai-compatible"]]);
      expect(readProviderCatalog(root)).toEqual(document);
      expect(JSON.stringify(document)).not.toContain("credential");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("tst_provider_catalog_002 duplicate identities and executable or missing metadata are refused", () => {
    const root = mkdtempSync(join(tmpdir(), "provider-catalog-"));
    try {
      writeFileSync(join(root, "a.toml"), provider("duplicate"));
      writeFileSync(join(root, "b.toml"), provider("duplicate"));
      expect(() => readProviderCatalog(root)).toThrow(/unique/);
      rmSync(join(root, "b.toml"));
      writeFileSync(join(root, "a.toml"), provider("valid") + '\ncode = "malicious.js"\n');
      expect(() => readProviderCatalog(root)).toThrow();
      writeFileSync(join(root, "a.toml"), provider("valid").replace('adapterId = "openai-compatible"\n', ""));
      expect(() => readProviderCatalog(root)).toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  test("tst_provider_catalog_003 checked-in metadata uses supported native capabilities and readers", () => {
    const document = readProviderCatalog(join(import.meta.dir, "..", "providers"));
    expect(document.entries.find(({ provider }) => provider.id === "openrouter")?.provider.adapterId).toBe("openai-compatible");
    const typesafe = document.entries.find(({ provider }) => provider.id === "typesafe");
    expect(typesafe?.models.some(({ capability, physicalModelId }) => capability === "decision" && physicalModelId === "jev-1.13.0")).toBe(true);
    expect(document.entries.find(({ provider }) => provider.id === "openai")?.models.map(({ capability }) => capability)).toContain("embedding");
  });
});
