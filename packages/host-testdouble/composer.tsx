/** `@magnis/host/composer` — the shared composer a module wraps.
 *
 * Two halves, and they get different treatment.
 *
 * The DRAFT half (`useComposerDraft`, `writeDraftDirect`, the mount registry,
 * `applyComposerEvent`) is pure logic over `localStorage` and a single-slot
 * registry. A plugin's reply composer relies on it exactly — a draft that
 * survives a thread switch, a `composer.apply` event landing in the mounted
 * view and nowhere else — so it is reimplemented, not stubbed.
 *
 * The VIEW half (`MessageComposer`) is host chrome. The double keeps the
 * parts a wrapper drives: the textarea (under the wrapper's own test id),
 * Enter-to-send gating, the attach button's interactive/inert states, the
 * attachment chips, and the error line.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";

import { Icon } from "./ui";
import { mimeToIcon } from "./utils";

/* ── Draft storage ──────────────────────────────────────────── */

export type ComposerMode = "email" | "telegram";

export interface AttachmentMeta {
  readonly id: string;
  readonly name: string;
  readonly mimeType?: string;
}

export interface ComposerDraft {
  readonly text: string;
  readonly attachments: readonly string[];
  readonly attachmentMeta: readonly AttachmentMeta[];
  readonly revision: number;
}

const STORAGE_KEY = "magnis.composer.drafts.v1";

const EMPTY_DRAFT: ComposerDraft = { text: "", attachments: [], attachmentMeta: [], revision: 0 };

function draftKey(mode: ComposerMode, threadKey: string): string {
  return `${mode}:${threadKey}`;
}

interface PersistedDraft {
  readonly text?: string;
  readonly attachments?: readonly string[];
  readonly attachmentMeta?: readonly AttachmentMeta[];
  readonly revision?: number;
}

function readAll(): Record<string, PersistedDraft> {
  if (typeof localStorage === "undefined") return {};
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, PersistedDraft>;
  } catch (err: unknown) {
    // Corrupt storage must be visible, never a silent reset.
    console.error("useComposerDraft: corrupt localStorage; resetting drafts", err);
  }
  return {};
}

