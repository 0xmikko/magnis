import type { JSX } from "react";
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
}
export declare function ContextPanel({ primaryEntity, replyToEntity, infoItems: _infoItems, connectedEntities, runtime, hideHeader, }: ContextPanelProps): JSX.Element;
export {};
