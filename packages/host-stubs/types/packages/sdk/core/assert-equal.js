/** Compile-time proof that two types are the SAME type, not merely mutually
 * assignable.
 *
 * The problem it solves: a zod schema and the domain interface it validates
 * drift apart silently. `satisfies z.ZodType<T>` catches a field that went
 * missing or changed type — the schema's output stops being assignable to `T`
 * — but it does NOT catch an EXTRA field, because an object type with extra
 * properties is still structurally assignable to one without them. So
 * `satisfies` alone lets a schema grow a field the domain has never heard of.
 *
 * `AssertEqual` closes the other direction. Used together they pin both:
 *
 * ```ts
 * export interface SourceRef { source: string; account: string; externalId: string }
 *
 * export const SourceRefSchema = z.strictObject({
 *   source: z.string(),
 *   account: z.string(),
 *   externalId: z.string(),
 * }) satisfies z.ZodType<SourceRef>;
 *
 * const _exact: AssertEqual<z.infer<typeof SourceRefSchema>, SourceRef> = true;
 * void _exact;
 * ```
 *
 * `core/statement.ts` is the live specimen: every statement schema there is
 * pinned to its interface this way.
 *
 * A drifted schema fails to compile, and the error names both sides:
 * `Type 'boolean' is not assignable to type '{ error: "schema drifted from
 * type"; A: …; B: … }'`.
 *
 * The `Equal` conditional is the standard identity check: two types are the
 * same only if a generic function returning `T extends A ? 1 : 2` is
 * assignable to one returning `T extends B ? 1 : 2`. Deferring both sides
 * behind an unresolved `T` is what makes it exact rather than bidirectionally
 * assignable — the latter would accept `any`, and `{a: string}` versus
 * `{a: string} | never`.
 *
 * @tested-by: tst_bts_core_assert_equal_001..004
 */
export {};
