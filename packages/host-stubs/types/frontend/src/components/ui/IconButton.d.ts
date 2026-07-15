import type { ReactNode, JSX } from "react";
export interface IconButtonProps {
    readonly children: ReactNode;
    readonly variant?: "default" | "ghost" | "square-small";
    readonly onClick?: () => void;
    readonly label?: string;
}
export declare function IconButton({ children, variant, onClick, label, }: IconButtonProps): JSX.Element;
