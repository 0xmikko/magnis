import { expect, test } from "bun:test";
import { Api } from "telegram";

import { createAuthClientFactory, SessionPool } from "./live";
import { AccountAdmission } from "./request-admission";
import { createTransport, setupConfig, VirtualClock } from "./testing/mtproto-transport";

/** @test-id: tst_src_tgflood_006
 * @scenario: scn_tgflood_006
 * @covers: real pool client lifecycle and retained account admission
 * @deterministic: yes
 * @fixtures: synthetic serialized session, actual SDK connect, fake transport
 */
test("tst_src_tgflood_006 eviction and failed setup close the client without erasing its account budget", async () => {
  const clock = new VirtualClock();
  const options: ConstructorParameters<typeof SessionPool>[0] = { clock, diagnostics: () => undefined };
  const pool = new SessionPool(options);
  const guard = pool.admissionFor("fixture-pool");
  const launch = (transport: NonNullable<typeof options>["transport"], session: string): Promise<unknown> => {
    options.transport = transport;
    return pool.getOrCreate("fixture-pool", { api_id: 1, api_hash: "fixture-only", session });
  };
  const first = await createTransport(clock, guard, true, launch);
  try {
    await first.reply(await first.application(0), setupConfig());
    expect(await first.connected).toBe(true);
    expect(await pool.evict("fixture-pool")).toBe(true);
    expect(first.client._destroyed).toBe(true);
    expect(first.disconnectCount()).toBeGreaterThan(0);
    expect(pool.admissionFor("fixture-pool")).toBe(guard);
  } finally { await first.close(); }
  clock.advance(3000);
  const failed = await createTransport(clock, guard, true, launch);
  try {
    const pending = failed.connected.then(() => "connected", () => "failed");
    await failed.reply(await failed.application(0), new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_17" }));
    expect(await pending).toBe("failed");
    expect(failed.client._destroyed).toBe(true);
    expect(failed.disconnectCount()).toBeGreaterThan(0);
    expect(pool.size()).toBe(0);
    expect(guard.holdUntil).toBe(20_000);
  } finally { await failed.close(); }
  const recreated = await createTransport(clock, guard, true, launch);
  try {
    const denied = await recreated.connected.then(() => undefined, (error: unknown) => error);
    expect(denied).toMatchObject({ code: 420, seconds: 17 });
    expect(recreated.writes).toHaveLength(0);
    expect(recreated.client._destroyed).toBe(true);
    expect(pool.admissionFor("fixture-pool")).toBe(guard);
    expect(guard.remoteFloods).toBe(1);
  } finally { await recreated.close(); }

  const authClock = new VirtualClock();
  const authGuard = new AccountAdmission("fixture-auth-process", authClock, () => undefined);
  const authTransport: NonNullable<Parameters<typeof createAuthClientFactory>[1]> = {};
  const auth = createAuthClientFactory(authGuard, authTransport);
  const launchAuth = (transport: NonNullable<Parameters<typeof createAuthClientFactory>[1]>): Promise<unknown> => {
    Object.assign(authTransport, transport);
    return auth.connectFresh(1, "fixture-only");
  };
  const beginning = await createTransport(authClock, authGuard, true, launchAuth);
  try {
    const connected = beginning.connected.then(() => "connected", () => "failed");
    await beginning.reply(await beginning.application(0), new Api.RpcError({ errorCode: 420, errorMessage: "FLOOD_WAIT_17" }));
    expect(await connected).toBe("failed");
    expect(beginning.client._destroyed).toBe(true);
  } finally { await beginning.close(); }
  const repeated = await createTransport(authClock, authGuard, true, launchAuth);
  try {
    const connected = await repeated.connected.then(() => undefined, (error: unknown) => error);
    expect(connected).toMatchObject({ code: 420, seconds: 17 });
    expect(repeated.writes).toHaveLength(0);
    expect(repeated.client._destroyed).toBe(true);
    expect(authGuard.remoteFloods).toBe(1);
  } finally { await repeated.close(); }
});
