// tst_plug_rendercov_001 — GATE: every write tool a module exposes MUST have
// a purpose-built approval-card renderer, or an explicit exemption with a
// reason.
//
// Why this gate exists. `defineModule` (frontend/src/modules/_base/defineModule.ts)
// binds `toolCallRenderers[].entity` and `actions` to exact operation pairs.
// A renderer for email.address/create does not cover email.message/create. A write tool that is absent from that hand-written list
// does not warn, throw, or fail to build: it silently degrades to the generic
// "Agent wants to: telegram messages reply" card with raw key/value args.
//
// That silence is the whole problem. The purpose-built cards are the product's
// face, and they have been lost repeatedly — a tool gets added to a module,
// nobody adds the matching renderer entry, and no test turns red. The e2e
// suite did not catch it either: its card assertions were soft enough to pass
// with no card rendered at all.
//
// So: adding a write tool now forces a decision. Give it a card, or write down
// why it does not need one.
import { test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import ts from "typescript";

const REPO = join(import.meta.dir, "..");
const MODULES_DIR = join(REPO, "plugins", "modules");

/**
 * Write tools that intentionally have no approval card, with the reason.
 * An entry here is a DECISION, not a backlog item — if a tool deserves a
 * card, build the card instead of listing it.
 */
const NO_CARD: Record<string, Record<string, string>> = {};

/**
 * Tools that SHOULD have a card and do not — the debt that existed when this
 * gate was introduced. This list is a ratchet, not a parking lot:
 * `tst_plug_renderercov_004` fails if an entry here has since been given a
 * renderer, which forces whoever builds the card to delete its line. The list
 * can therefore only shrink. A NEW tool cannot be added to it as a shortcut
 * without that showing up plainly in review.
 *
 * Every one of these renders today as "Agent wants to: <tool name>" with raw
 * key/value arguments. `email` is absent because it is the one module whose
 * coverage is complete — it is the reference for what the rest should become.
 */
const KNOWN_GAP: readonly string[] = [
  "contacts.person.update",
  "file.object.create",
  "meetings.calendar_event.create",
  "notes.note.delete",
  "projects.project.checklist.update",
  "projects.project.delete",
];

/** `@writeTool("<action>"` declarations in a module's service. */
function declaredWriteTools(moduleId: string): string[] {
  const service = join(MODULES_DIR, moduleId, "module", "service.ts");
  if (!existsSync(service)) return [];
  const src = readFileSync(service, "utf8");
  return writeToolPairs(src);
}

function propertyValue(object: ts.ObjectLiteralExpression, name: string): ts.Expression {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property)
      && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      && property.name.text === name) return property.initializer;
  }
  throw new Error(`Missing '${name}' in tool declaration`);
}

