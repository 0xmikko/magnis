// Companies plugin — schema-id constants. Deduped between `module/service.ts`
// and the module tests (the single spelling of each namespace string). The
// schemas/ files are the source of truth for REGISTRATION (registered natively at install); these consts are for read/write call sites only.

/** Entity schema. */
export const COMPANY = "companies.company";

// S5: the details / description / email / phone / external_link facets are
// frozen archive — the company hub's DICTIONARY is the record, and its emails
// are identity edges to the email module's address nodes. The schemas stay
// registered (no schema is ever removed); nothing reads or writes them.
//
// The details schema id survives as a constant only because the module tests
// name it when they assert that NOTHING writes it any more.
export const COMPANY_DETAILS = "companies.company.details";