function writeAll(all: Record<string, PersistedDraft>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function readOne(mode: ComposerMode, threadKey: string): ComposerDraft {
  const raw = readAll()[draftKey(mode, threadKey)];
  if (!raw) return EMPTY_DRAFT;
  return {
    text: raw.text ?? "",
    attachments: raw.attachments ?? [],
    attachmentMeta: raw.attachmentMeta ?? [],
    revision: raw.revision ?? 0,
  };
}

function writeOne(mode: ComposerMode, threadKey: string, draft: ComposerDraft): void {
  const all = readAll();
  all[draftKey(mode, threadKey)] = draft;
  writeAll(all);
}

function deleteOne(mode: ComposerMode, threadKey: string): void {
  const key = draftKey(mode, threadKey);
  const { [key]: _removed, ...rest } = readAll();
  void _removed;
  writeAll(rest);
}

export interface ComposerDraftPatch {
  readonly text?: string;
  readonly attachments?: readonly string[];
  readonly attachmentMeta?: readonly AttachmentMeta[];
  readonly revision?: number;
}

export function writeDraftDirect(
  mode: ComposerMode,
  threadKey: string,
  patch: ComposerDraftPatch,
): ComposerDraft {
  const current = readOne(mode, threadKey);
  const next: ComposerDraft = {
    text: patch.text ?? current.text,
    attachments: patch.attachments ?? current.attachments,
    attachmentMeta: patch.attachmentMeta ?? current.attachmentMeta,
    revision: patch.revision ?? current.revision + 1,
  };
  writeOne(mode, threadKey, next);
  return next;
}

export interface UseComposerDraft {
  readonly draft: ComposerDraft;
  readonly setText: (text: string) => void;
  readonly setAttachments: (ids: readonly string[], meta?: readonly AttachmentMeta[]) => void;
  readonly clear: () => void;
  readonly applyRemote: (patch: ComposerDraftPatch) => void;
  readonly revision: number;
}

export function useComposerDraft(mode: ComposerMode, threadKey: string): UseComposerDraft {
  const [draft, setDraft] = useState<ComposerDraft>(() => readOne(mode, threadKey));
  const keyRef = useRef(draftKey(mode, threadKey));

  useEffect(() => {
    const newKey = draftKey(mode, threadKey);
    if (newKey === keyRef.current) return;
    keyRef.current = newKey;
    setDraft(readOne(mode, threadKey));
  }, [mode, threadKey]);

  const update = useCallback(
    (patch: ComposerDraftPatch) => {
      setDraft(writeDraftDirect(mode, threadKey, patch));
    },
    [mode, threadKey],
  );

  return {
    draft,
    revision: draft.revision,
    setText: useCallback(
      (text: string) => {
        update({ text });
      },
      [update],
    ),
    setAttachments: useCallback(
      (attachments: readonly string[], meta?: readonly AttachmentMeta[]) => {
        update(meta ? { attachments, attachmentMeta: meta } : { attachments });
      },
      [update],
    ),
    applyRemote: useCallback(
      (patch: ComposerDraftPatch) => {
        update(patch);
      },
      [update],
    ),
    clear: useCallback(() => {
      deleteOne(mode, threadKey);
      setDraft(EMPTY_DRAFT);
    }, [mode, threadKey]),
  };
}

export const __INTERNAL = { STORAGE_KEY, draftKey };

/* ── Mount registry ─────────────────────────────────────────── */

export interface MountedComposer {
  readonly mode: ComposerMode;
  readonly threadKey: string;
  applyOp(patch: ComposerDraftPatch): void;
}

interface MountRegistry {
  current(): MountedComposer | null;
  register(m: MountedComposer): () => void;
}

const Ctx = createContext<MountRegistry | null>(null);

export function ComposerMountProvider({ children }: { children: ReactNode }): JSX.Element {
  const slotRef = useRef<MountedComposer | null>(null);

  const register = useCallback((m: MountedComposer): (() => void) => {
    slotRef.current = m;
    return (): void => {
      if (slotRef.current === m) slotRef.current = null;
    };
  }, []);

  const value = useMemo<MountRegistry>(
    () => ({ current: (): MountedComposer | null => slotRef.current, register }),
    [register],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useComposerMountRegistry(): MountRegistry {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useComposerMountRegistry must be used inside <ComposerMountProvider>");
  }
  return ctx;
}

/* ── Apply handler ──────────────────────────────────────────── */

export type ComposerApplyEvent =
  | {
      readonly type: "composer.apply";
      readonly mode: ComposerMode;
      readonly thread_key: string;
      readonly revision: number;
      readonly op: "set_text";
      readonly text: string;
    }
  | {
      readonly type: "composer.apply";
      readonly mode: ComposerMode;
      readonly thread_key: string;
      readonly revision: number;
      readonly op: "append_text";
      readonly text: string;
    }
  | {
      readonly type: "composer.apply";
      readonly mode: ComposerMode;
      readonly thread_key: string;
      readonly revision: number;
      readonly op: "set_attachments";
      readonly attachment_ids: readonly string[];
    };

export function applyComposerEvent(
  event: ComposerApplyEvent,
  mounted: MountedComposer | null,
  currentText = "",
  currentAttachmentMeta: readonly AttachmentMeta[] = [],
): void {
  if (!mounted) return;
  if (mounted.mode !== event.mode) return;
  if (mounted.threadKey !== event.thread_key) return;
  switch (event.op) {
    case "set_text":
      mounted.applyOp({ text: event.text, revision: event.revision });
      return;
    case "append_text":
      mounted.applyOp({ text: currentText + event.text, revision: event.revision });
      return;
    case "set_attachments": {
      const metaById = new Map(currentAttachmentMeta.map((m) => [m.id, m]));
      mounted.applyOp({
        attachments: event.attachment_ids,
        attachmentMeta: event.attachment_ids.map((id) => metaById.get(id) ?? { id, name: id }),
        revision: event.revision,
      });
      return;
    }
    default:
      // Forward-compat: an op this build does not know is dropped.
      return;
  }
}

/* ── The composer view ──────────────────────────────────────── */

export interface MessageComposerAttachment {
  readonly id: string;
  readonly name: string;
  readonly mimeType?: string;
}

export function MessageComposer({
  value,
  onChange,
  onSend,
  placeholder = "Type a message...",
  rows = 3,
  disabled = false,
  sendOnEnter = true,
  layout = "stacked",
  sendIcon = "arrow-up",
  sendIconClassName,
  hideAttach = false,
  onAttachClick,
  attachments,
  onRemoveAttachment,
  errorText,
  textareaTestId,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend?: () => void;
  readonly placeholder?: string;
  readonly rows?: number;
  readonly disabled?: boolean;
  readonly sendOnEnter?: boolean;
  readonly layout?: "stacked" | "inline";
  readonly sendIcon?: "arrow-up" | "send";
  readonly sendIconClassName?: string;
  readonly hideAttach?: boolean;
  readonly onAttachClick?: () => void;
  readonly attachments?: readonly MessageComposerAttachment[];
  readonly onRemoveAttachment?: (id: string) => void;
  readonly errorText?: string;
  readonly textareaTestId?: string;
}): JSX.Element {
  const canSend = !disabled && value.trim().length > 0 && onSend !== undefined;
  const attachInteractive = !hideAttach && onAttachClick !== undefined;
  const hasChips = attachments !== undefined && attachments.length > 0;

  return (
    <div data-host="MessageComposer" data-layout={layout}>
      {hasChips ? (
        <div>
          {attachments.map((a) => (
            <span key={a.id} data-testid="composer-attachment-chip" data-attachment-id={a.id}>
              <Icon name={mimeToIcon(a.mimeType ?? "")} />
              <span>{a.name}</span>
              {onRemoveAttachment ? (
                <button
                  type="button"
                  title="Remove attachment"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => {
                    onRemoveAttachment(a.id);
                  }}
                >
                  <Icon name="close" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {!hideAttach && (
        <button
          type="button"
          title="Attach"
          disabled={!attachInteractive}
          onClick={attachInteractive ? onAttachClick : undefined}
        >
          <Icon name="paperclip" />
        </button>
      )}
      <textarea
        data-testid={textareaTestId}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        rows={layout === "inline" ? 1 : rows}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (sendOnEnter && e.key === "Enter" && !e.shiftKey && canSend) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <button type="button" title="Emoji">
        <Icon name="smile" />
      </button>
      <button type="button" title="Send" disabled={!canSend} onClick={onSend}>
        <Icon name={sendIcon} className={sendIconClassName} />
      </button>
      {errorText ? <div role="alert">{errorText}</div> : null}
    </div>
  );
}