// @tested-by: tst_plug_renderercov_005
function writeToolPairs(src: string): string[] {
  const pairs: string[] = [];
  const source = ts.createSourceFile("service.ts", src, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    if (ts.isDecorator(node) && ts.isCallExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "writeTool") {
      const [operation, spec] = node.expression.arguments;
      if (operation === undefined || !ts.isStringLiteral(operation) || spec === undefined || !ts.isObjectLiteralExpression(spec)) {
        throw new Error("Write tools must declare a literal operation and specification");
      }
      const entity = propertyValue(spec, "entity");
      if (!ts.isStringLiteral(entity)) throw new Error("Write tool entity must be a string literal");
      pairs.push(`${entity.text}.${operation.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return pairs;
}

/**
 * Entity/operation pairs registered in `toolCallRenderers`; legacy
 * history predicates are deliberately outside active operation coverage.
 */
function renderedActions(moduleId: string): string[] {
  const ui = join(MODULES_DIR, moduleId, "ui", "index.tsx");
  if (!existsSync(ui)) return [];
  const src = readFileSync(ui, "utf8");
  return rendererPairs(src);
}

// @tested-by: tst_plug_renderercov_005
function rendererPairs(src: string): string[] {
  const pairs: string[] = [];
  const source = ts.createSourceFile("index.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node: ts.Node): void {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "toolCallRenderers") {
      if (!ts.isArrayLiteralExpression(node.initializer)) throw new Error("Tool renderers must be an explicit array");
      for (const registration of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(registration)) throw new Error("Tool renderer must be an explicit object");
        const entity = propertyValue(registration, "entity");
        const actions = propertyValue(registration, "actions");
        if (!ts.isStringLiteral(entity) || !ts.isArrayLiteralExpression(actions)) throw new Error("Tool renderer needs a literal entity and operations");
        for (const operation of actions.elements) {
          if (!ts.isStringLiteral(operation)) throw new Error("Tool renderer operation must be a string literal");
          pairs.push(`${entity.text}.${operation.text}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return pairs;
}

const moduleIds = readdirSync(MODULES_DIR).filter((d) =>
  existsSync(join(MODULES_DIR, d, "module", "service.ts")),
);

/** Every declared entity operation, paired with coverage. */
function writeToolCoverage(): { id: string; covered: boolean }[] {
  return moduleIds.flatMap((moduleId) => {
    const rendered = new Set(renderedActions(moduleId));
    return declaredWriteTools(moduleId).map((action) => ({
      id: action,
      covered: rendered.has(action) || action in (NO_CARD[moduleId] ?? {}),
    }));
  });
}

test("tst_plug_renderercov_001 a new write tool cannot ship without a card decision", () => {
  const known = new Set(KNOWN_GAP);
  const undeclared = writeToolCoverage()
    .filter((t) => !t.covered && !known.has(t.id))
    .map((t) => t.id)
    .sort();

  // If this fails you added a write tool. Give it a renderer in the module's
  // `toolCallRenderers`, or record why it needs none in NO_CARD. Do NOT add it
  // to KNOWN_GAP — that list is closed.
  expect(undeclared).toEqual([]);
});

test("tst_plug_renderercov_002 no NO_CARD exemption outlives the tool it excuses", () => {
  // A stale exemption is worse than none: it silences a gate for a tool that
  // no longer exists, and hides the next tool that reuses the name.
  const stale: string[] = [];
  for (const [moduleId, actions] of Object.entries(NO_CARD)) {
    const declared = new Set(declaredWriteTools(moduleId));
    for (const action of Object.keys(actions)) {
      if (!declared.has(action)) stale.push(action);
    }
  }
  expect(stale.sort()).toEqual([]);
});

test("tst_plug_renderercov_004 the known-gap list only shrinks", () => {
  const coverage = new Map(writeToolCoverage().map((t) => [t.id, t.covered]));

  // Fixed but still listed — delete the line, the debt is paid.
  const fixed = KNOWN_GAP.filter((id) => coverage.get(id) === true);
  expect(fixed).toEqual([]);

  // Listed but no longer declared — the tool is gone, so is its excuse.
  const vanished = KNOWN_GAP.filter((id) => !coverage.has(id));
  expect(vanished).toEqual([]);
});

test("tst_plug_renderercov_003 the gate can actually see tools and renderers", () => {
  // Guards the gate itself. Both parsers read literal declarations; if either
  // silently returns nothing (a refactor moves the decorators, the registry is
  // renamed), the coverage test above would pass vacuously and this whole file
  // would become decorative. `email` is the reference module — it is the one
  // with complete, hand-verified card coverage.
  expect(declaredWriteTools("email").length).toBeGreaterThan(0);
  expect(renderedActions("email").length).toBeGreaterThan(0);
  expect(moduleIds.length).toBeGreaterThan(5);
});

/** @test-id: tst_plug_renderercov_005
 * @scenario: scn_tools_rendering
 * @covers: scripts/toolcall-renderer-coverage.test.ts::writeToolPairs
 * @covers: scripts/toolcall-renderer-coverage.test.ts::rendererPairs
 * @deterministic: yes — inline declaration and renderer fixtures
 */
test("tst_plug_renderercov_005 coverage requires the same entity and operation and ignores legacy history", () => {
  const declarations = `class Service {
    @rpc("send")
    @writeTool("create", { description: "Create", entity: "email.message", params: { to: { type: "string" } } })
    create() {}
    @writeTool("create", { entity: "email.address", description: "Create", params: {} })
    address() {}
  }`;
  const ui = `defineModule({ toolCallRenderers: [
    { actions: ["create"], entity: "email.address", Render: Address },
    { entity: "email.message", actions: ["update"], Render: Message },
  ] });
  const historyRenderers = [{ entity: "email.message", actions: ["create"], match: () => true }];`;
  expect(writeToolPairs(declarations)).toEqual(["email.message.create", "email.address.create"]);
  const rendered = new Set(rendererPairs(ui));
  expect(rendered).toEqual(new Set(["email.address.create", "email.message.update"]));
  expect(writeToolPairs(declarations).filter((pair) => !rendered.has(pair))).toEqual(["email.message.create"]);
});
