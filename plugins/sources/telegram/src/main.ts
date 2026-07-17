// External `telegram` connector — Telegram as a Magnis MCP source.
// TypeScript (gramjs) twin of the Rust plugins/sources/telegram connector: it
// speaks the Magnis Sync Profile over stdio JSON-RPC and feeds ONE PUSH surface
// (`telegram`) with canonical envelopes byte-identical to the Rust twin's, so the
// `telegram` module ingests it unchanged.
//
// ## Credential model
// The connector builds its own gramjs MTProto client. The host injects
// credentials per call as `_meta = { api_id, api_hash, session }` (+ the required
// `account_id`).
//
// !! SESSION FORMAT BREAK vs the Rust connector: `session` here is a gramjs
// `StringSession` string; Rust mints `base64(grammers Session::save())`. The two
// formats are NOT interchangeable — cutting over between the connectors requires
// the user to RE-AUTHENTICATE. See client.ts / auth.ts.
//
// ## Fixture / replay mode (isolated e2e, no live Telegram)
// If `TELEGRAM_FIXTURE_FILE` is set, `magnis.sync.fetch` is served from that JSON
// file (NO MTProto network), the listener replays the file's `live` messages as
// push notifications, and `magnis.execute` records/echoes the action. The fixture
// check runs BEFORE any credential parsing. See fixture.ts.
//
// ## Deliberately NOT ported (host never calls them)
// TODO(telegram follow-up): the Rust binary also advertises 3 opinionated
// tools in tools/list for direct Claude/agent use — `list_chats`, `list_messages`,
// `send_message`. The host sync pipeline only calls magnis.sync.fetch /
// magnis.execute / magnis.auth.* / listen_start / listen_stop, so they are
// SKIPPED here and tools/list answers an empty list.
// TODO(telegram follow-up): the Rust binary also serves `magnis.test.sleep`,
// an unadvertised slow-handler seam for its concurrency tests. Not ported.

import { createInterface } from "node:readline";
import { handleMessage, type DispatchDeps, type JsonRpcMessage } from "./dispatch";
import { SubscriptionRegistry } from "./subscriptions";

/** Bound on concurrently-dispatched `tools/call`s. The read loop dispatches each
 * call WITHOUT awaiting it, so an interactive send is never starved behind a
 * long-running bootstrap fetch; this caps the in-flight count so a misbehaving
 * caller cannot fork-bomb the connector. Twin of the Rust
 * MAX_INFLIGHT_TOOL_CALLS + its semaphore. */
const MAX_INFLIGHT_TOOL_CALLS = 8;

/** Minimal counting semaphore (the Rust binary uses tokio's). */
class Semaphore {
  private available: number;
  private readonly waiters: (() => void)[] = [];

  constructor(permits: number) {
    this.available = permits;
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next !== undefined) next();
    else this.available += 1;
  }
}

/** Serialize writes so request replies and push notifications never interleave
 * on the wire (twin of the Rust `SharedOut` mutex — Node's stdout writes are
 * already atomic per call, so one line per write is sufficient). */
function writeLine(line: string): void {
  process.stdout.write(line + "\n");
}

async function runMcpStdio(): Promise<void> {
  const registry = new SubscriptionRegistry();
  // Mode-spawn gating: an --auth-mode spawn exposes ONLY magnis.auth.*; a sync
  // spawn refuses them. Defense in depth.
  const authMode = process.argv.includes("--auth-mode");
  const deps: DispatchDeps = { authMode, registry, write: writeLine };
  const sem = new Semaphore(MAX_INFLIGHT_TOOL_CALLS);

  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(trimmed) as JsonRpcMessage;
    } catch {
      continue;
    }

    // Dispatch WITHOUT awaiting so the read loop never blocks on a long-running
    // call. The permit is acquired INSIDE the task (so the loop itself never
    // waits), but the (bound+1)th task waits for a permit before it dispatches.
    void (async () => {
      await sem.acquire();
      try {
        const reply = await handleMessage(msg, deps);
        if (reply !== null) writeLine(JSON.stringify(reply));
      } catch (e) {
        console.error(`magnis-telegram: dispatch panic: ${String(e)}`);
      } finally {
        sem.release();
      }
    })();
  }
}

await runMcpStdio();
