// HTTP injection server (demo / eval parity): the `curl localhost:4020/inject`
// workflow. Ported from the Rust axum router — same routes, same bodies.
//
// Best-effort bind: only ONE of the per-surface child processes wins the port;
// the loser just serves MCP (both read the same shared file).

import { injectEmail, injectEvent } from "./inject";
import { readItems } from "./store";

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await req.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleHttp(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (req.method === "POST" && pathname === "/inject") {
    return Response.json(injectEmail(await body(req)));
  }
  if (req.method === "POST" && pathname === "/inject-event") {
    return Response.json(injectEvent(await body(req)));
  }
  if (req.method === "GET" && pathname === "/health") {
    return new Response("ok");
  }
  if (req.method === "GET" && pathname === "/status") {
    return Response.json({
      email: readItems("email").length,
      meetings: readItems("meetings").length,
    });
  }
  return new Response("Not Found", { status: 404 });
}

export function maybeRunHttp(): void {
  const raw = process.env.MOCK_EMAIL_PORT;
  if (!raw) return;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return;
  try {
    Bun.serve({ port, hostname: "0.0.0.0", fetch: handleHttp });
    process.stderr.write(`magnis-mock-gmail: injection server on :${String(port)}\n`);
  } catch (e) {
    process.stderr.write(
      `magnis-mock-gmail: injection port ${String(port)} unavailable (${e instanceof Error ? e.message : String(e)}); MCP-only\n`,
    );
  }
}
