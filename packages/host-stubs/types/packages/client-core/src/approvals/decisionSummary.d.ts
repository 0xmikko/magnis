import type { ResolvedDecision } from "../types/episode.ts";
import { type ApprovalReadState } from "./queue.ts";
/**
 * Derive a ResolvedDecision for a given tool call from the already-persisted
 * episode state. The approval summary is status-only (the backend does not
 * persist executed-result messages — see chat.rs and AgentChatStore
 * reconstruction). The ask_user summary pairs the originating tool_call with
 * its per-id answering user_message block, so interleaved multi-turn
 * conversations resolve independently.
 *
 * Approval decisions are returned for:
 *  - tool calls that went through a real approval flow (have `approvalId`), or
 *  - completed tool calls whose `tool_result` is a mutation envelope or an
 *    entity-shaped return with a top-level `id` (see `isMutationResult`).
 *
 * The second branch makes the chat render mutation outcomes as the
 * immutable, static summary card even when approval was bypassed
 * (`DISABLE_TOOL_APPROVAL=1`) or auto-granted via allowlist. Plain read
 * tools (lists, gets) still fall through to their module renderer.
 *
 * Returns `null` when the tool call has not been resolved yet (still
 * pending), when the id is unknown, or when no pairing exists.
 */
export declare function resolveDecisionForToolCall(state: ApprovalReadState, toolCallId: string): ResolvedDecision | null;
