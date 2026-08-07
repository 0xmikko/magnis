import type { JSX, ReactNode } from "react";
import type { IconName } from "../components/ui/Icon";
import type { AppRuntime } from "../runtime/contracts/runtime";
export interface ContextPanelEntity {
    readonly id: string;
    readonly schemaId: string;
    readonly name?: string;
    readonly linkKind?: string;
    readonly createdAt?: string;
    readonly data?: Readonly<Record<string, unknown>>;
}
interface ContextInfoItem {
    readonly iconName: IconName;
    readonly iconColor: string;
    readonly text: string;
}
export interface ClickableEntity {
    readonly id: string;
    readonly schemaId: string;
}
export interface ContextPanelProps {
    readonly primaryEntity?: ContextPanelEntity;
    readonly replyToEntity?: ContextPanelEntity;
    readonly infoItems: readonly ContextInfoItem[];
    readonly connectedEntities: readonly ContextPanelEntity[];
    readonly runtime: AppRuntime;
    /** When true, omit the PanelHeader (used when embedded in AgentPanel sidebar which has its own header). */
    readonly hideHeader?: boolean;
    /**
     * Optional region rendered BELOW the entity list, in the same scroll flow —
     * home of the always-visible Todo + Context-stats transparency region
     * (owner decision 2026-07-23: entities on top, Todo + stats beneath them,
     * in the right Context panel rather than inline above the composer).
     */
    readonly bottomSlot?: ReactNode;
    /**
     * The panel's first line — which agent answers this episode and which model
     * it uses. Above the entities because it is what the conversation IS, not
     * what it is about (docs/backend/episodes.md, "[Target] The context panel").
     */
    readonly headerSlot?: ReactNode;
}
export declare function ContextPanel({ primaryEntity, replyToEntity, infoItems: _infoItems, connectedEntities, runtime, hideHeader, bottomSlot, headerSlot, }: ContextPanelProps): JSX.Element;
export {};
