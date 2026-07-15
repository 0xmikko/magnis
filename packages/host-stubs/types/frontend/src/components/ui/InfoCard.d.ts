import type { ReactNode, JSX } from "react";
export interface InfoCardRow {
    readonly label: string;
    readonly value: ReactNode;
    readonly action?: ReactNode;
}
export interface InfoCardProps {
    readonly rows: readonly InfoCardRow[];
}
/**
 * Card displaying key-value rows with optional actions (copy buttons, etc.).
 * Used in contacts info, company info, etc.
 */
export declare function InfoCard({ rows }: InfoCardProps): JSX.Element;
