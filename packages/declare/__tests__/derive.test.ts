/** What a declaration BECOMES: the entity descriptor a built package ships.
 *
 * The host reads `schemas/<stem>.json` and nothing else — so everything the
 * graph enforces and everything search knows has to be in there, and what the
 * graph compiles has to be plain JSON Schema with none of the declaration's
 * own bookkeeping left in it.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { column, entity, moment } from "../index.ts";
import { descriptorFrom } from "../derive.ts";

const message = entity(
  { id: "email.message", name: "Email message", description: "A message.", roles: ["content"] },
  {
    subject: z.string().nullish(),
    body_text: z.string().nullish(),
    sent_at: column("date", moment().nullish()),
    is_read: z.boolean().optional(),
    labels: z.array(z.string()).optional(),
    schedule: z.object({ cron: z.string() }).optional(),
  },
  { order: ["sent_at", "desc"], title: "subject", body: "body_text" },
);

describe("a declaration becomes an entity descriptor", () => {
  it("the graph compiles plain JSON Schema, with none of the declaration's bookkeeping", () => {
    const { descriptor } = descriptorFrom(message);
    const schema = descriptor.json_schema as Record<string, unknown>;
    expect(JSON.stringify(schema)).not.toContain("x-magnis");
    // A closed field set is the whole point: an undeclared key must be refused.
    expect(schema["additionalProperties"]).toBe(false);
  });

  it("a column says where search reads, not whether the module may write it", () => {
    const { descriptor } = descriptorFrom(message);
    const props = (descriptor.json_schema as { properties: Record<string, unknown> }).properties;
    // The module writes it into the dictionary, so the graph must accept it...
    expect(Object.keys(props)).toContain("sent_at");
    // ...and search takes the entity row's copy, which every entity has.
    const sentAt = descriptor.search.field.find((f) => f.key === "sent_at");
    expect(sentAt).toEqual({ key: "sent_at", kind: "date", column: "date" });
  });

  it("the search block says what search.toml said", () => {
    const { stem, descriptor } = descriptorFrom(message);
    expect(stem).toBe("message");
    expect(descriptor.name).toBe("Email message");
    expect(descriptor.roles).toEqual(["content"]);
    expect(descriptor.search.default_order).toEqual([{ key: "sent_at", dir: "desc", nulls: "last" }]);
    // A nullable string is still text; embed roles come from `searched`.
    expect(descriptor.search.field).toContainEqual({ key: "subject", kind: "text", path: "subject", embed: "title" });
    expect(descriptor.search.field).toContainEqual({ key: "body_text", kind: "text", path: "body_text", embed: "body" });
    expect(descriptor.search.field).toContainEqual({ key: "is_read", kind: "boolean", path: "is_read" });
    // A list of scalars is a collection, not a field.
    expect(descriptor.search.collection).toEqual([{ key: "labels", path: "labels" }]);
    expect(descriptor.search.field.map((f) => f.key)).not.toContain("labels");
  });

  it("a value inside a nested object is searchable by its dotted path", () => {
    const { descriptor } = descriptorFrom(message);
    const props = (descriptor.json_schema as { properties: Record<string, unknown> }).properties;
    // The graph enforces the whole object...
    expect(Object.keys(props)).toContain("schedule");
    // ...and the scalar inside it is one field, named by its leaf.
    expect(descriptor.search.field).toContainEqual({ key: "cron", kind: "text", path: "schedule.cron" });
    // The object itself is not a field — there is no filter for a whole object.
    expect(descriptor.search.field.map((f) => f.key)).not.toContain("schedule");
  });
});
