/**
 * @test-id: tst_src_tgdispatch_001
 * @scenario: scn_tg_dispatch_pools_001
 * @covers: plugins/sources/telegram/src/dispatch.ts::runMcpStdio
 * @deterministic: yes
 * @fixtures: real stdio command loop, a resolver whose downloads never finish
 *
 * The host abandons a `download_file` after its deadline while the Source
 * keeps streaming the video, and its retries open more. If downloads share
 * the eight command slots, the next history page waits behind them until
 * its own deadline fires and the sync reports an error. Downloads own a pool
 * of their own; a sync fetch is dispatched whatever they are doing.
 */
import { PassThrough } from "node:stream";
import { expect, test } from "bun:test";

import { runMcpStdio } from "./dispatch";
import { SubscriptionRegistry } from "./subscriptions";
import type { DialogPager } from "./client";
import type { TgOps } from "./surfaces/telegram/commands";

test("tst_src_tgdispatch_001 a sync fetch answers while eight downloads are in flight", async () => {
  const input = new PassThrough();
  const replies = new Map<number, Record<string, unknown>>();
  const waiting = new Map<number, (reply: Record<string, unknown>) => void>();
  let downloadsStarted = 0;
  const ops = {
    resolvePeer: () => Promise.resolve({ peer: true }),
    getMessages: () => Promise.resolve([{ id: 7 }] as never),
    downloadMedia: () => { downloadsStarted += 1; return new Promise<number>(() => {}); },
  } as unknown as TgOps;
  const pager = {
    dialogPage: () => Promise.resolve({ dialogs: [], next_offset: null, total: 0 }),
  } as unknown as DialogPager;
  const running = runMcpStdio(input, {
    authMode: false,
    registry: new SubscriptionRegistry(),
    resolveClient: () => Promise.resolve({ ops, pager, accountId: "fixture" }),
    write: (line: string) => {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (typeof record.id === "number") { replies.set(record.id, record); waiting.get(record.id)?.(record); }
    },
  });
  const send = (id: number, name: string, args: Record<string, unknown>): void => {
    input.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) + "\n");
  };
  const reply = (id: number): Promise<Record<string, unknown>> =>
    replies.get(id) !== undefined ? Promise.resolve(replies.get(id) as Record<string, unknown>) : new Promise((resolve) => { waiting.set(id, resolve); });
  try {
    for (let id = 1; id <= 8; id += 1) {
      send(id, "magnis.execute", { action: "download_file", dest: `/tmp/fixture-${String(id)}`, source_ref: { chat_id: 42, message_id: id } });
    }
    // Downloads are in flight before the fetch arrives: every one of the eight
    // when they share the command slots (the defect), two when they own a pool.
    for (let i = 0; i < 50 && downloadsStarted < 2; i += 1) await new Promise((resolve) => { setImmediate(resolve); });
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => { setImmediate(resolve); });
    expect(downloadsStarted).toBeGreaterThanOrEqual(2);
    send(100, "magnis.sync.fetch", { direction: "backward", cursor: null });
    const answered = await Promise.race([
      reply(100).then(() => "answered" as const),
      new Promise<"starved">((resolve) => { setTimeout(() => { resolve("starved"); }, 500); }),
    ]);
    expect(answered).toBe("answered");
    expect(replies.get(100)).toMatchObject({ id: 100, result: { hasMore: false, discovered: 0 } });
    // The downloads are still running or still queued: none of them answered.
    expect(replies.size).toBe(1);
    expect(downloadsStarted).toBeLessThanOrEqual(8);
  } finally {
    input.end();
    await Promise.race([running, new Promise((resolve) => { setTimeout(resolve, 200); })]);
  }
});
