import { expect, test } from "vitest";
import { join } from "node:path";

import { AiProviderCatalogDocumentSchema } from "../../host-stubs/types/packages/sdk/core/ai-model.js";
import { readProviderCatalog } from "../../../scripts/build-provider-catalog";
import { BillingDailyRowSchema } from "../../host-stubs/types/packages/sdk/core/billing.js";
import { AiCallAccountingSchema, type AiCallAccounting } from "../../host-stubs/types/packages/sdk/core/ai-model.js";

test("tst_provider_contract_002 released validators preserve unknown usage independently of subscription zero", () => {
  const receipt = { modelId: "native", tokens: null, totalTokens: null, costMicros: 0,
    usageStatus: "unreported", costStatus: "complete", billingMode: "subscription", status: "complete" } satisfies AiCallAccounting;
  expect(AiCallAccountingSchema.parse(receipt)).toEqual(receipt);
  const coverage = { completeCalls: 0, partialCalls: 0, unreportedCalls: 1, legacyCalls: 0 };
  const group = { day: "2026-11-14", provider: "openai", model: "model", tokens: null,
    costMicros: null, callCount: 1, usageCoverage: coverage, costCoverage: coverage };
  expect(BillingDailyRowSchema.parse(group)).toEqual(group);
});

/** Static catalog data cannot select a saved connection or another provider's reader. */
test("tst_provider_contract_001 declared model admission retains provider and connection ownership", () => {
  const document = readProviderCatalog(join(import.meta.dirname, "../../..", "providers"));
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
