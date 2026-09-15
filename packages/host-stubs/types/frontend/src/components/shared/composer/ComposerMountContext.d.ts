import { type JSX, type ReactNode } from "react";
import type { ComposerMode, ComposerDraftPatch } from "./useComposerDraft";
/** Description of the currently-mounted wrapper, registered for the apply handler. */
export interface MountedComposer {
    readonly mode: ComposerMode;
    readonly threadKey: string;
    /** Receives a revision-bearing patch from a `composer.apply` event. */
    applyOp(patch: ComposerDraftPatch): void;
}
interface MountRegistry {
    /** Currently-mounted composer or null. Single-slot per DEC-7. */
    current(): MountedComposer | null;
    register(m: MountedComposer): () => void;
}
export declare function ComposerMountProvider({ children }: {
    children: ReactNode;
}): JSX.Element;
export declare function useComposerMountRegistry(): MountRegistry;
export {};
