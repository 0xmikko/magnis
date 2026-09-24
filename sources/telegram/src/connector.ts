import {
  ConnectorError,
  RateLimitError,
  type ConnectorConfig,
  type FetchResult,
} from "@magnis/connector-sdk";

import * as auth from "./auth";
import {
  accountIdFromMeta,
  credsFromMeta,
  floodWaitSecs,
  RATE_LIMITED_PREFIX,
  type DialogPager,
} from "./client";
import type { AuthClientFactory } from "./live";
import { SubscriptionRegistry } from "./subscriptions";
import * as commands from "./surfaces/telegram/commands";
import type { TgOps } from "./surfaces/telegram/commands";
import * as fixture from "./surfaces/telegram/fixture";
import { SURFACE_TELEGRAM } from "./schema";

const AUTH_REQUIRED_CODE = -32001;
const INVALID_PARAMS_CODE = -32602;

export type ClientResolver = (
  args: Record<string, unknown>,
) => Promise<{ ops: TgOps; pager: DialogPager; accountId: string }>;

export interface ConnectorDeps {
  registry?: SubscriptionRegistry;
  resolveClient?: ClientResolver;
  authFactory?: AuthClientFactory;
  sleep?: (secs: number) => Promise<void>;
}

const defaultResolveClient: ClientResolver = async (args) => {
  const { pool, LiveDialogPager } = await import("./live");
  const accountId = accountIdFromMeta(args);
  const client = await pool().getOrCreate(accountId, credsFromMeta(args));
  return { ops: client, pager: new LiveDialogPager(client, accountId), accountId };
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function providerError(error: unknown): Error {
  if (error instanceof ConnectorError || error instanceof RateLimitError) return error;
  const seen = new Set<unknown>();
  for (let cause = error; cause !== undefined && !seen.has(cause);) {
    seen.add(cause);
    const wait = floodWaitSecs(cause);
    if (wait !== undefined) return new RateLimitError(wait);
    const message = errorText(cause);
    if (message.startsWith(RATE_LIMITED_PREFIX)) {
      const raw = message.slice(RATE_LIMITED_PREFIX.length);
      if (/^\d+$/.test(raw)) return new RateLimitError(Number(raw));
    }
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  const rpc = error as { code?: number } | null;
  if (rpc !== null && typeof rpc === "object" && rpc.code === 401) {
    const message = errorText(error);
    return new ConnectorError(message, { kind: "auth", message }, AUTH_REQUIRED_CODE);
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function providerCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw providerError(error);
  }
}

/** The one Telegram Source program: ordinary SDK handlers and provider seams. */
export function buildConnectorConfig(deps: ConnectorDeps = {}): ConnectorConfig {
  const registry = deps.registry ?? new SubscriptionRegistry();
  const resolveClient = deps.resolveClient ?? defaultResolveClient;
  const execute = async (args: Record<string, unknown>): Promise<Record<string, unknown>> =>
    await providerCall(async () => {
      if (fixture.fixturePath() !== undefined) return fixture.executeResult(args);
      const { ops, accountId } = await resolveClient(args);
      return await commands.execute(ops, accountId, args, {
        sleep: deps.sleep ?? commands.realSleep,
        demoDryRun: process.env.MAGNIS_TELEGRAM_DEMO_DRY_RUN === "1",
      });
    });

  return {
    name: "magnis-telegram",
    version: "1.0.1",
    surfaces: [SURFACE_TELEGRAM],
    mode: "push",
    fetch: async (args): Promise<FetchResult> => await providerCall(async () => {
      if (fixture.fixturePath() !== undefined) {
        const result = args.target?.kind === "gap"
          ? fixture.fetchGapResult(args)
          : fixture.fetchResult(args.direction ?? "backward", args.cursor);
        return result as unknown as FetchResult;
      }
      if (args.raw === undefined) throw new Error("Telegram fetch requires raw arguments");
      const { ops, pager, accountId } = await resolveClient(args.raw);
      return await commands.fetch(ops, pager, accountId, args) as unknown as FetchResult;
    }),
    listenStart: async ({ subscription_id, meta }, emit): Promise<void> => {
      const args = meta === undefined ? {} : { _meta: meta };
      try {
        accountIdFromMeta(args);
        if (fixture.fixturePath() === undefined) credsFromMeta(args);
      } catch (error) {
        const message = errorText(error);
        throw new ConnectorError(message, { kind: "validation", message }, INVALID_PARAMS_CODE);
      }
      await providerCall(async () => {
        await registry.startFromEnv(subscription_id, args, emit);
      });
    },
    listenStop: ({ subscription_id }): Promise<void> => {
      registry.stop(subscription_id);
      return Promise.resolve();
    },
    auth: {
      begin: async (args) => await providerCall(async () => await auth.begin(args, deps.authFactory)),
      step: async (args) => await providerCall(async () => await auth.step(args)),
      revoke: async (args) => await providerCall(async () => await auth.revoke(args, deps.authFactory)),
    },
    execute: {
      send_message: execute,
      reply: execute,
      download_file: execute,
    },
  };
}
