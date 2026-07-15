import type { JSX } from "react";
import type { AppRuntime } from "./contracts/runtime";
export interface EntityCardRendererProps {
    readonly schemaId: string;
    readonly data: Readonly<Record<string, unknown>>;
    readonly runtime: AppRuntime;
    /** Forwarded to the registered card; see `EntityRendererProps.action`. */
    readonly action?: string;
}
/**
 * Renders an entity card by delegating to the schema's registered renderer
 * (or BaseEntityCard if none is registered). The renderer is a SINGLE
 * component (see `docs/frontend/module-standard.md` — "ONE COMPONENT PER
 * ENTITY") that picks compact vs expanded layout internally from
 * `ExpansionContext`. This wrapper never branches on expansion state.
 *
 * Tool-kind envelopes are unwrapped here: `updated` renders as a diff card
 * (static, schema-agnostic); `created` is flattened so module renderers keep
 * reading fields from the root of `data`.
 */
export declare function EntityCardRenderer({ schemaId, data, runtime, action, }: EntityCardRendererProps): JSX.Element;
