import type { JSX } from "react";
export interface MiniCalendarProps {
    readonly selectedDate?: Date;
    readonly displayMonth: Date;
    readonly onDateClick: (date: Date) => void;
    readonly onMonthChange: (delta: -1 | 1) => void;
    readonly className?: string;
}
export declare function MiniCalendar({ selectedDate, displayMonth, onDateClick, onMonthChange, className, }: MiniCalendarProps): JSX.Element;
