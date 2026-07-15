export declare const ANALYTICS_EVENT_VERSION = 1;
export type AnalyticsMode = "off" | "internal" | "posthog";
export type AnalyticsEventName = "app_opened" | "route_viewed" | "workspace_switched" | "onboarding_step_completed" | "demo_case_viewed" | "agent_chat_started" | "agent_message_sent" | "agent_blocked_no_invite" | "private_cloud_interest.submitted";
export type AnalyticsEventProperties = Record<string, unknown>;
export interface AnalyticsVersions {
    readonly app: string;
    readonly backend: string;
    readonly buildSha?: string;
}
export interface RuntimeAnalyticsConfig {
    readonly mode: AnalyticsMode;
    readonly runtimeSurface: string;
    readonly deploymentId: string;
    readonly versions: AnalyticsVersions;
    readonly internalEventSchemaVersion?: number;
    readonly posthogHost?: string;
    readonly posthogProjectApiKey?: string;
    readonly hostedDemoEntitlement?: HostedDemoEntitlement;
}
export interface HostedDemoEntitlement {
    readonly status: "credit_zero_no_invite" | "invite_credits_available";
    readonly campaignId?: string;
    readonly inviteId?: string;
    readonly creditLimitMicros?: number;
}
export interface AnalyticsFlowContext {
    readonly analytics_flow_id: string;
    readonly client_instance_id: string;
    readonly frontend_origin: string;
    readonly landing_referrer?: string;
    readonly utm_source?: string;
    readonly utm_medium?: string;
    readonly utm_campaign?: string;
    readonly utm_content?: string;
    readonly utm_term?: string;
    readonly utm_id?: string;
}
export interface AnalyticsClient {
    readonly mode: AnalyticsMode;
    readonly runtimeSurface: string;
    readonly deploymentId: string;
    readonly analyticsFlowId: string;
    readonly clientInstanceId: string;
    readonly hostedDemoEntitlement?: HostedDemoEntitlement;
    readonly capture: (eventName: AnalyticsEventName, properties: AnalyticsEventProperties, options: {
        readonly source: string;
        readonly internalProperties?: AnalyticsEventProperties;
    }) => Promise<void>;
}
export interface InternalAnalyticsTransport {
    readonly rpc: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
}
export interface PostHogLike {
    readonly register: (properties: Record<string, unknown>) => void;
    readonly capture: (eventName: string, properties?: Record<string, unknown>) => void;
}
export declare function captureAnalyticsFlowContext(location?: Location, storage?: Storage, referrer?: string): AnalyticsFlowContext;
export declare function createDisabledAnalyticsFlowContext(location?: Location): AnalyticsFlowContext;
export declare function createAnalyticsClient({ config, flow, internalTransport, posthog, }: {
    readonly config: RuntimeAnalyticsConfig;
    readonly flow: AnalyticsFlowContext;
    readonly internalTransport: InternalAnalyticsTransport;
    readonly posthog?: PostHogLike;
}): AnalyticsClient;
