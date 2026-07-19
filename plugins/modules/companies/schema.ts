// Companies plugin — schema-id constants. Deduped between `module/service.ts`
// and the module tests (the single spelling of each namespace string). The
// manifest is the source of truth for REGISTRATION (lifecycle uses
// registerManifestSchemas()); these consts are for read/write call sites only.

/** Entity schema. */
export const COMPANY = "companies.company";
/** Single-aligned details facet (name/website/industry/size/location/…). */
export const COMPANY_DETAILS = "companies.company.details";
/** Collection email facet (one facet per address). */
export const COMPANY_EMAIL = "companies.company.email";
/** Collection phone facet (one facet per number). */
export const COMPANY_PHONE = "companies.company.phone";
/** External-link facet (source_type + external_id + url/name). */
export const COMPANY_EXTERNAL_LINK = "companies.company.external_link";
