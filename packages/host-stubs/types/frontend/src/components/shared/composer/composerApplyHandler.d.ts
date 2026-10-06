import type { ComposerApplyEvent } from "@magnis/sdk";
import type { MountedComposer } from "./ComposerMountContext";
import type { AttachmentMeta } from "./useComposerDraft";
/**
 * Dispatch a `composer.apply` event into the currently-mounted composer.
 *
 * Drops silently when there is no mounted composer or when (mode, threadKey)
 * mismatches. Per INV-15: cross-user isolation is handled upstream by the WS
 * filter; this layer only filters within a user's own tabs to the matching
 * mounted view.
 *
 * A text op without `text`, or `set_attachments` without `attachmentIds`,
 * is a protocol bug and throws.
 *
 * Never invokes onSend (INV-10). Only mutates draft state via mounted.applyOp.
 */
export declare function applyComposerEvent(event: ComposerApplyEvent, mounted: MountedComposer | null, currentText?: string, currentAttachmentMeta?: readonly AttachmentMeta[]): void;
