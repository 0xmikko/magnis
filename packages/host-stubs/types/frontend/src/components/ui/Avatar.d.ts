import { type JSX } from "react";
export interface AvatarProps {
    readonly label: string;
    readonly color?: "orange" | "blue" | "green" | "red" | "purple" | "pink" | "gray" | string;
    readonly size?: "sm" | "md" | "lg" | "xl";
    readonly status?: "active" | "idle" | "offline";
    readonly imageSrc?: string;
    readonly imageAlt?: string;
}
export declare function Avatar({ label, color, size, status, imageSrc, imageAlt, }: AvatarProps): JSX.Element;
