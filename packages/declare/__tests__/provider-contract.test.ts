import { expect, test } from "bun:test";
import { join } from "node:path";

import { AiProviderCatalogDocumentSchema } from "../../host-stubs/types/packages/sdk/core/ai-model.js";
import { readProviderCatalog } from "../../../scripts/build-provider-catalog";

/** Static catalog data cannot select a saved connection or another provider's reader. */
test("tst_provider_contract_001 declared model admission retains provider and connection ownership", () => {
  const document = readProviderCatalog(join(import.meta.dir, "../../..", "providers"));
  const entry = document.entries.find(({ provider }) => provider.id === "typesafe");
  if (entry === undefined || entry.models[0] === undefined) throw new Error("TypeSafe model fixture is missing");
  const model = entry.models[0];
  for (const invalid of [
    { ...model, providerConnectionId: "someone-elses-account" },
    { ...model, adapterId: "openai" },
    { ...model, sourceId: "undeclared-reader" },
  ]) {
    expect(AiProviderCatalogDocumentSchema.safeParse({ schemaVersion: 1, entries: [{ ...entry, models: [invalid] }] }).success).toBe(false);
  }
  expect(AiProviderCatalogDocumentSchema.safeParse(document).success).toBe(true);
});
