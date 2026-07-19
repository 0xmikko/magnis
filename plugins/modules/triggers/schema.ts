// Triggers plugin — schema-id + link-kind constants. Deduped from
// `module/service.ts` (the single spelling of each namespace string). The
// manifest is the source of truth for REGISTRATION (lifecycle uses
// registerManifestSchemas()); these consts are for read/write call sites only.

/** Trigger definition entity schema. */
export const TRIGGER = "triggers.trigger";
/** Config facet (name/prompts/status/event_kinds/firing_count/…). */
export const TRIGGER_CONFIG = "triggers.trigger.config";
/** Execution-history facet (written by the native engine, read by fire_history). */
export const TRIGGER_EXECUTION = "triggers.trigger.execution";
/** Link kind: a trigger `watches` an entity. */
export const WATCHES = "watches";
/** Link kind: a trigger `belongs_to` a parent episode. */
export const BELONGS_TO = "belongs_to";
