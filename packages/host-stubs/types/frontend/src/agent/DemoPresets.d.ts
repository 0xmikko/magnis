/**
 * DemoPresets — quick-start prompt chips for demo/testing mode.
 *
 * Shown above the composer when VITE_DEMO_MODE env is set and episode is empty.
 */
import type { JSX } from "react";
interface DemoPresetsProps {
    readonly onSelect: (prompt: string) => void;
}
export declare function DemoPresets({ onSelect }: DemoPresetsProps): JSX.Element;
export {};
