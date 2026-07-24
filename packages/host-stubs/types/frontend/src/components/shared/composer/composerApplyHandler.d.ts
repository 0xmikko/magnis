import type { MountedComposer } from "./ComposerMountContext";
import type { AttachmentMeta, ComposerMode } from "./useComposerDraft";
/**
 * Shape of a `composer.apply` event delivered over the WS bus.
 *
 * The ops are `set_text`, `append_text`, and `set_attachments`.
 * `applyComposerEvent` drops unknown ops silently so an older frontend
 * deployed against a newer backend does not crash.
 */
export type ComposerApplyEvent = {
    readonly type: "composer.apply";
    readonly mode: ComposerMode;
    readonly thread_key: string;
    readonly revision: number;
    readonly op: "set_text";
    readonly text: string;
} | {
    readonly type: "composer.apply";
    readonly mode: ComposerMode;
    readonly thread_key: string;
    readonly revision: number;
    readonly op: "append_text";
    readonly text: string;
} | {
    readonly type: "composer.apply";
    readonly mode: ComposerMode;
    readonly thread_key: string;
    readonly revision: number;
    readonly op: "set_attachments";
    readonly attachment_ids: readonly string[];
};
/**
 * Dispatch a `composer.apply` event into the currently-mounted composer.
 *
 * Drops silently when there is no mounted composer or when (mode, thread_key)
 * mismatches. Cross-user isolation is handled upstream by the WS filter; this
 * layer only filters within a user's own tabs to the matching mounted view.
 *
 * Never invokes onSend — an apply event can edit a draft but never send it.
 * Only mutates draft state via mounted.applyOp.
 */
export declare function applyComposerEvent(event: ComposerApplyEvent, mounted: MountedComposer | null, currentText?: string, currentAttachmentMeta?: readonly AttachmentMeta[]): void;
