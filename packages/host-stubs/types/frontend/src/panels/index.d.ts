/**
 * Panels — host chrome that renders around whatever entity is in view.
 *
 * A panel is not a module: it is not discovered, ordered or installed, so there
 * is no registry here. Consumers import by name from this barrel, and
 * `panels/__tests__/panelBoundary.test.ts` enforces that it is the only way in.
 * If a second consumer ever needs to resolve a panel by id, that is when a
 * registry gets built — not before.
 *
 * One barrel, not one per cluster: a second level would list the same symbols
 * again, with this file as its only consumer.
 */
export { ContextPanel } from "./context/ContextPanel";
export type { ContextPanelProps } from "./context/ContextPanel";
export { AgentStatsRegion, AgentStatsRegionConnected } from "./context/AgentStatsRegion";
export { mergeContextPanelEpisodes } from "./context/contextPanelMerge";
export { invalidateEpisodeContextQueries } from "./context/contextPanelInvalidation";
