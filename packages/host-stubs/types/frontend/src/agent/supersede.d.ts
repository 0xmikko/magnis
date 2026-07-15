/**
 * Supersede heuristic for pending agent tool-calls.
 *
 * DEC-5 / INV-6: a pending tool-call is "Superseded" only when a LATER pending
 * call has the SAME tool name AND the SAME recipient identity. Keying on the
 * tool name alone (the old rule) collapsed a legitimate multi-recipient
 * fan-out — e.g. N telegram sends to N distinct chats — into "all but the last
 * superseded".
 *
 * The recipient identity is NOT computed here: this host-layer helper must not
 * carry plugin-specific tool knowledge (which tool names carry a `chat_id`, etc.).
 * The caller supplies `recipientKeyOf`, which routes through the existing module
 * contribution seam (`runtime.agent.resolveAllowlistTarget` → each plugin's
 * `extractAllowlistTarget`). That keeps a single source of truth for "the
 * recipient identity of a tool-call". A tool with no recognised recipient → empty
 * key → the rule degrades to name-only matching (the previous behaviour).
 */
import type { PendingToolCall } from "@magnis/agent-core";
/** True if `tc` is superseded: archived, or a later PENDING call shares its
 *  (name + recipient identity, per `recipientKeyOf`). */
export declare function isSuperseded(tc: PendingToolCall, toolCalls: readonly PendingToolCall[], archived: boolean, recipientKeyOf: (tc: PendingToolCall) => string): boolean;
