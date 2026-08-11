/**
 * Panels — host chrome that renders around whatever entity is in view.
 *
 * A panel is not a module: it is not discovered, ordered or installed, so
 * there is no registry here. Consumers import by name from this barrel, and
 * `panels/__tests__/panelBoundary.test.ts` enforces that it is the only way
 * in. If a second consumer ever needs to resolve a panel by id, that is when
 * a registry gets built — not before.
 */
export { ContextPanel, AgentStatsRegion, AgentStatsRegionConnected, mergeContextPanelEpisodes, invalidateEpisodeContextQueries, } from "./context";
export type { ContextPanelProps } from "./context";
