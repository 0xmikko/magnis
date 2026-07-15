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
declare function draftKey(mode: ComposerMode, threadKey: string): string;
export interface ComposerDraftPatch {
    readonly text?: string;
    readonly attachments?: readonly string[];
    readonly attachmentMeta?: readonly AttachmentMeta[];
    /** When provided, sets revision instead of bumping it (used by apply handler). */
    readonly revision?: number;
}
/**
 * Non-React helper: write a patch directly to draft storage.
 *
 * Used by callers outside React (e.g. telegram/index.tsx onDraftRequest).
 * Bumps revision unless `patch.revision` is supplied. Returns the new draft.
 */
export declare function writeDraftDirect(mode: ComposerMode, threadKey: string, patch: ComposerDraftPatch): ComposerDraft;
export interface UseComposerDraft {
    readonly draft: ComposerDraft;
    readonly setText: (text: string) => void;
    readonly setAttachments: (ids: readonly string[], meta?: readonly AttachmentMeta[]) => void;
    readonly clear: () => void;
    /** Apply a revision-bearing patch (e.g. from composer.apply). */
    readonly applyRemote: (patch: ComposerDraftPatch) => void;
    readonly revision: number;
}
export declare function useComposerDraft(mode: ComposerMode, threadKey: string): UseComposerDraft;
export declare const __INTERNAL: {
    STORAGE_KEY: string;
    draftKey: typeof draftKey;
};
export {};
