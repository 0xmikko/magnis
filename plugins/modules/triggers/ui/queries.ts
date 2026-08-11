/**
 * The triggers module's query keys, in one place, matching the seven sibling
 * modules that each own a `ui/queries.ts`. Before this there were five inline
 * key literals across two files, and two of them fetched `triggers.get` for the
 * same id under different keys — the card's status and the panel's Pause button
 * read from separate cache entries, and only a prefix invalidation on
 * `["triggers"]` kept them agreeing.
 */
export const triggerKeys = {
  all: ["triggers"] as const,
  detail: (id: string | undefined) => ["triggers", "detail", id] as const,
  history: (id: string | undefined) => ["triggers", "fire-history", id] as const,
  watchedEntities: (id: string | undefined, watchIds: readonly string[]) =>
    ["triggers", "watched-entities", id, watchIds] as const,
} as const;
