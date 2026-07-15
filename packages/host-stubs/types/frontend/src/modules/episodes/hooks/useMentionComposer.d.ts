/**
 * useMentionComposer — @-mention logic for a contentEditable div.
 *
 * Detects "@" in text, manages popup state, keyboard navigation,
 * and inserts inline chips into the editable div.
 */
import { type KeyboardEvent, type RefObject } from "react";
import type { EntityMention, EntitySearchResult } from "../types";
/**
 * Build a DocumentFragment for inserting plain (pasted/dictated) text into the
 * contentEditable. Line endings are normalized to `\n` (CRLF / bare CR collapse
 * to one), and each line becomes a text node separated by a single <br>. This
 * round-trips through getTextContent (BR → "\n") to EXACTLY the normalized text —
 * unlike inserting one raw text node with embedded `\r\n`, which the pre-wrap
 * editor rendered with doubled gaps and leaked `\r` into the sent message.
 */
export declare function buildPlainTextFragment(raw: string): DocumentFragment;
/** Collapse the selection to the very end of `el`. Used after restoring the
 *  editor's innerHTML across a collapsed↔expanded swap so continued typing /
 *  macOS dictation appends at the end instead of the start (which reordered
 *  words). */
export declare function placeCaretAtEnd(el: HTMLElement): void;
export interface UseMentionComposerResult {
    readonly mentions: readonly EntityMention[];
    readonly isMentionActive: boolean;
    readonly mentionQuery: string;
    readonly selectedIndex: number;
    readonly searchResults: readonly EntitySearchResult[];
    readonly isSearchLoading: boolean;
    readonly activeCategory: string | null;
    readonly handleKeyDown: (e: KeyboardEvent<HTMLDivElement>) => boolean;
    readonly handleInput: () => void;
    readonly handleSelect: (item: EntitySearchResult) => void;
    readonly handleCategorySelect: (schemaId: string) => void;
    readonly handleCategoryBack: () => void;
    readonly clearAll: () => void;
    /** Extract plain text + mentions from the contentEditable div */
    readonly extractContent: () => {
        text: string;
        mentions: readonly EntityMention[];
    };
}
/** Build a mention chip element using safe DOM APIs (no innerHTML). */
export declare function mentionChipSchemaId(schemaId: string): string;
export declare function useMentionComposer(editorRef: RefObject<HTMLDivElement | null>): UseMentionComposerResult;
