/**
 * EmailReplyComposer — per-surface wrapper container for the email reply composer.
 *
 * Owns: draft persistence (via useComposerDraft, keyed by thread_id),
 * presence RPC on mount/unmount and thread switch, mount-registry
 * registration for composer.apply events, attachment_ids forwarding,
 * attachment picker UI, and draft clearing on successful send while
 * preserving on rejection.
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type JSX } from "react";
import { MessageComposer } from "@magnis/host/composer";
import type { MessageComposerAttachment } from "@magnis/host/composer";
import { useComposerDraft } from "@magnis/host/composer";
import { useComposerMountRegistry } from "@magnis/host/composer";
import { applyComposerEvent, type ComposerApplyEvent } from "@magnis/host/composer";
import type { ComposerApplyEventPayload } from "@magnis/host/runtime";
import { useAppRuntime } from "@magnis/host/runtime";
import { uploadBrowserFile } from "@magnis/host/runtime";

export interface EmailReplyComposerProps {
  readonly emailId: string;
  readonly threadId: string;
  readonly senderName?: string;
  readonly disabled?: boolean;
}

export function EmailReplyComposer({
  emailId,
  threadId,
  senderName,
  disabled,
}: EmailReplyComposerProps): JSX.Element {
  const runtime = useAppRuntime();
  const registry = useComposerMountRegistry();
  // Draft keyed by thread_id (not email_id) so multiple emails in the
  // same thread share one draft.
  const { draft, setText, setAttachments, clear, applyRemote } = useComposerDraft("email", threadId);

  // Mount → setPresence({mode:"email", thread_key}); unmount/thread switch → null.
  useEffect(() => {
    const unregister = registry.register({
      mode: "email",
      threadKey: threadId,
      applyOp: applyRemote,
    });
    runtime.composer.setPresence({ mode: "email", thread_key: threadId });
    return (): void => {
      runtime.composer.setPresence(null);
      unregister();
    };
  }, [registry, runtime, threadId, applyRemote]);

  // Track latest draft text via ref so onApply's `append_text` concatenates
  // the freshest value without re-subscribing on every keystroke.
  const draftTextRef = useRef(draft.text);
  useEffect(() => {
    draftTextRef.current = draft.text;
  }, [draft.text]);

  // Track latest attachment meta so `set_attachments` can preserve filenames
  // for ids that survive the replace (chips and payload stay consistent).
  const attachmentMetaRef = useRef(draft.attachmentMeta);
  useEffect(() => {
    attachmentMetaRef.current = draft.attachmentMeta;
  }, [draft.attachmentMeta]);

  // Subscribe to runtime.composer.onApply. Filter by
  // (mode, thread_key) before delegating to applyComposerEvent.
  useEffect(() => {
    const unsubscribe = runtime.composer.onApply((event: ComposerApplyEventPayload): void => {
      if (event.mode !== "email") return;
      if (event.thread_key !== threadId) return;
      const typed = event as unknown as ComposerApplyEvent;
      applyComposerEvent(
        typed,
        { mode: "email", threadKey: threadId, applyOp: applyRemote },
        draftTextRef.current,
        attachmentMetaRef.current,
      );
    });
    return (): void => {
      unsubscribe();
    };
  }, [runtime, threadId, applyRemote]);

  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSend = useCallback(() => {
    if (sendingRef.current) return;
    const text = draft.text.trim();
    if (!text) return;

    sendingRef.current = true;
    setSending(true);

    const finish = (ok: boolean): void => {
      sendingRef.current = false;
      setSending(false);
      if (ok) clear();
    };

    // Outbound API is `email.reply {email_id, body_text, attachment_ids}`.
    runtime.transport
      .rpc("email.reply", {
        email_id: emailId,
        body_text: text,
        attachment_ids: [...draft.attachments],
      })
      .then(() => { finish(true); })
      .catch(() => { finish(false); });
  }, [draft.text, draft.attachments, emailId, runtime, clear]);

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const selected: readonly File[] = Array.from(files);
      // Reset input so selecting the same file twice still triggers `change`.
      e.target.value = "";
      setUploadError(null);

      void (async (): Promise<void> => {
        const uploaded: { readonly id: string; readonly name: string; readonly mimeType: string }[] = [];
        for (const file of selected) {
          try {
            const result = await uploadBrowserFile(runtime.transport, file);
            uploaded.push({ id: result.id, name: result.name, mimeType: result.mimeType });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Upload failed";
            setUploadError(msg);
            break;
          }
        }
        if (uploaded.length > 0) {
          const nextIds = [...draft.attachments, ...uploaded.map((u) => u.id)];
          const nextMeta = [...draft.attachmentMeta, ...uploaded];
          setAttachments(nextIds, nextMeta);
        }
      })();
    },
    [runtime, draft.attachments, draft.attachmentMeta, setAttachments],
  );

  const handleRemoveAttachment = useCallback(
    (id: string): void => {
      const nextIds = draft.attachments.filter((a) => a !== id);
      const nextMeta = draft.attachmentMeta.filter((m) => m.id !== id);
      setAttachments(nextIds, nextMeta);
    },
    [draft.attachments, draft.attachmentMeta, setAttachments],
  );

  const placeholder = senderName ? `Reply to ${senderName}...` : undefined;

  const chips: readonly MessageComposerAttachment[] = draft.attachmentMeta.map((m) => ({
    id: m.id,
    name: m.name,
    mimeType: m.mimeType,
  }));

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
        data-testid="email-attachment-input"
      />
      <MessageComposer
        layout="stacked"
        rows={6}
        sendOnEnter={false}
        value={draft.text}
        onChange={setText}
        onSend={handleSend}
        placeholder={placeholder}
        disabled={disabled === true || sending}
        onAttachClick={handleAttachClick}
        attachments={chips}
        onRemoveAttachment={handleRemoveAttachment}
        errorText={uploadError ?? undefined}
        textareaTestId="email-composer-textarea"
      />
    </>
  );
}
