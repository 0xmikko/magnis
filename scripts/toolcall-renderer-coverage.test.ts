// tst_plug_rendercov_001 — GATE: every write tool a module exposes MUST have
// a purpose-built approval-card renderer, or an explicit exemption with a
// reason.
//
// Why this gate exists. `defineModule` (frontend/src/modules/_base/defineModule.ts)
// expands `toolCallRenderers[].actions` into an EXACT `toolName` match —
// `["messages.send"]` becomes {telegram.messages.send, telegram_messages_send}
// and nothing else. A write tool that is absent from that hand-written list
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
  "contacts.batch_track_social",
  "contacts.set_social_tracking",
  "contacts.track_social_profile",
  "contacts.update",
  "file.attach",
  "meetings.create",
  "notes.delete",
  "notes.template.apply",
  "projects.checklist.update",
  "projects.delete",
  "triggers.delete",
  "triggers.link",
  "triggers.unlink",
  "x.import_following",
];

/** `@writeTool("<action>"` declarations in a module's service. */
function declaredWriteTools(moduleId: string): string[] {
  const service = join(MODULES_DIR, moduleId, "module", "service.ts");
  if (!existsSync(service)) return [];
  const src = readFileSync(service, "utf8");
  return [...src.matchAll(/@writeTool\(\s*"([a-zA-Z_.]+)"/g)].map((m) => m[1]!);
}

/**
 * Actions registered in the module UI's `toolCallRenderers`. Parsed with a
 * bracket-balanced scan rather than a line regex: the array spans many lines
 * and a naive match silently under-reports, which would make this gate lie in
 * the safe-looking direction.
 */
function renderedActions(moduleId: string): string[] {
  const ui = join(MODULES_DIR, moduleId, "ui", "index.tsx");
  if (!existsSync(ui)) return [];
  const src = readFileSync(ui, "utf8");
  const key = src.indexOf("toolCallRenderers");
  if (key < 0) return [];
  const start = src.indexOf("[", key);
  if (start < 0) return [];
  let depth = 0;
  let end = start;
  for (; end < src.length; end++) {
    if (src[end] === "[") depth++;
    else if (src[end] === "]" && --depth === 0) break;
  }
  const block = src.slice(start, end + 1);
  return [...block.matchAll(/actions:\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1]!.matchAll(/"([a-zA-Z_.]+)"/g)].map((a) => a[1]!),
  );
}

const moduleIds = readdirSync(MODULES_DIR).filter((d) =>
  existsSync(join(MODULES_DIR, d, "module", "service.ts")),
);

/** Every declared write tool as `<module>.<action>`, paired with coverage. */
function writeToolCoverage(): { id: string; covered: boolean }[] {
  return moduleIds.flatMap((moduleId) => {
    const rendered = new Set(renderedActions(moduleId));
    return declaredWriteTools(moduleId).map((action) => ({
      id: `${moduleId}.${action}`,
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
      if (!declared.has(action)) stale.push(`${moduleId}.${action}`);
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
  // Guards the gate itself. Both parsers are regex/scan based; if either
  // silently returns nothing (a refactor moves the decorators, the registry is
  // renamed), the coverage test above would pass vacuously and this whole file
  // would become decorative. `email` is the reference module — it is the one
  // with complete, hand-verified card coverage.
  expect(declaredWriteTools("email").length).toBeGreaterThan(0);
  expect(renderedActions("email").length).toBeGreaterThan(0);
  expect(moduleIds.length).toBeGreaterThan(5);
});
