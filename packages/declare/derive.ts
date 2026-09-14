/** What a declaration BECOMES: the entity descriptor a built package ships.
 *
 * The host reads `schemas/<stem>.json` — name, roles, the JSON Schema the
 * graph enforces, and the table the search layer decodes. All four come from
 * the one declaration, so they cannot disagree; and the schema handed to the
 * graph is plain JSON Schema, because the declaration's own bookkeeping is
 * lifted out here rather than compiled by a validator that has never heard of
 * it.
 */
import { z } from "zod";

import { DECLARATION_KEYS, type EntityIdentity, type Searched } from "./index.ts";

export type FieldKind = "text" | "number" | "boolean" | "enum" | "date";

export interface DeclaredField {
  key: string;
  kind: FieldKind;
  /** Where the value lives inside `properties`; absent when it is a column. */
  path?: string;
  /** The entity row's own column this field reads. */
  column?: string;
  embed?: "title" | "body";
  any_of?: { path: string }[];
}

export interface DeclaredCollection {
  key: string;
  path: string;
  element?: { key: string; kind: FieldKind; path: string }[];
}

export interface EntityDescriptor {
  name: string;
  description?: string;
  triggerable?: boolean;
  mergeable?: boolean;
  roles: string[];
  json_schema: unknown;
  search: {
    default_order: { key: string; dir: "asc" | "desc"; nulls: "last" }[];
    field: DeclaredField[];
    collection: DeclaredCollection[];
  };
}

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The branch that carries the type, with `null` — which optionality adds, not
 * the author — set aside. */
function meaningful(node: Node): Node {
  const branches = node.anyOf;
  if (!Array.isArray(branches)) return node;
  const typed = branches.filter((b): b is Node => isNode(b) && b.type !== "null");
  return typed.length === 1 && typed[0] !== undefined ? typed[0] : node;
}

function kindOf(node: Node, key: string): FieldKind {
  const inner = meaningful(node);
  if (Array.isArray(inner.enum)) return "enum";
  const type = inner.type;
  if (type === "string") return inner.format === "date-time" ? "date" : "text";
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  throw new Error(`field ${key}: a declaration cannot say what kind ${JSON.stringify(type)} is`);
}

/** Strip the declaration's own keys wherever they sit, so what is left is the
 * JSON Schema the graph compiles. */
function withoutBookkeeping(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutBookkeeping);
  if (!isNode(value)) return value;
  const out: Node = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === DECLARATION_KEYS.column || key === DECLARATION_KEYS.entity) continue;
    out[key] = withoutBookkeeping(child);
  }
  return out;
}

/** The scalars inside a nested object, each one field NAMED BY ITS PATH. The
 * leaf alone would be ambiguous the moment two objects carry the same word —
 * a message has a media_type and so does the file pointer inside it — and a
 * filter nobody can address unambiguously is worse than a longer name. */
function nestedFields(node: Node, prefix: string): DeclaredField[] {
  const properties = isNode(node.properties) ? node.properties : {};
  const out: DeclaredField[] = [];
  for (const [key, raw] of Object.entries(properties)) {
    if (!isNode(raw)) continue;
    const inner = meaningful(raw);
    if (isNode(inner.properties)) {
      out.push(...nestedFields(inner, `${prefix}.${key}`));
      continue;
    }
    if (inner.type === "array") continue;
    const path = `${prefix}.${key}`;
    out.push({ key: path, kind: kindOf(raw, key), path });
  }
  return out;
}

export function descriptorFrom(schema: z.ZodType): { stem: string; descriptor: EntityDescriptor } {
  const converted = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Node;
  const declared = converted[DECLARATION_KEYS.entity];
  if (!isNode(declared)) {
    throw new Error("this schema was not built by entity(): it declares no identity");
  }
  const identity = declared.identity as EntityIdentity;
  const searched = declared.searched as Searched<z.ZodRawShape>;

  const [plugin, stem, ...rest] = identity.id.split(".");
  if (plugin === undefined || stem === undefined || stem === "" || rest.length > 0) {
    throw new Error(`entity id ${identity.id} must be <plugin>.<entity>`);
  }

  const properties = isNode(converted.properties) ? converted.properties : {};
  const required = Array.isArray(converted.required) ? converted.required : [];
  const fields: DeclaredField[] = [];
  const collections: DeclaredCollection[] = [];
  const keptProperties: Node = {};
  const keptRequired: string[] = [];

  for (const [key, raw] of Object.entries(properties)) {
    if (!isNode(raw)) continue;
    const columnName = raw[DECLARATION_KEYS.column];
    const inner = meaningful(raw);

    keptProperties[key] = withoutBookkeeping(raw);
    if (required.includes(key)) keptRequired.push(key);

    if (typeof columnName === "string") {
      // `column` answers WHERE SEARCH READS the value, not whether the module
      // may write it. A name written into the dictionary and carried by the
      // entity row is one value in two places: the graph enforces the key, and
      // search takes the row's copy, which is the one every entity has.
      fields.push({ key, kind: kindOf(raw, key), column: columnName });
      continue;
    }

    if (inner.type === "array") {
      const items = isNode(inner.items) ? inner.items : {};
      const element = isNode(items.properties)
        ? Object.entries(items.properties).flatMap(([name, node]) =>
            isNode(node) ? [{ key: name, kind: kindOf(node, name), path: name }] : [])
        : [];
      collections.push(element.length === 0 ? { key, path: key } : { key, path: key, element });
      continue;
    }

    // A nested object is reached by a dotted path: `metrics.likes` is one
    // field named `likes`. The resolver splits on the dot, so a value inside
    // is as searchable as one at the top.
    if (isNode(inner.properties)) {
      fields.push(...nestedFields(inner, key));
      continue;
    }
    // An object with no declared shape is a pointer someone else reads — a
    // source reference, a provider blob. The graph holds it; there is no field
    // inside it to name, so search claims none.
    if (inner.type === "object") continue;

    const embed = searched.title === key ? "title" : searched.body === key ? "body" : undefined;
    fields.push(embed === undefined
      ? { key, kind: kindOf(raw, key), path: key }
      : { key, kind: kindOf(raw, key), path: key, embed });
  }

  // A leaf name that collides with another field is a filter nobody can
  // address: two paths, one word.
  const named = new Set<string>();
  for (const field of fields) {
    if (named.has(field.key)) {
      throw new Error(`two fields are both named ${field.key}: the shape has to say which one a filter means`);
    }
    named.add(field.key);
  }

  for (const [name, legs] of Object.entries(searched.alias ?? {})) {
    fields.push({ key: name, kind: "text", any_of: legs.map((path) => ({ path })) });
  }

  const json_schema = withoutBookkeeping({
    ...converted,
    properties: keptProperties,
    ...(keptRequired.length > 0 ? { required: keptRequired } : {}),
  });
  if (keptRequired.length === 0) delete (json_schema as Node).required;

  const [orderKey, orderDir] = searched.order;
  return {
    stem,
    descriptor: {
      name: identity.name,
      ...(identity.description === undefined ? {} : { description: identity.description }),
      ...(identity.triggerable === undefined ? {} : { triggerable: identity.triggerable }),
      ...(identity.mergeable === undefined ? {} : { mergeable: identity.mergeable }),
      roles: [...(identity.roles ?? [])],
      json_schema,
      search: {
        default_order: [{ key: orderKey, dir: orderDir, nulls: "last" }],
        field: fields,
        collection: collections,
      },
    },
  };
}
