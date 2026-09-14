# `@magnis/declare`

How a module says what its entities ARE. Build time only: a module's
`entities.ts` imports this, `scripts/build-plugins.ts` reads it, and nothing
the isolate or the browser loads ever touches it.

One declaration, three derivations — the JSON Schema the graph enforces, the
table the search layer decodes, and the descriptor the host installs — so they
cannot disagree.

## Writing one

```ts
export const message = entity(
  { id: "email.message", name: "Email message", roles: ["content"] },
  {
    subject: z.string().nullish(),
    body_text: z.string().nullish(),
    sent_at: moment().nullish(),
    labels: z.array(z.string()).optional(),
  },
  { order: ["sent_at", "desc"], title: "subject", body: "body_text" },
) satisfies z.ZodType<EmailMessageDetails>;
```

- `entity()` builds a STRICT object. An open one converts without
  `additionalProperties: false`, and a schema that accepts an undeclared field
  enforces nothing worth saying.
- `column(name, schema)` says WHERE SEARCH READS a value that the entity row
  also carries. It does not say the module may not write the key.
- `moment()` is the one spelling of a date the graph's compiler accepts: the
  offset form converts to the very pattern that compiler writes itself, so the
  declaration and the enforcement say one thing rather than two.
- A value inside a nested object is searchable by its path (`metrics.likes`),
  named by that path — a message has a `media_type` and so does the file
  pointer inside it.
- `satisfies` plus `AssertEqual` pin the declaration to the module's own type
  in both directions, so neither can drift alone.

## Proving one

A declaration is a claim about **what reaches the graph**, and that has two
sides. Prove both:

1. **What the module writes.** Run the module's REAL write path — its ingest,
   its create, its update — and validate every record it produces. Not copied
   dictionaries: a fixture drifts from the code the moment either changes.
2. **What the connectors emit.** The module stores what arrives, and a
   connector writes more than a module's unit fixtures carry. The x connector
   emits `post_type`, `article_title`, `conversation_id`, `media` and `urls`;
   the module's own tests knew none of them, every declaration test passed,
   and the first real world load died on `Unrecognized key: "post_type"` with
   nine repetitions of a benchmark making zero calls.

Side 1 lives here, beside the declaration. Side 2 is the product's world load,
which is the only place every connector meets every module. A green suite here
is necessary and not sufficient — load a world before believing a declaration.
