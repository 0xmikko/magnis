import type { IconName } from "../components/ui/Icon";
/**
 * Map a MIME type to a supported icon name.
 *
 * Lives here (host util) rather than in the `file` plugin because two host
 * components (the agent ComposerPanels + the shared MessageComposer) render
 * attachment icons and cannot import plugin code. The `file` plugin UI reaches
 * the same function through the `@magnis/host/utils` shim, so there is one
 * source of truth.
 */
export declare function mimeToIcon(mimeType: string): IconName;
