/**
 * ProseMirror suggestion plugin for note @-mentions.
 *
 * Tracks an active `@<query>` range, fires open/update/close callbacks, and
 * exposes a `selectMention` command that replaces the range with a
 * link-marked text node. Designed to be installed by Milkdown via
 * `$prose(() => createMentionPlugin(callbacks))`, but works against any
 * CommonMark-compatible schema with `link` mark + `code`/`code_block`.
 */
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
export interface MentionPluginCallbacks {
    onOpen(query: string, caretRect: DOMRect): void;
    onUpdate(query: string, caretRect: DOMRect): void;
    onClose(): void;
}
export interface MentionSelection {
    readonly schemaId: string;
    readonly entityId: string;
    readonly displayName: string;
}
export interface MentionState {
    readonly active: boolean;
    readonly from: number;
    readonly to: number;
    readonly query: string;
}
export declare const mentionPluginKey: PluginKey<MentionState | null>;
export declare function createMentionPlugin(callbacks: MentionPluginCallbacks): Plugin<MentionState | null>;
/**
 * Replace the active mention range with a link-marked text node and a
 * trailing space. Returns false when the plugin is inactive OR
 * `entityHref` cannot resolve the schema/id pair.
 */
export declare function selectMention(view: EditorView, item: MentionSelection): boolean;
