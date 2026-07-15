import type { ReactNode, JSX } from "react";
export interface PillButtonProps {
    readonly children: ReactNode;
    readonly active?: boolean;
    readonly onClick?: () => void;
}
export declare function PillButton({ children, active, onClick }: PillButtonProps): JSX.Element;
