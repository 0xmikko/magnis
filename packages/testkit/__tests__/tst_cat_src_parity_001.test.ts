import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { parse as parseToml } from "smol-toml";

import {
  ConnectorError,
  CursorExpiredError,
  handleMessage,
  RateLimitError,
  type ConnectorConfig,
  type Envelope,
} from "@magnis/connector-sdk";
import { emitMessage as emitGmailMessage } from "../../../plugins/sources/mock-gmail/src/dataset";
import { sendMessage as sendMockGmailMessage } from "../../../plugins/sources/mock-gmail/src/execute";
import { fetchMockGmail } from "../../../plugins/sources/mock-gmail/src/fetch";
import { fetchMockLinkedIn } from "../../../plugins/sources/mock-linkedin/src/surfaces/linkedin/fetch";
import { emitMessage as emitTelegramMessage } from "../../../plugins/sources/mock-telegram/src/dataset";
import { fetchMockTelegram } from "../../../plugins/sources/mock-telegram/src/fetch";
import { fetchMockX } from "../../../plugins/sources/mock-x/src/surfaces/x/fetch";
import {
  accountCompatibilityHash,
  decodeSourceCertificationReceipt,
  v1ReceiverInterfaceHash,
  type V1CoverageModel,
  type V1ProgressContract,
  type V1ProgressTarget,
} from "../receipt";
import {
  decodeSourceCertificationDeclaration,
  discoverSourceReleaseManifests,
  discoverStagedCatalog,
  mintSourceCertificationReceipt,
  SELECTED_CHANNEL_SOURCE_MATRIX,
} from "../../../scripts/certify-sources";
import { stageSourcePackage } from "../../../scripts/build-catalog-index";

type AuthKind = "api_key" | "oauth2" | "phone_code" | "shared_provider" | null;
type Delivery = "poll" | "push";
type CursorTerminalNull = "retain" | "clear";

interface GoldenSurface {
  name: string;
  cursorTerminalNull: CursorTerminalNull;
  progress: V1ProgressContract;
  receiverInterfaceHash: string;
}

interface GoldenProvider {
  sourceId: string;
  serverInfoName: string;
  serverInfoVersion: string;
  auth: AuthKind;
  delivery: Delivery;
  pollIntervalSecs: number | null;
  advertisedTools: readonly string[];
  callableOperations: readonly string[];
  identityRule: string;
  credentialKeys: readonly string[];
  mintedCredentialKeys: readonly string[];
  migratesFrom: readonly string[];
  surfaces: readonly GoldenSurface[];
}

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const repoRoot = join(import.meta.dir, "../../..");

function surface(
  name: string,
  cursorTerminalNull: CursorTerminalNull,
  target: V1ProgressTarget,
  coverage: V1CoverageModel,
  liveFence: V1ProgressContract["liveFence"] = "none",
): GoldenSurface {
  return {
    name,
    cursorTerminalNull,
    progress: {
      target,
      continuation: "opaque_cursor",
      forwardCheckpoint: "opaque_cursor",
      coverage,
      liveFence,
    },
    receiverInterfaceHash: v1ReceiverInterfaceHash(name),
  };
}

const SDK_TOOLS = ["magnis.sync.fetch"] as const;
const SDK_OPERATIONS = ["initialize", "magnis.sync.fetch", "tools/list"] as const;

