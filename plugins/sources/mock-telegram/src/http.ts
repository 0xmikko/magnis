// HTTP control server (demo / eval parity): `curl localhost:4030/inject-chat`.
// Ported from the Rust axum router — same routes, same bodies.
//
// Best-effort bind: only ONE of the per-surface child processes wins the port;
// the loser just serves MCP (both read the same shared file).

import { buildChat, buildMessage } from "./envelope";
import { appendItem, readItems, SURFACE } from "./store";

type Json = Record<string, unknown>;

/** Rust: `append_item(..).unwrap_or(0)` — an IO failure still answers queued. */
function appendOrZero(payload: Json, remoteId: string, kind: string): number {
  try {
    return appendItem(payload, remoteId, kind);
  } catch {
    return 0;
  }
}

export function injectChat(req: Json): Json {
  const built = buildChat(req);
  if (!built) return { queued: false, error: "chat_id (integer) required" };
  const total = appendOrZero(built.payload, built.remoteId, "snapshot");
  return { queued: true, total, remote_id: built.remoteId };
}

export function injectMessage(req: Json): Json {
  const built = buildMessage(req);
  if (!built) return { queued: false, error: "chat_id (integer) required" };
  const total = appendOrZero(built.payload, built.remoteId, "live");
  return { queued: true, total, remote_id: built.remoteId };
}

export function status(): Json {
  const items = readItems(SURFACE);
  const chats = items.filter((i) => i.kind === "snapshot").length;
  return { chats, messages: items.length - chats, total: items.length };
}

async function body(req: Request): Promise<Json> {
  try {
    const parsed: unknown = await req.json();
    return parsed !== null && typeof parsed === "object" ? (parsed as Json) : {};
  } catch {
    return {};
  }
}

export async function handleHttp(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (req.method === "POST" && pathname === "/inject-chat") {
    return Response.json(injectChat(await body(req)));
  }
  if (req.method === "POST" && pathname === "/inject-message") {
    return Response.json(injectMessage(await body(req)));
  }
  if (req.method === "GET" && pathname === "/health") {
    return new Response("ok");
  }
  if (req.method === "GET" && pathname === "/status") {
    return Response.json(status());
  }
  return new Response("Not Found", { status: 404 });
}

export function maybeRunHttp(): void {
  const raw = process.env.MOCK_TELEGRAM_PORT;
  if (!raw) return;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return;
  try {
    Bun.serve({ port, hostname: "0.0.0.0", fetch: handleHttp });
    process.stderr.write(`magnis-mock-telegram: control server on :${String(port)}\n`);
  } catch (e) {
    process.stderr.write(
      `magnis-mock-telegram: control port ${String(port)} unavailable (${e instanceof Error ? e.message : String(e)}); MCP-only\n`,
    );
  }
}
