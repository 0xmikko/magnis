/**
 * Key for an episode started by the "new chat" button.
 *
 * The chat store keys streams by contextKey, so starting a new episode on the
 * entity's own key aborts and completes whatever is still streaming there. The
 * fresh key must therefore be distinct from the base key on every call, while
 * still carrying it as a prefix so the episode remains attributable to its
 * chat.
 */
export declare function freshEpisodeKey(baseContextKey: string): string;
