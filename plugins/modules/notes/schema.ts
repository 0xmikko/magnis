// Notes plugin — schema-id constants. Deduped between `module/service.ts` and
// the module tests (the single spelling of each namespace string). The manifest
// is the source of truth for REGISTRATION (lifecycle uses
// registerManifestSchemas()); these consts are for read/write call sites only.

/** Entity schema. */
export const NOTE = "notes.note";
/** Single content facet (title/body/pinned/updated_at). */
export const NOTE_CONTENT = "notes.note.content";
