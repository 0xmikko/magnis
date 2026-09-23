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
 * export const sourceRefSchema = z.strictObject({
 *   source: z.string(),
 *   account: z.string(),
 *   externalId: z.string(),
 * }) satisfies z.ZodType<SourceRef>;
 *
 * const _exact: AssertEqual<z.infer<typeof sourceRefSchema>, SourceRef> = true;
 * void _exact;
 * ```
 *
 * `core/statement.ts` is the live specimen: every statement schema there is
 * pinned to its interface this way.
 *
 * A drifted schema fails to compile, and the error names both sides:
 * `Type 'boolean' is not assignable to type '{ ERROR: "schema drifted from
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
/** True only when `A` and `B` are the same type.
 *
 * `no-unnecessary-type-parameters` is disabled on purpose: the rule sees `T`
 * used once per signature and calls it redundant, but `T` is the whole
 * mechanism. Deferring both conditionals behind an UNRESOLVED type parameter
 * is what makes this an identity check; resolve it and the comparison decays
 * into mutual assignability, which accepts `any` and cannot tell `{a: string}`
 * from `{a: string} | never`. */
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/** `true` when the types match; otherwise a shape that names both sides, so
 * the compiler error says what drifted instead of "type mismatch". */
export type AssertEqual<A, B> = Equal<A, B> extends true ? true : {
    ERROR: "schema drifted from type";
    A: A;
    B: B;
};
//# sourceMappingURL=assert-equal.d.ts.map