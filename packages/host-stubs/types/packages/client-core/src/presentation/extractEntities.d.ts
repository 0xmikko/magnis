/**
 * Entity extraction from tool results (A-2) — pure data logic shared by web
 * cards and CLI transcripts. Moved verbatim from
 * `frontend/src/components/agent/AgentPanelBlocks.tsx`; the React
 * `ToolResultEntityCards` stays in the web layer and renders what this
 * returns.
 */
export declare function inferSchemaFromTool(toolName: string | undefined): string | null;
/** An entity row a tool result carries: whatever the row holds, with the
 * schema id its card renders by. */
export type ToolResultEntity = Readonly<Record<string, unknown>> & {
    readonly schemaId: string;
};
export interface ExtractEntitiesOptions {
    readonly toolName?: string;
    readonly defaultSchemaId?: string;
}
export declare function extractEntities(result: unknown, opts?: ExtractEntitiesOptions): readonly ToolResultEntity[];
