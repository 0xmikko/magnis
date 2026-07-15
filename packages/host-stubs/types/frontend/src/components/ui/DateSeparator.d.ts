import type { JSX } from "react";
export interface DateSeparatorProps {
    readonly date: Date;
    readonly className?: string;
}
export declare function DateSeparator({ date, className }: DateSeparatorProps): JSX.Element;
