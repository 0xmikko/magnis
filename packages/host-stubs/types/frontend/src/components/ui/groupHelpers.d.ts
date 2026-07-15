export interface ListGroup<T> {
    readonly key: string;
    readonly label: string;
    readonly items: readonly T[];
    readonly date?: Date;
    /** When true, items are pinned — rendered without a separator header. */
    readonly pinned?: boolean;
}
/**
 * Group items by date (day). Pinned items go first (no separator).
 * Items without a date go into an "Other" group at the end.
 * Groups sorted newest-first.
 */
export declare function groupByDate<T>(items: readonly T[], getDate: (item: T) => Date | null, isPinned?: (item: T) => boolean): readonly ListGroup<T>[];
/**
 * Group items by first letter of a sort key. Pinned items go first (no separator).
 * "#" for non-alphabetic. Groups sorted A-Z, with "#" at the end.
 */
export declare function groupByLetter<T>(items: readonly T[], getSortKey: (item: T) => string, isPinned?: (item: T) => boolean): readonly ListGroup<T>[];
