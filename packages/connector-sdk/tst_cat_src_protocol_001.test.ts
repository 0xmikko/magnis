import { describe, expect, it } from "bun:test";
import { PassThrough } from "node:stream";
import {
  SOURCE_V2_MAX_FRAME_BYTES,
  decodeSourceProtocol,
  decodeSourceV2Result,
  encodeSourceV2Frame,
} from "@magnis/connector-sdk/codec";
import {
  SourceV2Server,
  defineSourceV2Operation,
  runSourceV2Server,
} from "@magnis/connector-sdk/server";
import type { ProviderOperation, ProviderOutputSchema } from "@magnis/connector-sdk";

const stringResultSchema: ProviderOutputSchema<{ value: string }> = {
  parse(value: unknown): { value: string } {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof (value as { value?: unknown }).value !== "string"
    ) {
      throw new Error("value must be a string");
    }
    return { value: (value as { value: string }).value };
  },
};

const stringOperation: ProviderOperation<{ value: string }> = {
  name: "fixture.wait",
  outputSchema: stringResultSchema,
};

/**
 * @test-id: tst_cat_src_protocol_001
 * @scenario: scn_cat_src_protocol_001
 * @covers: packages/connector-sdk/codec.ts, packages/connector-sdk/server.ts
 * @deterministic: yes
 * @fixtures: inline strict v2 frames and operations
 *
 * Test environment: connector-sdk codec and two in-process v2 servers
 * Clients: direct calls
 * Mocks: none
 * Data: inline JSON-RPC frames
 */
describe("strict Source protocol v2", () => {
  it("tst_cat_src_protocol_001 selects exact lanes and refuses malformed frames, results, and cross-instance cancellation", async () => {
    expect(decodeSourceProtocol("magnis.source/1")).toBe("magnis.source/1");
    expect(decodeSourceProtocol("magnis.source/2")).toBe("magnis.source/2");
    expect(() => decodeSourceProtocol(undefined)).toThrow("missing Source protocol");
    expect(() => decodeSourceProtocol("v2")).toThrow("unsupported Source protocol 'v2'");

    expect(() => encodeSourceV2Frame({ jsonrpc: "2.0", id: 1, method: "fixture.wait", extra: true })).toThrow(
      "unknown frame member 'extra'",
    );
    expect(() => encodeSourceV2Frame("x".repeat(SOURCE_V2_MAX_FRAME_BYTES + 1))).toThrow(
      "exceeds 4194304 bytes",
    );
    expect(() =>
      decodeSourceV2Result(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: 7 } }),
        1,
        stringOperation,
      ),
    ).toThrow("invalid result for 'fixture.wait'");

    let resolveSecond: ((value: { value: string }) => void) | undefined;
    const operation = defineSourceV2Operation({
      name: "fixture.wait",
      inputSchema: {
        parse(value: unknown): unknown {
          return value;
        },
      },
      outputSchema: stringResultSchema,
      async handle(_input: unknown, context): Promise<{ value: string }> {
        return await new Promise<{ value: string }>((resolve, reject) => {
          if (context.instanceId === "one") {
            context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
          } else {
            resolveSecond = resolve;
          }
        });
      },
    });
    const one = new SourceV2Server({ instanceId: "one", operations: [operation] });
    const two = new SourceV2Server({ instanceId: "two", operations: [operation] });
    const request = JSON.stringify({ jsonrpc: "2.0", id: 9, method: "fixture.wait", params: {} });
    const firstReply = one.handleFrame(request);
    const secondReply = two.handleFrame(request);

    expect(
      await one.handleFrame(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/cancelled",
          params: { requestId: 9, reason: "test cancellation" },
        }),
      ),
    ).toBeNull();
    expect(await firstReply).toEqual(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 9,
        error: { code: -32800, message: "test cancellation", data: { kind: "cancelled" } },
      }),
    );
    resolveSecond?.({ value: "still isolated" });
    expect(await secondReply).toEqual(
      JSON.stringify({ jsonrpc: "2.0", id: 9, result: { value: "still isolated" } }),
    );

    await Promise.all([one.close(), two.close()]);
    expect(one.pendingRequestCount).toBe(0);
    expect(two.pendingRequestCount).toBe(0);

    const nullOnly = defineSourceV2Operation({
      name: "fixture.null",
      inputSchema: {
        parse(value: unknown): null {
          if (value !== null) throw new Error("params must be explicit null");
          return null;
        },
      },
      outputSchema: stringResultSchema,
      async handle(): Promise<{ value: string }> {
        return { value: "null retained" };
      },
    });
    const strictParams = new SourceV2Server({ instanceId: "params", operations: [nullOnly] });
    expect(
      await strictParams.handleFrame(
        JSON.stringify({ jsonrpc: "2.0", id: 10, method: "fixture.null", params: null }),
      ),
    ).toBe(JSON.stringify({ jsonrpc: "2.0", id: 10, result: { value: "null retained" } }));
    expect(
      await strictParams.handleFrame(
        JSON.stringify({ jsonrpc: "2.0", id: 11, method: "fixture.null" }),
      ),
    ).toContain('"code":-32602');
    await strictParams.close();

    const unterminated = new PassThrough();
    const streamed = runSourceV2Server(
      { instanceId: "stream", operations: [] },
      { input: unterminated, write: () => undefined },
    );
    unterminated.write("x".repeat(SOURCE_V2_MAX_FRAME_BYTES + 1));
    const streamResult = await Promise.race([
      streamed.then(
        () => "closed",
        (error: unknown) => (error instanceof Error ? error.message : "non-error"),
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("still buffering"), 50)),
    ]);
    unterminated.destroy();
    await streamed.catch(() => undefined);
    expect(streamResult).toContain("exceeds 4194304 bytes");

    const malformed = new PassThrough();
    const malformedRun = runSourceV2Server(
      { instanceId: "malformed", operations: [] },
      { input: malformed, write: () => undefined },
    );
    malformed.write("not-json\n");
    const malformedResult = await Promise.race([
      malformedRun.then(
        () => "closed",
        (error: unknown) => (error instanceof Error ? error.message : "non-error"),
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("still reading"), 50)),
    ]);
    malformed.destroy();
    await malformedRun.catch(() => undefined);
    expect(malformedResult).toBe("Source v2 frame is not valid JSON");
  });
});
