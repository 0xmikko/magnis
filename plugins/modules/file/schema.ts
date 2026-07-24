// File plugin — schema-id constants. Deduped between `module/service.ts` and
// `module/helpers.ts` (the single spelling of each namespace string). The
// schemas/ files are the source of truth for REGISTRATION (registered natively at install); these consts are for read/write call sites only.

/** File entity schema. */
export const FILE_OBJECT = "file.object";
/** Single-aligned file details facet (mime/source/path/url/…). */
export const FILE_DETAILS = "file.details";
/** Image-specific metadata facet (width/height/…). */
export const FILE_IMAGE = "file.image";
/** Audio-specific metadata facet (duration/…). */
export const FILE_AUDIO = "file.audio";
/** Video-specific metadata facet (duration/dimensions/…). */
export const FILE_VIDEO = "file.video";
