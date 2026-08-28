import { describe, expect, test } from "bun:test";

import {
  accountCompatibilityHash,
  certificationReference,
  decodeSourceCertificationReceipt,
  encodeSourceCertificationReceipt,
  v1ReceiverInterfaceContract,
  v1ReceiverInterfaceHash,
  type SourceAccountCompatibilityInput,
} from "../receipt";
import type { SourceCertificationReceipt } from "@magnis/connector-sdk";

const PACKAGE_HASH = `sha256:${"a".repeat(64)}`;
const DEFINITION_HASH = `sha256:${"b".repeat(64)}`;
const CAPABILITIES_HASH = `sha256:${"c".repeat(64)}`;
const IMPLEMENTATION_HASH = `sha256:${"d".repeat(64)}`;

function compatibilityInput(): SourceAccountCompatibilityInput {
  return {
    auth: "oauth2",
    identityRule: "verified_provider_subject",
    credentialKeys: ["client_id", "client_secret", "refresh_token"],
    mintedCredentialKeys: ["refresh_token"],
    surfaces: [
      {
        name: "contacts",
        cursorTerminalNull: "clear",
        progress: {
          target: "full_snapshot",
          continuation: "opaque_cursor",
          forwardCheckpoint: "opaque_cursor",
          coverage: "snapshot",
          liveFence: "none",
        },
        receiverInterfaceHash: `sha256:${"1".repeat(64)}`,
      },
      {
        name: "email",
        cursorTerminalNull: "retain",
        progress: {
          target: "forward_and_backfill",
          continuation: "opaque_cursor",
          forwardCheckpoint: "opaque_cursor",
          coverage: "range",
          liveFence: "none",
        },
        receiverInterfaceHash: `sha256:${"2".repeat(64)}`,
      },
    ],
  };
}

function receipt(): SourceCertificationReceipt {
  return {
    packageHash: PACKAGE_HASH,
    sourceId: "google",
    protocol: "magnis.source/1",
    definitionHash: DEFINITION_HASH,
    accountCompatibility: {
      hash: accountCompatibilityHash(compatibilityInput()),
      migratesFrom: [],
    },
    authority: "module_sync",
    releaseTier: "production",
    delivery: "poll",
    auth: "oauth2",
    surfaces: ["contacts", "email"],
    advertisedTools: ["magnis.sync.fetch"],
    callableOperations: ["initialize", "magnis.auth.exchange", "magnis.sync.fetch"],
    initialize: {
      mcpProtocolVersion: "2025-06-18",
      serverInfoName: "google",
      serverInfoVersion: "1.0.0",
      capabilitiesHash: CAPABILITIES_HASH,
    },
    interfaceHashes: [],
    runtime: {
      kind: "connector_sdk",
      implementationHash: IMPLEMENTATION_HASH,
      version: "0.1.0",
    },
    scenarioIds: ["scn_google_v1_001"],
    certifierVersion: "1",
    testkitVersion: "1",
    matrixVersion: "v1",
  };
}

/**
 * @test-id: tst_cat_src_receipt_001
 * @scenario: scn_src_certification_receipt_001
 * @covers: packages/testkit/receipt.ts
 * @deterministic: yes
 * @fixtures: inline canonical receipt and account-compatibility inputs
 *
 * Test environment: in-process strict receipt codec and hash algebra.
 * Clients: direct function calls.
 * Mocks: none.
 * Data: fixed sha256 values and structural v1 compatibility contracts.
 */
describe("tst_cat_src_receipt_001", () => {
  test("an exact complete v1 receipt has stable bytes and an external index reference", () => {
    const exact = receipt();
    const bytes = encodeSourceCertificationReceipt(exact);
    const decoded = decodeSourceCertificationReceipt(bytes, {
      packageHash: PACKAGE_HASH,
      definitionHash: DEFINITION_HASH,
    });

    expect(decoded).toEqual(exact);
    expect(encodeSourceCertificationReceipt(decoded)).toBe(bytes);
    expect(certificationReference(decoded)).toEqual({
      path: `receipts/${PACKAGE_HASH}.json`,
      sha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
  });

  test("receipt binding rejects a package or definition hash mismatch", () => {
    const bytes = encodeSourceCertificationReceipt(receipt());

    expect(() =>
      decodeSourceCertificationReceipt(bytes, {
        packageHash: `sha256:${"e".repeat(64)}`,
        definitionHash: DEFINITION_HASH,
      }),
    ).toThrow("receipt packageHash does not match staged package");
    expect(() =>
      decodeSourceCertificationReceipt(bytes, {
        packageHash: PACKAGE_HASH,
        definitionHash: `sha256:${"f".repeat(64)}`,
      }),
    ).toThrow("receipt definitionHash does not match staged definition");
  });

  test("receipt decoding rejects incomplete declarations and illegal authority combinations", () => {
    const incomplete = JSON.parse(encodeSourceCertificationReceipt(receipt())) as Record<string, unknown>;
    delete incomplete["scenarioIds"];
    expect(() => decodeSourceCertificationReceipt(JSON.stringify(incomplete))).toThrow(
      "receipt has invalid keys",
    );

    const toolsOnly = { ...receipt(), authority: "tools_only", auth: "oauth2" };
    expect(() => encodeSourceCertificationReceipt(toolsOnly as SourceCertificationReceipt)).toThrow(
      "tools_only receipt must declare auth=null, delivery=none and no surfaces",
    );
  });

  test("account compatibility hashing is order-normalized and changes with account meaning", () => {
    const input = compatibilityInput();
    const reordered: SourceAccountCompatibilityInput = {
      ...input,
      credentialKeys: [...input.credentialKeys].reverse(),
      surfaces: [...input.surfaces].reverse(),
    };

    expect(accountCompatibilityHash(reordered)).toBe(accountCompatibilityHash(input));
    expect(accountCompatibilityHash({ ...input, identityRule: "email_claim" })).not.toBe(
      accountCompatibilityHash(input),
    );
    expect(accountCompatibilityHash({
      ...input,
      surfaces: input.surfaces.map((surface) => ({
        ...surface,
        progress: { ...surface.progress, liveFence: "subscription_ack" },
      })),
    })).not.toBe(accountCompatibilityHash(input));
  });

  test("v1 receiver and progress compatibility have one stable structural golden", () => {
    expect(v1ReceiverInterfaceContract("email")).toEqual({
      envelope: "magnis.source/1",
      receiver: "magnis.sync.receiver/email",
      version: "1",
    });
    expect(v1ReceiverInterfaceHash("email")).toBe(
      "sha256:0d6480cd0a2d5bd3960e1ec902c825a73203e76aa0ef576a37836759acc9c193",
    );
    expect(accountCompatibilityHash(compatibilityInput())).toBe(
      "sha256:101989d1d10f5188b2ab6c5df248493b718196e0c903ed71714178efb11d047a",
    );
  });
});
