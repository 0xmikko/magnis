import type { JSX } from "react";
export interface EditableTitleProps {
    readonly value: string | null;
    readonly onCommit: (name: string) => void;
    readonly placeholder?: string;
    readonly className?: string;
}
export declare function EditableTitle({ value, onCommit, placeholder, className, }: EditableTitleProps): JSX.Element;
