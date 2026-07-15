import type { ReactNode, JSX } from "react";
export interface AgendaGroup {
    readonly date: Date;
    readonly items: readonly AgendaGroupItem[];
}
export interface AgendaGroupItem {
    readonly id: string;
    readonly content: ReactNode;
}
export interface AgendaListProps {
    readonly groups: readonly AgendaGroup[];
    readonly selectedId?: string;
    readonly onItemClick?: (id: string) => void;
    readonly className?: string;
}
export declare function AgendaList({ groups, selectedId: _selectedId, onItemClick, className, }: AgendaListProps): JSX.Element;
