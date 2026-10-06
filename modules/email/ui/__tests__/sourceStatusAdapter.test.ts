import { describe, expect, it } from "vitest";

import type { SourceStatus, SourceStatusListResponse } from "@magnis/sdk";

import { googleSourceConnected } from "../sourceStatus";

type SourceAccount = SourceStatus["accounts"][number];

const GOOGLE_ACCOUNT = {
  accountId: "google-account",
  displayName: "owner@example.com",
  providerAccountId: "owner@example.com",
  authKind: "oauth2",
  generation: 1,
  invalidReason: null,
  credential: { state: "ready", kind: "minted", revision: 1 },
  runtime: { state: "ready" },
  surfaces: [],
  lifecycle: "connected",
  repair: null,
} satisfies SourceAccount;

const GOOGLE = {
  sourceId: "google",
  displayName: "Google",
  availability: { state: "active", packageHash: "sha256:google" },
} as const;

describe("email source-status adapter", () => {
  /**
   * @test-id: tst_plugin_emailstatus_001
   * @scenario: scn_api_del_001
   * @covers: modules/email/ui/sourceStatus.ts::googleSourceConnected
   * @deterministic: fixed source-status response
   */
  it("tst_plugin_emailstatus_001 returns false without a Google account", () => {
    const response = {
      sources: [{ ...GOOGLE, accounts: [] }],
    } satisfies SourceStatusListResponse;

    expect(googleSourceConnected(response)).toBe(false);
  });

  /**
   * @test-id: tst_plugin_emailstatus_002
   * @scenario: scn_api_del_001
   * @covers: modules/email/ui/sourceStatus.ts::googleSourceConnected
   * @deterministic: fixed source-status response
   */
  it("tst_plugin_emailstatus_002 returns true for a connected Google account", () => {
    const response = {
      sources: [{ ...GOOGLE, accounts: [GOOGLE_ACCOUNT] }],
    } satisfies SourceStatusListResponse;

    expect(googleSourceConnected(response)).toBe(true);
  });

  /**
   * @test-id: tst_plugin_emailstatus_003
   * @scenario: scn_api_del_001
   * @covers: modules/email/ui/sourceStatus.ts::googleSourceConnected
   * @deterministic: fixed source-status response
   */
  it("tst_plugin_emailstatus_003 returns false for auth-lost Google accounts", () => {
    const response = {
      sources: [
        {
          ...GOOGLE,
          accounts: [{ ...GOOGLE_ACCOUNT, lifecycle: "authRequired", repair: "reconnectOauth" }],
        },
      ],
    } satisfies SourceStatusListResponse;

    expect(googleSourceConnected(response)).toBe(false);
  });
});
