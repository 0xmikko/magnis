export declare function shouldSkipWindowDragStart(target: EventTarget | null): boolean;
/**
 * Start a window drag. Uses the pre-loaded Tauri module for a synchronous call path.
 * Safe to call in non-Tauri contexts (silently no-ops).
 */
export declare function startWindowDrag(): void;
