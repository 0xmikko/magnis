import { type ReactNode } from "react";
import type { JSX } from "react";
import { type AnalyticsClient } from "./client";
export declare const AnalyticsContext: import("react").Context<AnalyticsClient | null>;
export declare function useAnalytics(): AnalyticsClient;
export declare function AnalyticsProvider({ children }: {
    readonly children: ReactNode;
}): JSX.Element;
export declare function resetAnalyticsAppEventStateForTests(): void;
export declare function AnalyticsAppEvents(): JSX.Element | null;
