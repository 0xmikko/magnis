/**
 * Pure batch-send loop for telegram.batch_send.
 *
 * Extracted from TelegramModule.messagesBatchSend so the per-recipient
 * failure-isolation behaviour can be unit-tested without instantiating the
 * decorated module. The loop is SEQUENTIAL (mirrors email.batch_send; sequential
 * pacing avoids a burst on the shared MTProto socket) and — critically — NEVER
 * throws mid-batch: a failed recipient is recorded with status "failed" and the
 * loop continues. That way an interrupted batch still reports what was delivered
 * (the tool's contract is "per-recipient results") and a re-approval can't silently
 * double-send the recipients that already succeeded.
 */

export interface BatchSendItem {
  chat_id: number | string;
  text: string;
  reply_to_message_id?: number;
}

export interface BatchRecipientResult {
  chat_id: number | string;
  status: "sent" | "failed";
  id?: unknown;
  error?: string;
}

export interface BatchSendOutcome {
  results: BatchRecipientResult[];
  total: number;
  sent: number;
  failed: number;
}

/** Send each item via `send`, capturing a per-recipient success/failure. Never
 *  throws for a per-recipient send error — see module docstring. */
export async function runBatchSend(
  items: readonly BatchSendItem[],
  send: (item: BatchSendItem) => Promise<Record<string, unknown>>,
): Promise<BatchSendOutcome> {
  const results: BatchRecipientResult[] = [];
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const r = await send(item);
      sent++;
      results.push({ chat_id: item.chat_id, status: "sent", id: r.id ?? null });
    } catch (e) {
      failed++;
      results.push({
        chat_id: item.chat_id,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { results, total: items.length, sent, failed };
}
