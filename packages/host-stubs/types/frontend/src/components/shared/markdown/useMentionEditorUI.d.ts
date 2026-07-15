/**
 * Wiring layer between `mentionPlugin` and the presentational
 * `MentionPopup`. Owns the React UI state (open / query / caretRect /
 * selectedIndex), forwards plugin callbacks, intercepts the keymap, and
 * renders the popup with `caret-rect` placement.
 *
 * Consumers (MarkdownEditor) provide:
 *   - `getView` — returns the live ProseMirror EditorView, or null while
 *     the editor is still loading.
 *   - `mentionSuggestion` — search results sourced from a host-owned hook
 *     (NoteDetail calls `useMentionSearch`). Optional: when omitted, the
 *     hook is inert.
 *
 * Returns:
 *   - `pluginCallbacks` — stable refs to pass into `createMentionPlugin`.
 *   - `handleKeyDown` — wire into `editorViewOptionsCtx.handleKeyDown`.
 *   - `popup` — the JSX to render (already portaled when open).
 */
import { type ReactNode } from "react";
import type { EditorView } from "prosemirror-view";
import { type MentionPluginCallbacks } from "./mentionPlugin";
import type { EntitySearchResult } from "../../../modules/episodes/types";
export interface MentionSuggestionConfig {
    readonly results: readonly EntitySearchResult[];
    readonly isLoading: boolean;
    readonly onQueryChange: (query: string, active: boolean) => void;
}
export interface UseMentionEditorUIArgs {
    readonly getView: () => EditorView | null;
    readonly mentionSuggestion?: MentionSuggestionConfig;
}
export interface UseMentionEditorUIReturn {
    readonly pluginCallbacks: MentionPluginCallbacks;
    readonly handleKeyDown: (view: EditorView, event: KeyboardEvent) => boolean;
    readonly popup: ReactNode;
}
export declare function useMentionEditorUI({ getView, mentionSuggestion, }: UseMentionEditorUIArgs): UseMentionEditorUIReturn;