const PROVIDER_SCENARIOS: Readonly<Record<string, readonly { id: string; path: string }[]>> = {
  anysite: [
    { id: "tst_li_001", path: "plugins/sources/anysite/src/surfaces/linkedin/fetch.test.ts" },
    { id: "tst_li_004", path: "plugins/sources/anysite/src/surfaces/linkedin/fetch.test.ts" },
  ],
  google: [
    { id: "tst_gts_fx_001", path: "plugins/sources/google/src/__tests__/fixture.test.ts" },
    { id: "tst_gts_hist_008b", path: "plugins/sources/google/src/surfaces/email/gmail.test.ts" },
    { id: "tst_gts_wire_006", path: "plugins/sources/google/src/__tests__/fixture.test.ts" },
  ],
  local: [
    { id: "tst_conn_local_ts_001", path: "plugins/sources/local/src/surfaces/notes/fetch.test.ts" },
    { id: "tst_conn_local_ts_005", path: "plugins/sources/local/src/surfaces/notes/fetch.test.ts" },
  ],
  "mock-gmail": [
    { id: "tst_conn_mockgmail_dataset_001", path: "plugins/sources/mock-gmail/src/dataset.test.ts" },
    { id: "tst_conn_mockgmail_dataset_003", path: "plugins/sources/mock-gmail/src/dataset.test.ts" },
    { id: "tst_conn_mockgmail_ts_001", path: "plugins/sources/mock-gmail/src/fetch.test.ts" },
  ],
  "mock-linkedin": [
    { id: "tst_mockli_001", path: "plugins/sources/mock-linkedin/src/surfaces/linkedin/fetch.test.ts" },
    { id: "tst_mockli_003", path: "plugins/sources/mock-linkedin/src/surfaces/linkedin/fetch.test.ts" },
  ],
  "mock-statemachine-key": [
    { id: "tst_conn_statemock_ts_001", path: "packages/source-statemachine/src/index.test.ts" },
    { id: "tst_conn_statemock_ts_013", path: "packages/source-statemachine/src/index.test.ts" },
  ],
  "mock-statemachine-oauth": [
    { id: "tst_conn_statemock_ts_001", path: "packages/source-statemachine/src/index.test.ts" },
    { id: "tst_conn_statemock_ts_013", path: "packages/source-statemachine/src/index.test.ts" },
  ],
  "mock-statemachine-phone": [
    { id: "tst_cat_src_phone_001", path: "packages/testkit/__tests__/tst_cat_src_parity_001.test.ts" },
    { id: "tst_conn_statemock_ts_001", path: "packages/source-statemachine/src/index.test.ts" },
  ],
  "mock-telegram": [
    { id: "tst_conn_mocktelegram_dataset_001", path: "plugins/sources/mock-telegram/src/dataset.test.ts" },
    { id: "tst_conn_mocktelegram_dataset_002", path: "plugins/sources/mock-telegram/src/dataset.test.ts" },
    { id: "tst_conn_mocktelegram_ts_001", path: "plugins/sources/mock-telegram/src/fetch.test.ts" },
  ],
  "mock-x": [
    { id: "tst_mockx_001", path: "plugins/sources/mock-x/src/surfaces/x/fetch.test.ts" },
    { id: "tst_mockx_003", path: "plugins/sources/mock-x/src/surfaces/x/fetch.test.ts" },
  ],
  telegram: [
    { id: "tst_tgts_flood_wire_002", path: "plugins/sources/telegram/src/surfaces/telegram/execute.test.ts" },
    { id: "tst_tgts_fx_001", path: "plugins/sources/telegram/src/fixture.test.ts" },
    { id: "tst_tgts_wire_012", path: "plugins/sources/telegram/src/fixture.test.ts" },
  ],
  x: [
    { id: "tst_x_001", path: "plugins/sources/x/src/surfaces/x/fetch.test.ts" },
    { id: "tst_x_005", path: "plugins/sources/x/src/surfaces/x/fetch.test.ts" },
    { id: "tst_x_006", path: "plugins/sources/x/src/surfaces/x/fetch.test.ts" },
  ],
};

