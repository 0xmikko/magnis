import { describe, expect, it } from "vitest";

import type { SourceStatusListResponse } from "@magnis/client-core";

import { googleSourceConnected } from "../sourceStatus";

const GOOGLE_ACCOUNT = {
  account_id: "google-account",
  display: "owner@example.com",
  state: {
    state: "connected",
    auth: {
      kind: "oauth",
      connection_id: "google-connection",
      subject: "owner@example.com",
    },
    since: "2026-08-12T00:00:00Z",
  },
  surfaces: [],
} as const;

describe("email source-status adapter", () => {
  /**
   * @test-id: tst_plugin_emailstatus_001
   * @scenario: scn_api_del_001
   * @covers: plugins/modules/email/ui/sourceStatus.ts::googleSourceConnected
   * @deterministic: fixed source-status response
   */
  it("tst_plugin_emailstatus_001 returns false without a Google account", () => {
    const response = {
      sources: [{ source_id: "google", kind: "oauth2", accounts: [] }],
    } satisfies SourceStatusListResponse;

    expect(googleSourceConnected(response)).toBe(false);
  });

  /**
   * @test-id: tst_plugin_emailstatus_002
   * @scenario: scn_api_del_001
   * @covers: plugins/modules/email/ui/sourceStatus.ts::googleSourceConnected
   * @deterministic: fixed source-status response
   */
  it("tst_plugin_emailstatus_002 returns true for a connected Google account", () => {
    const response = {
      sources: [{ source_id: "google", kind: "oauth2", accounts: [GOOGLE_ACCOUNT] }],
    } satisfies SourceStatusListResponse;

    expect(googleSourceConnected(response)).toBe(true);
  });

  /**
   * @test-id: tst_plugin_emailstatus_003
   * @scenario: scn_api_del_001
   * @covers: plugins/modules/email/ui/sourceStatus.ts::googleSourceConnected
   * @deterministic: fixed source-status response
   */
  it("tst_plugin_emailstatus_003 returns false for auth-lost Google accounts", () => {
    const response = {
      sources: [
        {
          source_id: "google",
          kind: "oauth2",
          accounts: [
            {
              ...GOOGLE_ACCOUNT,
              state: {
                state: "auth_lost",
                reason: { reason: "oauth_revoked" },
                since: "2026-08-12T00:00:00Z",
                repair: "reconnect_oauth",
              },
            },
          ],
        },
      ],
    } satisfies SourceStatusListResponse;

    expect(googleSourceConnected(response)).toBe(false);
  });
});
