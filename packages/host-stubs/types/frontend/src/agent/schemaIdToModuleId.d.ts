/** Map a schema_id (e.g. "contacts.person") to its owning module id (e.g. "contacts").
 *
 * Used to derive source-module visuals for an episode from its `started_with`
 * linked entity after plan #8 removed the legacy `context_key` column.
 */
export declare function schemaIdToModuleId(schemaId: string | undefined): string;
