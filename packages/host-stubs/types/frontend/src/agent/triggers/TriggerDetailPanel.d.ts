import type { JSX } from "react";
export declare function TriggerDetailPanel({ triggerId, onBack, onDelete, onToggleStatus, }: {
    readonly triggerId: string;
    readonly onBack: () => void;
    readonly onDelete: () => Promise<void>;
    readonly onToggleStatus: (status: string) => Promise<void>;
}): JSX.Element;
