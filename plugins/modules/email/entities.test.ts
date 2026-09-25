/** The declaration is not a wish: every record this module writes has to pass
 * it, and a record it does not write has to be refused with the field named.
 *
 * Proven through the module's REAL ingest — the same path a provider's
 * envelope takes — rather than against hand-copied dictionaries, because a
 * fixture list would drift from the code the moment either changed.
 *
 * This file sits beside entities.ts and outside module/ on purpose: it is the
 * declaration's test, and the module's own tsconfig must never see zod.
 */
import { describe, expect, it } from "vitest";
import type { GraphBatchInput } from "@magnis/plugin-sdk";
import { mockGraph, mountModule } from "@magnis/testkit/module";

import { EmailModule } from "./module/service.ts";
import { address, message } from "./entities.ts";
import type { SyncEnvelope } from "./types.ts";

const DECLARED = { "email.message": message, "email.address": address } as const;

function ingestGraph() {
  return mockGraph({
    apply_batch: (frag) =>
      Promise.resolve({
        ids: Object.fromEntries(frag.entities.map((e) => [e.key, `id-${e.key}`])),
        created: frag.entities.length,
        updated: 0,
        links_added: frag.links?.length ?? 0,
        dropped_keys: [],
      }),
    file_register: () => Promise.resolve("file-id"),
    find_by_anchor: () => Promise.resolve("existing-id"),
    delete_entity: () => Promise.resolve(undefined),
    source_command: () => Promise.resolve({ message_id: "sent-1" }),
    sync_state: () => Promise.resolve({ accounts: [{ account_id: "acct-1", sync: {} }] }),
  });
}

const env = (over: Partial<SyncEnvelope> & { payload?: Record<string, unknown> }): SyncEnvelope => ({
  source_id: "google",
  surface: "email",
  account_id: "acct-1",
  user_id: "u1",
  kind: "snapshot",
  remote_id: "m1",
  payload: {},
  timestamp: "2026-03-14T09:00:00Z",
  ...over,
});

/** A provider's message, with every key the module stores. */
const msgPayload = (over: Record<string, unknown> = {}) => ({
  message_id: "mail-1",
  subject: "Report Q3",
  from_address: "CEO@example.com",
  from_name: "CEO",
  to_addresses: "me@example.com, ops@example.com",
  cc_addresses: "cc@example.com",
  bcc_addresses: "bcc@example.com",
  snippet: "Q3 results",
  body_text: "see attached",
  body_html: "<p>see attached</p>",
  has_html_body: true,
  sent_at: "2026-03-14T09:00:00Z",
  received_at: "2026-03-14T09:01:00Z",
  labels: ["INBOX", "IMPORTANT"],
  is_read: false,
  is_starred: false,
  is_important: true,
  has_attachments: true,
  thread_id: "thread-1",
  attachments: [{ filename: "q3.pdf", mime_type: "application/pdf", size: 12, path: "q3.pdf" }],
  ...over,
});

async function written(): Promise<GraphBatchInput["entities"]> {
  const graph = ingestGraph();
  const mod = mountModule(EmailModule, { graph, ctx: { extension_id: "email" } }).module;
  await mod.ingest({ envelopes: [env({ remote_id: "m1", payload: msgPayload() })] });
  await mod.emailSend({ to: "ops@example.com", subject: "Report Q3", body_text: "see attached" });
  const calls = graph.spies.apply_batch?.mock.calls ?? [];
  if (calls.length !== 2) throw new Error("ingest and send must each write once");
  return calls.flatMap((call) => (call[0] as GraphBatchInput).entities);
}

describe("email declares what it writes", () => {
  it("every record the module writes today passes its own declaration", async () => {
    const entities = await written();
    expect(entities.length).toBeGreaterThan(0);
    for (const written of entities) {
      const declared = DECLARED[written.schema_id as keyof typeof DECLARED];
      expect(declared, `${written.schema_id} is written but not declared`).toBeDefined();
      const verdict = declared.safeParse(written.properties ?? {});
      expect(verdict.error?.issues ?? []).toEqual([]);
    }
  });

  it("a field the module does not declare is refused, and the error names it", () => {
    const verdict = message.safeParse({ subject: "Report Q3", priority: "high" });
    expect(verdict.success).toBe(false);
    expect(JSON.stringify(verdict.error?.issues)).toContain("priority");
  });

  it("a recipient list is an edge, so writing it back as a string is refused", () => {
    const verdict = message.safeParse({ to_addresses: "me@example.com" });
    expect(verdict.success).toBe(false);
  });
});
