/**
 * TelegramReplyComposer — per-surface wrapper container for the telegram reply composer.
 *
 * Owns: draft persistence (via useComposerDraft), presence RPC on mount/unmount
 * and thread switch, mount-registry registration, Enter-to-send with in-flight
 * guard, and draft clearing on successful send.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { MessageComposer } from "@magnis/host/composer";
import { useComposerDraft } from "@magnis/host/composer";
import { useComposerMountRegistry } from "@magnis/host/composer";
import { applyComposerEvent, type ComposerApplyEvent } from "@magnis/host/composer";
import type { ComposerApplyEventPayload } from "@magnis/host/runtime";
import { useAppRuntime } from "@magnis/host/runtime";

export interface TelegramReplyComposerProps {
  readonly chatId: string | number;
  readonly onSendMessage?: (text: string) => void | Promise<void>;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}

export function TelegramReplyComposer({
  chatId,
  onSendMessage,
  placeholder,
  disabled,
}: TelegramReplyComposerProps): JSX.Element {
  // Canonical threadKey is String(chat_id).
  const threadKey = String(chatId);
  const runtime = useAppRuntime();
  const registry = useComposerMountRegistry();
  const { draft, setText, clear, applyRemote } = useComposerDraft("telegram", threadKey);

  // Register mount in the single-slot registry + manage presence lifecycle.
  // Mount → setPresence({mode, thread_key}); unmount or thread switch → setPresence(null).
  useEffect(() => {
    const unregister = registry.register({
      mode: "telegram",
      threadKey,
      applyOp: applyRemote,
    });
    runtime.composer.setPresence({ mode: "telegram", thread_key: threadKey });
    return (): void => {
      runtime.composer.setPresence(null);
      unregister();
    };
  }, [registry, runtime, threadKey, applyRemote]);

  // Track latest draft text via ref so the onApply handler's `append_text` op
  // concatenates against the freshest value without re-subscribing on every
  // keystroke.
  const draftTextRef = useRef(draft.text);
  useEffect(() => {
    draftTextRef.current = draft.text;
  }, [draft.text]);

  // Stage 4.4: subscribe to runtime.composer.onApply so agent tool calls
  // (`*.composer.set_text` / `append_text` / `set_attachments`) reach this
  // mounted wrapper's draft. Filter by (mode, thread_key) here before
  // delegating to applyComposerEvent so we read the freshest draft text.
  useEffect(() => {
    const unsubscribe = runtime.composer.onApply((event: ComposerApplyEventPayload): void => {
      if (event.mode !== "telegram") return;
      if (event.thread_key !== threadKey) return;
      const typed = event as unknown as ComposerApplyEvent;
      applyComposerEvent(
        typed,
        { mode: "telegram", threadKey, applyOp: applyRemote },
        draftTextRef.current,
      );
    });
    return (): void => {
      unsubscribe();
    };
  }, [runtime, threadKey, applyRemote]);

  // Guard against Enter being pressed twice while a send is in flight.
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const handleSend = useCallback(() => {
    if (sendingRef.current) return;
    const text = draft.text.trim();
    if (!text || !onSendMessage) return;

    sendingRef.current = true;
    setSending(true);

    const finish = (ok: boolean): void => {
      sendingRef.current = false;
      setSending(false);
      // Success → clear; failure → preserve text.
      if (ok) clear();
    };

    let result: void | Promise<void>;
    try {
      result = onSendMessage(text);
    } catch {
      finish(false);
      return;
    }

    if (result && typeof result.then === "function") {
      result
        .then(() => { finish(true); })
        .catch(() => { finish(false); });
    } else {
      finish(true);
    }
  }, [draft.text, onSendMessage, clear]);

  return (
    <MessageComposer
      layout="inline"
      sendIcon="send"
      sendIconClassName="text-[#6AB2F2]"
      value={draft.text}
      onChange={setText}
      onSend={onSendMessage ? handleSend : undefined}
      placeholder={placeholder}
      disabled={disabled === true || sending || !onSendMessage}
      hideAttach
      textareaTestId="telegram-composer-textarea"
    />
  );
}