const GOLDEN_PROVIDERS: readonly GoldenProvider[] = [
  {
    sourceId: "anysite",
    serverInfoName: "anysite",
    serverInfoVersion: "0.1.0",
    auth: "shared_provider",
    delivery: "poll",
    pollIntervalSecs: 600,
    advertisedTools: SDK_TOOLS,
    callableOperations: [...SDK_OPERATIONS, "magnis.auth.probe"],
    identityRule: "verified_provider_subject",
    credentialKeys: ["api_key"],
    mintedCredentialKeys: [],
    migratesFrom: [],
    surfaces: [surface("linkedin", "retain", "forward_and_backfill", "tracked_identity_set")],
  },
  {
    sourceId: "google",
    serverInfoName: "magnis-google",
    serverInfoVersion: "1.0.0",
    auth: "oauth2",
    delivery: "poll",
    pollIntervalSecs: 30,
    advertisedTools: SDK_TOOLS,
    callableOperations: [
      ...SDK_OPERATIONS,
      "magnis.auth.exchange",
      "magnis.auth.revoke",
      "magnis.execute:download_file",
      "magnis.execute:send_message",
    ],
    identityRule: "verified_google_subject",
    credentialKeys: ["client_id", "client_secret", "refresh_token"],
    mintedCredentialKeys: ["refresh_token"],
    migratesFrom: [],
    surfaces: [
      surface("contacts", "clear", "full_snapshot", "snapshot"),
      surface("email", "retain", "forward_and_backfill", "range"),
      surface("meetings", "clear", "bounded_window", "range"),
    ],
  },
  {
    sourceId: "local",
    serverInfoName: "magnis-local",
    serverInfoVersion: "0.1.0",
    auth: null,
    delivery: "poll",
    pollIntervalSecs: 60,
    advertisedTools: SDK_TOOLS,
    callableOperations: SDK_OPERATIONS,
    identityRule: "local_storage_root",
    credentialKeys: [],
    mintedCredentialKeys: [],
    migratesFrom: [],
    surfaces: [surface("notes", "retain", "forward_and_backfill", "range")],
  },
  {
    sourceId: "mock-gmail",
    serverInfoName: "magnis-mock-gmail",
    serverInfoVersion: "0.1.0",
    auth: null,
    delivery: "poll",
    pollIntervalSecs: 5,
    advertisedTools: ["magnis.dataset.invoke", "magnis.sync.fetch"],
    callableOperations: [
      ...SDK_OPERATIONS,
      "magnis.dataset.invoke:emit_meeting",
      "magnis.dataset.invoke:emit_message",
      "magnis.execute:send_message",
    ],
    identityRule: "manifest_account_subject",
    credentialKeys: [],
    mintedCredentialKeys: [],
    migratesFrom: [],
    surfaces: [
      surface("email", "retain", "forward_and_backfill", "range"),
      surface("meetings", "clear", "bounded_window", "range"),
    ],
  },
  {
    sourceId: "mock-linkedin",
    serverInfoName: "mock-linkedin",
    serverInfoVersion: "0.1.0",
    auth: null,
    delivery: "poll",
    pollIntervalSecs: 5,
    advertisedTools: SDK_TOOLS,
    callableOperations: [...SDK_OPERATIONS, "magnis.auth.probe"],
    identityRule: "manifest_account_subject",
    credentialKeys: [],
    mintedCredentialKeys: [],
    migratesFrom: [],
    surfaces: [surface("linkedin", "retain", "forward_and_backfill", "tracked_identity_set")],
  },
  {
    sourceId: "mock-statemachine-key",
    serverInfoName: "magnis-mock-statemachine",
    serverInfoVersion: "0.1.0",
    auth: "api_key",
    delivery: "poll",
    pollIntervalSecs: 300,
    advertisedTools: SDK_TOOLS,
    callableOperations: [...SDK_OPERATIONS, "magnis.auth.probe"],
    identityRule: "verified_provider_subject",
    credentialKeys: ["api_key"],
    mintedCredentialKeys: [],
    migratesFrom: [],
    surfaces: [surface("smk", "retain", "programmable_fixture", "unknown")],
  },
  {
    sourceId: "mock-statemachine-oauth",
    serverInfoName: "magnis-mock-statemachine",
    serverInfoVersion: "0.1.0",
    auth: "oauth2",
    delivery: "poll",
    pollIntervalSecs: 300,
    advertisedTools: SDK_TOOLS,
    callableOperations: [...SDK_OPERATIONS, "magnis.auth.probe"],
    identityRule: "verified_provider_subject",
    credentialKeys: ["refresh_token"],
    mintedCredentialKeys: ["refresh_token"],
    migratesFrom: [],
    surfaces: [
      surface("smo-a", "retain", "programmable_fixture", "unknown"),
      surface("smo-b", "retain", "programmable_fixture", "unknown"),
      surface("smo-c", "retain", "programmable_fixture", "unknown"),
    ],
  },
  {
    sourceId: "mock-statemachine-phone",
    serverInfoName: "magnis-mock-statemachine",
    serverInfoVersion: "0.1.0",
    auth: "phone_code",
    delivery: "push",
    pollIntervalSecs: null,
    advertisedTools: SDK_TOOLS,
    callableOperations: [
      ...SDK_OPERATIONS,
      "listen_start",
      "listen_stop",
      "magnis.auth.probe",
      "magnis.sync.listen",
    ],
    identityRule: "verified_provider_subject",
    credentialKeys: ["session"],
    mintedCredentialKeys: ["session"],
    migratesFrom: [],
    surfaces: [surface("smp", "retain", "programmable_fixture", "unknown", "subscription_ack")],
  },
  {
    sourceId: "mock-telegram",
    serverInfoName: "magnis-mock-telegram",
    serverInfoVersion: "0.1.0",
    auth: null,
    delivery: "poll",
    pollIntervalSecs: 2,
    advertisedTools: ["magnis.dataset.invoke", "magnis.sync.fetch"],
    callableOperations: [
      ...SDK_OPERATIONS,
      "magnis.dataset.invoke:emit_chat",
      "magnis.dataset.invoke:emit_message",
    ],
    identityRule: "manifest_account_subject",
    credentialKeys: [],
    mintedCredentialKeys: [],
    migratesFrom: [],
    surfaces: [surface("telegram", "retain", "per_identity_history", "per_identity_range")],
  },
  {
    sourceId: "mock-x",
    serverInfoName: "mock-x",
    serverInfoVersion: "0.1.0",
    auth: null,
    delivery: "poll",
    pollIntervalSecs: 5,
    advertisedTools: SDK_TOOLS,
    callableOperations: [...SDK_OPERATIONS, "magnis.auth.probe"],
    identityRule: "manifest_account_subject",
    credentialKeys: [],
    mintedCredentialKeys: [],
    migratesFrom: [],
    surfaces: [surface("x", "retain", "forward_and_backfill", "tracked_identity_set")],
  },
  {
    sourceId: "telegram",
    serverInfoName: "magnis-telegram",
    serverInfoVersion: "1.0.0",
    auth: "phone_code",
    delivery: "push",
    pollIntervalSecs: null,
    advertisedTools: [],
    callableOperations: [
      "initialize",
      "listen_start",
      "listen_stop",
      "magnis.auth.begin",
      "magnis.auth.revoke",
      "magnis.auth.step",
      "magnis.execute",
      "magnis.sync.fetch",
      "magnis.sync.listen",
      "tools/list",
    ],
    identityRule: "verified_telegram_user_id",
    credentialKeys: ["api_hash", "api_id", "session"],
    mintedCredentialKeys: ["session"],
    migratesFrom: [],
    surfaces: [surface("telegram", "retain", "per_identity_history", "per_identity_range", "subscription_ack")],
  },
  {
    sourceId: "x",
    serverInfoName: "x",
    serverInfoVersion: "0.1.0",
    auth: "api_key",
    delivery: "poll",
    pollIntervalSecs: 300,
    advertisedTools: SDK_TOOLS,
    callableOperations: [...SDK_OPERATIONS, "magnis.auth.probe"],
    identityRule: "verified_provider_subject",
    credentialKeys: ["bearer_token"],
    mintedCredentialKeys: [],
    migratesFrom: [],
    surfaces: [
      surface("contacts", "retain", "forward_and_backfill", "tracked_identity_set"),
      surface("x", "retain", "forward_and_backfill", "tracked_identity_set"),
    ],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
  return value as readonly string[];
}

function manifest(sourceId: string): Record<string, unknown> {
  const parsed = parseToml(
    readFileSync(join(repoRoot, "plugins", "sources", sourceId, "manifest.toml"), "utf8"),
  ) as unknown;
  if (!isRecord(parsed)) throw new Error(`${sourceId} manifest must be a table`);
  return parsed;
}

function certification(record: Record<string, unknown>, sourceId: string): Record<string, unknown> {
  const value = record.certification;
  if (!isRecord(value)) throw new Error(`${sourceId} certification must be a table`);
  return value;
}

function compatibility(record: Record<string, unknown>, sourceId: string): Record<string, unknown> {
  const value = record.account_compatibility;
  if (!isRecord(value)) {
    throw new Error(`${sourceId} certification.account_compatibility must be a table`);
  }
  return value;
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

async function sdkCall(
  config: ConnectorConfig,
  id: number,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const reply = await handleMessage(
    { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
    config,
  );
  if (reply === null) throw new Error(`SDK ${name} unexpectedly returned no reply`);
  return reply;
}

/**
 * @test-id: tst_cat_src_parity_001
 * @scenario: scn_src_v1_parity_001
 * @covers: packages/connector-sdk/index.ts::handleMessage
 * @covers: scripts/certify-sources.ts::discoverStagedCatalog
 * @deterministic: yes
 * @fixtures: inline current-v1 provider matrix and hermetic provider payloads
 *
 * Test environment: current catalog manifests and direct in-process v1 dispatch.
 * Clients: direct calls.
 * Mocks: deterministic connector handlers only; no provider network.
 * Data: authored provider matrix plus fixed email/Telegram/social payloads.
 */
describe("tst_cat_src_parity_001 current v1 golden matrix", () => {
  test("every certified v1 provider authors exact wire and account compatibility inputs", () => {
    expect(GOLDEN_PROVIDERS.map(({ sourceId }) => sourceId)).toEqual([
      "anysite",
      "google",
      "local",
      "mock-gmail",
      "mock-linkedin",
      "mock-statemachine-key",
      "mock-statemachine-oauth",
      "mock-statemachine-phone",
      "mock-telegram",
      "mock-x",
      "telegram",
      "x",
    ]);

    for (const golden of GOLDEN_PROVIDERS) {
      const authored = certification(manifest(golden.sourceId), golden.sourceId);
      expect(authored.protocol, golden.sourceId).toBe("magnis.source/1");
      expect(authored.delivery, golden.sourceId).toBe(golden.delivery);
      expect(authored.poll_interval_secs ?? null, golden.sourceId).toBe(golden.pollIntervalSecs);
      expect(authored.server_info_name, golden.sourceId).toBe(golden.serverInfoName);
      expect(authored.server_info_version, golden.sourceId).toBe(golden.serverInfoVersion);
      expect(sorted(stringArray(authored.advertised_tools, `${golden.sourceId}.advertised_tools`))).toEqual(
        sorted(golden.advertisedTools),
      );
      expect(sorted(stringArray(authored.callable_operations, `${golden.sourceId}.callable_operations`))).toEqual(
        sorted(golden.callableOperations),
      );
      const scenarios = PROVIDER_SCENARIOS[golden.sourceId];
      if (scenarios === undefined) throw new Error(`${golden.sourceId} has no executable scenario evidence`);
      expect(stringArray(authored.scenario_ids, `${golden.sourceId}.scenario_ids`)).toEqual(
        scenarios.map(({ id }) => id),
      );
      for (const scenario of scenarios) {
        expect(readFileSync(join(repoRoot, scenario.path), "utf8"), scenario.id).toContain(
          `test("${scenario.id}`,
        );
      }

      const account = compatibility(authored, golden.sourceId);
      expect(account.identity_rule, golden.sourceId).toBe(golden.identityRule);
      expect(sorted(stringArray(account.credential_keys, `${golden.sourceId}.credential_keys`))).toEqual(
        sorted(golden.credentialKeys),
      );
      expect(sorted(stringArray(account.minted_credential_keys, `${golden.sourceId}.minted_credential_keys`))).toEqual(
        sorted(golden.mintedCredentialKeys),
      );
      expect(stringArray(account.migrates_from, `${golden.sourceId}.migrates_from`)).toEqual(
        golden.migratesFrom,
      );
      const authoredSurfaces = account.surfaces;
      if (!Array.isArray(authoredSurfaces)) throw new Error(`${golden.sourceId}.surfaces must be an array`);
      expect(authoredSurfaces).toEqual(
        golden.surfaces.map((entry) => ({
          name: entry.name,
          cursor_terminal_null: entry.cursorTerminalNull,
          progress: {
            target: entry.progress.target,
            continuation: entry.progress.continuation,
            forward_checkpoint: entry.progress.forwardCheckpoint,
            coverage: entry.progress.coverage,
            live_fence: entry.progress.liveFence,
          },
          receiver_interface_hash: entry.receiverInterfaceHash,
        })),
      );

      const hash = accountCompatibilityHash({
        auth: golden.auth,
        identityRule: golden.identityRule,
        credentialKeys: golden.credentialKeys,
        mintedCredentialKeys: golden.mintedCredentialKeys,
        surfaces: golden.surfaces,
      });
      expect(hash, golden.sourceId).toMatch(HASH_PATTERN);
      expect(
        decodeSourceCertificationDeclaration(golden.sourceId, manifest(golden.sourceId))
          .accountCompatibility,
        golden.sourceId,
      ).toEqual({
        hash,
        migratesFrom: golden.migratesFrom,
        input: {
          auth: golden.auth,
          identityRule: golden.identityRule,
          credentialKeys: golden.credentialKeys,
          mintedCredentialKeys: golden.mintedCredentialKeys,
          surfaces: golden.surfaces,
        },
      });
    }
  });

  test("SDK v1 preserves initialize, tools, camelCase pages, tokens, auth, actions, Push and errors", async () => {
    const notifications: string[] = [];
    let emitLive: ((envelope: Envelope) => void) | undefined;
    const config: ConnectorConfig = {
      name: "golden-sdk",
      version: "1.2.3",
      surfaces: ["golden"],
      mode: "push",
      intervalSecs: 17,
      onNotification: (line) => notifications.push(line),
      fetch: (args) => {
        if (args.cursor === "rate") throw new RateLimitError(29);
        if (args.cursor === "expired") throw new CursorExpiredError("expired-token");
        if (args.cursor === "provider") {
          throw new ConnectorError("provider-failed", { kind: "network", provider: "golden" });
        }
        return Promise.resolve({
          envelopes: [
            {
              surface: args.surface,
              remote_id: "remote-7",
              kind: "snapshot",
              payload: { itemToken: { shard: "a", offset: 7 } },
            },
          ],
          nextCursor: { pageToken: "page-2" },
          hasMore: true,
          total: 3,
          discovered: 1,
        });
      },
      probeAuth: () => Promise.resolve({ subject: "subject-1" }),
      auth: {
        exchange: (args, meta) => Promise.resolve({ code: args.code, verifier: meta?.verifier }),
      },
      execute: {
        send: (args) => Promise.resolve({ providerEffect: { sent: args.body, remoteId: "out-1" } }),
      },
      listenStart: (_args, emit) => {
        emitLive = emit;
        return Promise.resolve();
      },
      listenStop: () => Promise.resolve(),
    };

    expect(await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize" }, config)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {},
          experimental: {
            magnis: { sync: { surfaces: ["golden"], mode: "push", interval_secs: 17 } },
          },
        },
        serverInfo: { name: "golden-sdk", version: "1.2.3" },
      },
    });
    const listed = await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, config);
    expect((listed?.result as Record<string, unknown>).tools).toEqual([
      {
        name: "magnis.sync.fetch",
        description: "Fetch a page of canonical envelopes for a surface.",
        inputSchema: {
          type: "object",
          properties: {
            surface: { type: "string" },
            cursor: {},
            tracked_handles: { type: "array", items: { type: "string" } },
            limit: { type: "integer" },
          },
          required: ["surface"],
        },
      },
    ]);
    expect((await sdkCall(config, 3, "magnis.sync.fetch", { surface: "golden" })).result).toEqual({
      envelopes: [
        {
          surface: "golden",
          remote_id: "remote-7",
          kind: "snapshot",
          payload: { itemToken: { shard: "a", offset: 7 } },
        },
      ],
      nextCursor: { pageToken: "page-2" },
      hasMore: true,
      total: 3,
      discovered: 1,
    });
    expect((await sdkCall(config, 4, "magnis.auth.exchange", {
      code: "oauth-code",
      _meta: { verifier: "pkce" },
    })).result).toEqual({ code: "oauth-code", verifier: "pkce" });
    expect((await sdkCall(config, 5, "magnis.execute", { action: "send", body: "hello" })).result).toEqual({
      providerEffect: { sent: "hello", remoteId: "out-1" },
    });

    expect((await sdkCall(config, 6, "listen_start", { subscription_id: "sub-1" })).result).toEqual({
      ok: true,
      subscription_id: "sub-1",
    });
    if (emitLive === undefined) throw new Error("listen_start did not install emitter");
    emitLive({ surface: "golden", remote_id: "live-1", kind: "live", payload: { exact: true } });
    expect(JSON.parse(notifications[0] ?? "null")).toEqual({
      jsonrpc: "2.0",
      method: "notifications/magnis/envelope",
      params: {
        subscription_id: "sub-1",
        surface: "golden",
        remote_id: "live-1",
        kind: "live",
        payload: { exact: true },
      },
    });
    expect((await sdkCall(config, 7, "listen_stop", { subscription_id: "sub-1" })).result).toEqual({ ok: true });

    expect((await sdkCall(config, 8, "magnis.sync.fetch", { surface: "golden", cursor: "rate" })).error).toEqual({
      code: -32002,
      message: "rate limited; retry_after=29",
      data: { retry_after: 29 },
    });
    expect((await sdkCall(config, 9, "magnis.sync.fetch", { surface: "golden", cursor: "expired" })).error).toEqual({
      code: -32003,
      message: "expired-token",
    });
    expect((await sdkCall(config, 10, "magnis.sync.fetch", { surface: "golden", cursor: "provider" })).error).toEqual({
      code: -32000,
      message: "provider-failed",
      data: { kind: "network", provider: "golden" },
    });
  });

  test("custom Telegram declaration pins its intentionally different v1 Push dialect", () => {
    // Provider-local typed execution pins the same wire at tst_tgts_wire_001,
    // tst_tgts_wire_004 and tst_tgts_wire_009. The catalog matrix owns only
    // the authored certification declaration, so testkit never imports the
    // provider's GramJS-backed runtime closure.
    const authored = certification(manifest("telegram"), "telegram");
    expect(authored.delivery).toBe("push");
    expect("poll_interval_secs" in authored).toBe(false);
    expect(authored.server_info_name).toBe("magnis-telegram");
    expect(authored.server_info_version).toBe("1.0.0");
    expect(authored.advertised_tools).toEqual([]);
    expect(stringArray(authored.callable_operations, "telegram.callable_operations")).toEqual(
      expect.arrayContaining([
        "listen_start",
        "listen_stop",
        "magnis.sync.fetch",
        "magnis.sync.listen",
      ]),
    );
  });

  test("deterministic mocks pin provider effects, terminal pages and item identity", async () => {
    expect(await fetchMockGmail({ surface: "email" })).toEqual({
      envelopes: [],
      nextCursor: null,
      hasMore: false,
    });
    expect(await fetchMockTelegram({ surface: "telegram" })).toEqual({
      envelopes: [],
      nextCursor: null,
      hasMore: false,
    });
    expect((await fetchMockLinkedIn({ surface: "linkedin", tracked_handles: [] })).envelopes).toEqual([]);
    expect((await fetchMockX({ surface: "x", tracked_handles: [] })).envelopes).toEqual([]);
    expect(await fetchMockLinkedIn({ surface: "linkedin", cursor: 7 })).toEqual({
      envelopes: [],
      nextCursor: 7,
      hasMore: false,
    });
    expect(await fetchMockX({ surface: "x", cursor: 9 })).toEqual({
      envelopes: [],
      nextCursor: 9,
      hasMore: false,
    });

    const gmailEnvelope = await emitGmailMessage({
      action: "emit_message",
      invocation_id: "mail-fixture",
      action_time: "2026-08-27T00:00:00Z",
      settings: {},
      payload: {
        message_id: "m-1",
        sent_at: "2026-08-27T00:00:00Z",
        from_address: "a@example.com",
        subject: "subject",
        body_text: "body",
      },
    });
    expect(gmailEnvelope.envelopes[0]?.remote_id).toBe("dataset:mail-fixture:0");
    expect(await sendMockGmailMessage({
      draft: { to: [{ address: "b@example.com" }], subject: "subject", body_text: "body" },
    })).toEqual({
      message_id: "mock-gmail-0a174df52a3f4e4afa9d66a868aeafff",
      thread_id: "mock-gmail-thread-a9491f4c1bf7b0cffbadcba2db8f028e",
    });

    const telegramEnvelope = await emitTelegramMessage({
      action: "emit_message",
      invocation_id: "tg-fixture",
      action_time: "2026-08-27T00:00:00Z",
      settings: {},
      payload: {
        message_id: 12,
        chat_id: 7,
        text: "hello",
        date: "2026-08-27T00:00:00Z",
      },
    });
    expect(telegramEnvelope.envelopes[0]?.remote_id).toBe("dataset:tg-fixture:0");
    expect(telegramEnvelope.envelopes[0]?.payload).toMatchObject({
      message_id: 12,
      chat_id: 7,
      text: "hello",
      date: "2026-08-27T00:00:00Z",
      is_outgoing: false,
    });
  });

  test("tst_cat_src_phone_001 staged phone wrapper serves its declared Push surface", async () => {
    const root = mkdtempSync(join(tmpdir(), "magnis-phone-certification-"));
    try {
      const release = discoverSourceReleaseManifests(join(repoRoot, "plugins", "sources"))
        .find((entry) => entry.id === "mock-statemachine-phone");
      if (release === undefined || release.disposition !== "admissible") {
        throw new Error("mock-statemachine-phone is not an admissible release");
      }
      const destination = join(root, "packages", "source", release.id);
      mkdirSync(destination, { recursive: true });
      stageSourcePackage(release, destination);
      const entry = discoverStagedCatalog(root).find(({ id }) => id === release.id);
      if (entry === undefined) throw new Error("staged phone artifact was not discovered");
      const receipt = await mintSourceCertificationReceipt(entry);

      expect(receipt.delivery).toBe("push");
      expect(receipt.surfaces).toEqual(["smp"]);
      expect(receipt.callableOperations).toEqual([
        "initialize",
        "listen_start",
        "listen_stop",
        "magnis.auth.probe",
        "magnis.sync.fetch",
        "magnis.sync.listen",
        "tools/list",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("tst_cat_src_legacy_001 committed selected-channel receipts preserve the observed old wire", () => {
    const receiptRoot = join(repoRoot, "dist", "receipts");
    expect(readdirSync(receiptRoot).filter((name) => name.endsWith(".json"))).toHaveLength(21);
    for (const expected of SELECTED_CHANNEL_SOURCE_MATRIX) {
      const receipt = decodeSourceCertificationReceipt(
        readFileSync(join(receiptRoot, `${expected.packageHash}.json`), "utf8"),
        { packageHash: expected.packageHash, definitionHash: expected.definitionHash },
      );
      expect(receipt.sourceId).toBe(expected.id);
      expect(receipt.scenarioIds).toEqual(["tst_cat_src_legacy_001"]);
      if (expected.id === "mock-gmail" || expected.id === "mock-telegram") {
        expect(receipt.advertisedTools).toEqual(["magnis.sync.fetch"]);
        expect(receipt.callableOperations).toEqual([
          "initialize",
          "magnis.sync.fetch",
          "tools/list",
        ]);
      }
    }
  });
});
