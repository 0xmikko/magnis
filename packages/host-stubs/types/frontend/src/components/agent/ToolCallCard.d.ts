/**
 * Collapsible tool call card — shows tool name collapsed,
 * entity cards (messages, contacts, etc.) when expanded.
 */
import type { JSX } from "react";
import type { AppRuntime } from "../../runtime/contracts/runtime";
export interface ToolCallCardProps {
    readonly name: string;
    readonly args?: unknown;
    readonly result?: unknown;
    readonly status: "pending" | "complete" | "error";
    readonly runtime?: AppRuntime;
}
export declare function ToolCallCard({ name, args, result, status, runtime, }: ToolCallCardProps): JSX.Element;
