/**
 * Runtime environment detection and configuration
 */
export interface RuntimeEnv {
    readonly mode: "tauri" | "http";
    readonly isTauri: boolean;
    readonly isDev: boolean;
    readonly apiUrl: string;
}
/**
 * Detect the current runtime environment
 */
export declare function detectEnv(): RuntimeEnv;
