#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { MACHINABLE, protocolImplementationHash, protocolSpecHash } from "./plan-gate";

export type PlanState = "SPEC_DRAFT" | "SPEC_LOCKED" | "APPROVED";

export type UsageReceipt =
  | {
      readonly kind: "credits";
      readonly credits: number;
      readonly inputTokens: number;
      readonly cachedInputTokens: number;
      readonly outputTokens: number;
      readonly rateCardDate: string;
      readonly source: string;
    }
  | { readonly kind: "unavailable"; readonly reason: string };

export interface DeliveryInput {
  readonly id: string;
  readonly title: string;
  readonly branch: string;
  readonly depends: readonly string[];
  readonly gate: readonly string[];
  readonly active: boolean;
  readonly stageGraph: string;
  /** Minutes this Delivery expects to spend waiting on others — owner review
   * rounds, CI runs, external services — kept apart from active work. The
   * active-work and critical-path forecasts are derived from the Stages. */
  readonly predictedExternalWaitMinutes: number;
  /** The pull request text as of the merge: what changed for people, what
   * changed in the code, how it was proven, what is not in this PR.
   * Paragraphs separated by one blank line; rendered under the Stage graph. */
  readonly description: string;
}

export interface TaskInput {
  readonly id: string;
  readonly story: string;
  readonly writes: readonly string[];
  readonly predictedActiveMinutes: number;
  readonly predictedCredits: number;
  /** One line, or an ordered list of steps rendered as a numbered sub-list. */
  readonly how: string | readonly string[];
  readonly red: string;
}

export interface StageInput {
  readonly id: string;
  readonly deliveryId: string;
  readonly title: string;
  readonly owner: string;
  readonly profile: "fast" | "strong";
  readonly depends: readonly string[];
  readonly parallelWith: readonly string[];
  readonly writes: readonly string[];
  readonly tempRoot: string;
  readonly predictedActiveMinutes: number;
  readonly predictedCredits: number;
  /** Review/verification share on top of the task sum — the Stage forecast
   * must equal tasks + verification, so estimates stay derived. */
  readonly verifyActiveMinutes: number;
  readonly verifyCredits: number;
  /** What this Stage solves and why now, what is built and where, how it is
   * proven, and the commit message (subject, then body). Paragraphs separated
   * by one blank line; rendered between the forecast and the Tasks. */
  readonly description: string;
  readonly tasks: readonly TaskInput[];
  readonly criteria: readonly string[];
}

export interface ParsedTaskInput extends TaskInput {
  readonly completed: boolean;
  readonly completionCommit: string | null;
  readonly format: "modern" | "legacy";
}

export interface ParsedStageInput {
  readonly id: string;
  readonly deliveryId: string;
  readonly title: string;
  readonly owner: string;
  readonly profile: "fast" | "strong";
  readonly depends: readonly string[];
  readonly parallelWith: readonly string[];
  readonly writes: readonly string[];
  readonly tempRoot: string;
  readonly predictedActiveMinutes: number;
  readonly predictedCredits: number;
  readonly verifyActiveMinutes: number;
  readonly verifyCredits: number;
  /** Empty only for a plan rendered before descriptions existed. */
  readonly description: string;
  readonly tasks: readonly ParsedTaskInput[];
  readonly criteria: readonly string[];
}

export interface DeliveryMeta {
  readonly id: string;
  readonly active: boolean;
  readonly predictedExternalWaitMinutes: number;
}

export interface StageResultReceipt {
  readonly version: 1;
  readonly plan: string;
  readonly deliveryId: string;
  readonly stageId: string;
  readonly taskIds: readonly string[];
  readonly commit: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly activeMinutes: number;
  readonly elapsedMinutes: number;
  readonly usage: UsageReceipt;
  readonly paths: readonly string[];
  readonly tests: readonly { readonly id: string; readonly command: string }[];
  readonly result: string;
  readonly deviations: readonly string[];
  readonly tempRoots: readonly { readonly path: string; readonly state: "absent" }[];
}

export interface CompletedWorkSample {
  readonly sampleId: string;
  readonly predictedActiveMinutes: number;
  readonly actualActiveMinutes: number;
  readonly completedAt: string;
}

export interface UnattendedDecisionReceipt {
  readonly version: 1;
  readonly decidedAt: string;
  readonly goalPreserved: string;
  readonly decision: string;
  readonly alternatives: readonly string[];
  readonly whyContinueNow: string;
  readonly affectedScope: readonly string[];
  readonly rollbackBase: string;
  readonly verification: readonly string[];
}

export interface ExactReplacement {
  readonly section: "spec" | "implementation";
  readonly find: string;
  readonly replace: string;
}

export interface MutationResult {
  readonly body: string;
  readonly specHash?: string;
  readonly implementationHash?: string;
}

export interface StageCloseResult extends MutationResult {
  readonly closed: number;
  readonly status: "CLOSED" | "PARTIAL";
}

interface StageResultOptions {
  readonly commitIsAncestor?: (commit: string) => boolean;
  readonly commitPaths?: (commit: string) => readonly string[];
  readonly pathExists?: (path: string) => boolean;
}

export interface TaskExecutionBrief extends TaskInput {
  readonly deliveryId: string;
  readonly stageId: string;
  readonly stageTitle: string;
  readonly owner: string;
  readonly profile: "fast" | "strong";
  readonly tempRoot: string;
  readonly stageDescription: string;
}

interface JournalEvent {
  readonly operation: string;
  readonly beforeHash: string;
  readonly afterHash: string;
}

interface MutationJournal {
  readonly version: 1;
  readonly root: string;
  readonly plan: string;
  readonly baseHead: string;
  readonly initialHash: string;
  readonly candidateHash: string;
  readonly events: readonly JournalEvent[];
}

const SPEC_START = "<!-- plan:spec:start -->";
const SPEC_END = "<!-- plan:spec:end -->";
const IMPLEMENTATION_START = "<!-- plan:implementation:start -->";
const IMPLEMENTATION_END = "<!-- plan:implementation:end -->";
const EXECUTION_START = "<!-- plan:execution:start -->";
const EXECUTION_END = "<!-- plan:execution:end -->";
const DELIVERY_ID = /^D[1-9]\d*$/;
const STAGE_ID = /^(D[1-9]\d*)-S([1-9]\d*)$/;
const TASK_ID = /^[A-Z][A-Z0-9_-]*$/;
const SHA = /^[0-9a-f]{7,40}$/;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim() === "") throw new Error(`${name} must not be empty`);
}

function assertSafeInline(value: string, name: string): void {
  assertNonEmpty(value, name);
  if (value.includes("\n") || value.includes("-->")) {
    throw new Error(`${name} must be one safe line`);
  }
}

export const DELIVERY_DESCRIPTION_HINT =
  "the pull request text as of the merge — what changed for people, what changed in the code, how it was proven, what is not in this PR; paragraphs separated by one blank line";
export const DELIVERY_WAIT_HINT =
  "the external wait forecast — minutes the Delivery expects to wait on others (owner review rounds, CI runs, external services), kept apart from active work; the active-work total and the longest dependency path are derived from the Stages";
export const STAGE_DESCRIPTION_HINT =
  "what this Stage solves and why now, what is built and where, how it is proven, and the commit message (subject, then body); paragraphs separated by one blank line";

/** Prose that renders inside a protocol region: paragraphs, never anything
 * the parsers would read as structure. A heading would end a section, a
 * checkbox line would become an item, a plan marker would open a region. */
function assertSafeProse(value: unknown, name: string, hint: string): void {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} is required: ${hint}`);
  if (value.includes("-->")) throw new Error(`${name} must not contain "-->"`);
  for (const line of value.split("\n")) {
    if (/^\s*#/.test(line)) throw new Error(`${name} must not contain a heading line: ${line.trim()}`);
    if (/^\s*- \[[ x]\]/.test(line)) throw new Error(`${name} must not contain a checkbox item: ${line.trim()}`);
    if (line.includes("<!-- plan:")) throw new Error(`${name} must not contain a plan marker`);
  }
}

/** The rendered paragraphs: trimmed, one blank line between paragraphs. */
function proseLines(value: string): readonly string[] {
  return value.trim().replace(/\n{3,}/g, "\n\n").split("\n");
}

function region(body: string, start: string, end: string): { readonly from: number; readonly to: number; readonly text: string } {
  const from = body.indexOf(start);
  const to = body.indexOf(end);
  if (from === -1 || to === -1 || to <= from) {
    throw new Error(`plan is missing ordered markers ${start} and ${end}`);
  }
  return { from, to: to + end.length, text: body.slice(from, to + end.length) };
}

function replaceRegion(body: string, start: string, end: string, replacement: string): string {
  const current = region(body, start, end);
  return `${body.slice(0, current.from)}${replacement}${body.slice(current.to)}`;
}

/** Markdown joins adjacent lines into one paragraph; the five header lines end with a hard break so a viewer shows them one per line. Idempotent. */
function hardBreakHeader(body: string): string {
  return body.replace(/^((?:Status|Spec lock|Implementation lock|Active Delivery|Unattended decisions):[^\n]*?)[ ]*$/gm, "$1  ");
}

function replaceHeader(body: string, name: string, value: string): string {
  const expression = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:.*$`, "m");
  if (!expression.test(body)) throw new Error(`plan is missing ${name}: header`);
  return body.replace(expression, `${name}: ${value}  `);
}

function planState(body: string): PlanState {
  const match = body.match(/^Status:\s*(SPEC_DRAFT|SPEC_LOCKED|APPROVED)\b/m);
  if (match?.[1] === "SPEC_DRAFT" || match?.[1] === "SPEC_LOCKED" || match?.[1] === "APPROVED") {
    return match[1];
  }
  throw new Error("plan has no canonical Status header");
}

function requireState(body: string, expected: PlanState): void {
  const actual = planState(body);
  if (actual !== expected) throw new Error(`operation requires ${expected}; plan is ${actual}`);
}

export function createDraftPlan(title: string): string {
  assertSafeInline(title, "plan title");
  return [
    `# ${title}`,
    "",
    "Status: SPEC_DRAFT  ",
    "Spec lock: unlocked  ",
    "Implementation lock: unlocked  ",
    "Active Delivery: none  ",
    "Unattended decisions: allowed  ",
    "",
    SPEC_START,
    "## The Goal",
    "",
    "<draft>",
    "",
    "## The target",
    "",
    "<draft>",
    SPEC_END,
    "",
    IMPLEMENTATION_START,
    "## Implementation contract",
    IMPLEMENTATION_END,
    "",
    EXECUTION_START,
    "## Execution log",
    EXECUTION_END,
    "",
  ].join("\n");
}

export function replaceDraftSpec(body: string, spec: string): MutationResult {
  requireState(body, "SPEC_DRAFT");
  assertNonEmpty(spec, "SPEC");
  if (spec.includes("<!-- plan:")) throw new Error("SPEC must not contain plan control markers");
  const replacement = `${SPEC_START}\n${spec.trim()}\n${SPEC_END}`;
  return { body: replaceRegion(body, SPEC_START, SPEC_END, replacement) };
}

function appendExecution(body: string, event: string): string {
  assertSafeInline(event, "execution event");
  const execution = region(body, EXECUTION_START, EXECUTION_END);
  const beforeEnd = execution.text.slice(0, execution.text.lastIndexOf(EXECUTION_END)).trimEnd();
  const replacement = `${beforeEnd}\n\n- ${event}\n${EXECUTION_END}`;
  return replaceRegion(body, EXECUTION_START, EXECUTION_END, replacement);
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function assertUnique(values: readonly string[], name: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${name} contains duplicates`);
}

function parseHow(raw: string): string | readonly string[] {
  if (!raw.includes("\n")) return raw.trim();
  return raw.split("\n").map((line) => line.replace(/^\s+\d+\. /, "").trim()).filter((line) => line.length > 0);
}

export function howSteps(how: string | readonly string[]): readonly string[] {
  return typeof how === "string" ? [how] : [...how];
}

function assertTaskContract(task: TaskInput, stageWrites: readonly string[]): void {
  if (!TASK_ID.test(task.id)) throw new Error(`invalid Task ID ${task.id}`);
  assertSafeInline(task.story, "Task story");
  const storyWords = task.story.trim().split(/\s+/);
  if (task.story.trim().length < 24 || storyWords.length < 4
    || /^(?:refactor|fix|improve|optimi[sz]e|update|cleanup|clean up)\b/i.test(task.story.trim())) {
    throw new Error(`Task ${task.id} story must state a concrete observable outcome, not a vague activity`);
  }
  const steps = howSteps(task.how);
  if (steps.length === 0) throw new Error(`Task ${task.id} how must have at least one step`);
  for (const step of steps) assertSafeInline(step, "Task how");
  assertSafeInline(task.red, "Task RED");
  if (task.red.includes("`")
    || !/^bun run agent:test:(?:backend|frontend|e2e)\s+--\s+\S+/.test(task.red)) {
    throw new Error(
      `Task ${task.id} RED must use bun run agent:test:<backend|frontend|e2e> -- <exact-target>`,
    );
  }
  if (task.writes.length === 0) throw new Error(`Task ${task.id} must declare at least one write`);
  assertUnique(task.writes, `Task ${task.id} writes`);
  for (const path of task.writes) {
    assertSafeInline(path, `Task ${task.id} write`);
    if (!stageWrites.includes(path)) throw new Error(`Task ${task.id} write ${path} is outside Stage writes`);
  }
  const format = "format" in task ? task.format : "modern";
  if (format !== "legacy") {
    // @invariant: compact Tasks carry their whole change in the visible story.
    // Legacy five-line Tasks keep their original contract so active approved
    // plans remain amendable after adopting this renderer.
    const storyNames = (path: string): boolean => {
      const base = path.split("/").pop() ?? path;
      return task.story.includes(path) || task.story.includes(base);
    };
    const unnamedWrites = task.writes.filter((path) => !storyNames(path));
    if (unnamedWrites.length > 0) {
      throw new Error(
        `Task ${task.id} story must name every write path (full path or basename): ${unnamedWrites.join(", ")}`,
      );
    }
    if (task.story.trim().length > 200) {
      throw new Error(`Task ${task.id} story must fit two lines (max 200 characters)`);
    }
    if (/\b(?:colleague|half-?landed|rename map|the new files|the old files|as discussed)\b/i.test(task.story)) {
      throw new Error(
        `Task ${task.id} story has an unresolved reference — name the exact paths and symbols instead`,
      );
    }
    if (task.writes.length > 4) {
      throw new Error(`Task ${task.id} declares too many writes — one task is one change (max 4 files)`);
    }
  }
  if (task.predictedActiveMinutes <= 0 || task.predictedCredits < 0) {
    throw new Error(`Task ${task.id} predictions must be non-negative and active minutes must be positive`);
  }
}

function assertStageContract(input: StageInput): void {
  if (input.writes.length === 0) throw new Error(`Stage ${input.id} must declare at least one write`);
  if (input.tasks.length === 0) throw new Error(`Stage ${input.id} must contain at least one Task`);
  if (input.criteria.length === 0) throw new Error(`Stage ${input.id} must contain acceptance criteria`);
  if (!/^\.tmp\/code-production\/[a-z0-9][a-z0-9-]*\/D[1-9]\d*-S[1-9]\d*$/.test(input.tempRoot)) {
    throw new Error(`Stage ${input.id} tempRoot must be .tmp/code-production/<plan-slug>/<Stage-ID>`);
  }
  for (const criterion of input.criteria) assertSafeInline(criterion, `Stage ${input.id} acceptance criterion`);
  if (!input.criteria.includes("Commit")) throw new Error(`Stage ${input.id} acceptance criteria must include Commit`);
  for (const task of input.tasks) assertTaskContract(task, input.writes);
  const taskActiveMinutes = input.tasks.reduce((sum, task) => sum + task.predictedActiveMinutes, 0);
  const taskCredits = input.tasks.reduce((sum, task) => sum + task.predictedCredits, 0);
  if (input.verifyActiveMinutes < 0 || input.verifyCredits < 0) {
    throw new Error(`Stage ${input.id} verification share must be non-negative`);
  }
  if (taskActiveMinutes + input.verifyActiveMinutes !== input.predictedActiveMinutes
    || taskCredits + input.verifyCredits !== input.predictedCredits) {
    throw new Error(
      `Stage ${input.id} forecast must equal task sum plus verification `
      + `(${taskActiveMinutes}+${input.verifyActiveMinutes} min, ${taskCredits}+${input.verifyCredits} credits)`,
    );
  }
}

function equalSets(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function deliveryStart(id: string): string {
  return `<!-- plan:delivery:${id}:start -->`;
}

function deliveryEnd(id: string): string {
  return `<!-- plan:delivery:${id}:end -->`;
}

function stageStart(id: string): string {
  return `<!-- plan:stage:${id}:start -->`;
}

function stageEnd(id: string): string {
  return `<!-- plan:stage:${id}:end -->`;
}

function resultsStart(id: string): string {
  return `<!-- plan:results:${id}:start -->`;
}

function resultsEnd(id: string): string {
  return `<!-- plan:results:${id}:end -->`;
}

interface ForecastStage {
  readonly id: string;
  readonly deliveryId: string;
  readonly depends: readonly string[];
  readonly predictedActiveMinutes: number;
  readonly predictedCredits: number;
}

/** The longest chain of Stage forecasts along `depends`: the least calendar
 * time the Delivery can take with unlimited agents. */
function longestDependencyPath(stages: readonly ForecastStage[]): number {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const memo = new Map<string, number>();
  const visit = (id: string, trail: Set<string>): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (trail.has(id)) throw new Error(`Stage dependency cycle reaches ${id}`);
    const stage = byId.get(id);
    if (stage === undefined) return 0;
    trail.add(id);
    const upstream = stage.depends.reduce((best, dependency) => Math.max(best, visit(dependency, trail)), 0);
    trail.delete(id);
    const total = upstream + stage.predictedActiveMinutes;
    memo.set(id, total);
    return total;
  };
  return stages.reduce((best, stage) => Math.max(best, visit(stage.id, new Set())), 0);
}

/** One line under the Stage graph, recomputed whenever a Stage of the
 * Delivery changes, frozen by approval, compared against Results later. */
function deliveryForecastLine(waitMinutes: number, stages: readonly ForecastStage[]): string {
  const minutes = stages.reduce((sum, stage) => sum + stage.predictedActiveMinutes, 0);
  const credits = stages.reduce((sum, stage) => sum + stage.predictedCredits, 0);
  return `Forecast: ${minutes} active min / ${credits} credits across ${stages.length} Stages; ` +
    `longest dependency path ${longestDependencyPath(stages)} active min; external waits ${waitMinutes} min.`;
}

function refreshDeliveryForecast(body: string, deliveryId: string): string {
  const delivery = region(body, deliveryStart(deliveryId), deliveryEnd(deliveryId));
  const meta = deliveryMetas(body).find((candidate) => candidate.id === deliveryId);
  if (meta === undefined) throw new Error(`unknown Delivery ${deliveryId}`);
  const stages = stageInputs(body).filter((stage) => stage.deliveryId === deliveryId);
  const line = deliveryForecastLine(meta.predictedExternalWaitMinutes, stages);
  const changed = delivery.text.replace(/^Forecast: [^\n]*$/m, line);
  return `${body.slice(0, delivery.from)}${changed}${body.slice(delivery.to)}`;
}

function assertExternalWait(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Delivery predictedExternalWaitMinutes is required: ${DELIVERY_WAIT_HINT}`);
  }
  return value;
}

function renderDelivery(input: DeliveryInput, stages: readonly ForecastStage[]): string {
  assertSafeInline(input.id, "Delivery ID");
  if (!DELIVERY_ID.test(input.id)) throw new Error(`invalid Delivery ID ${input.id}`);
  assertSafeInline(input.title, "Delivery title");
  assertSafeInline(input.branch, "Delivery branch");
  assertSafeInline(input.stageGraph, "Stage graph");
  assertSafeProse(input.description, "Delivery description", DELIVERY_DESCRIPTION_HINT);
  const waitMinutes = assertExternalWait(input.predictedExternalWaitMinutes);
  assertUnique(input.depends, "Delivery dependencies");
  const meta = JSON.stringify({ active: input.active, depends: input.depends, predictedExternalWaitMinutes: waitMinutes });
  return [
    deliveryStart(input.id),
    `<!-- plan:delivery-meta:${meta} -->`,
    `### PR Delivery ${input.id} — ${input.title}`,
    "",
    `Branch: \`${input.branch}\`; Depends: ${input.depends.length === 0 ? "none" : input.depends.join(", ")}; Gate: ${input.gate.join(", ")}.`,
    "",
    `Stage graph: \`${input.stageGraph}\`.`,
    "",
    deliveryForecastLine(waitMinutes, stages.filter((stage) => stage.deliveryId === input.id)),
    "",
    ...proseLines(input.description),
    "",
    deliveryEnd(input.id),
  ].join("\n");
}

function renderStage(input: StageInput): string {
  const match = input.id.match(STAGE_ID);
  if (match === null || match[1] !== input.deliveryId) throw new Error(`invalid Stage ID ${input.id}`);
  assertSafeInline(input.title, "Stage title");
  assertSafeInline(input.owner, "Stage owner");
  assertUnique(input.depends, "Stage dependencies");
  assertUnique(input.parallelWith, "Stage parallel set");
  assertUnique(input.writes, "Stage writes");
  assertUnique(input.tasks.map((task) => task.id), "Task IDs");
  if (input.predictedActiveMinutes <= 0 || input.predictedCredits < 0) {
    throw new Error("Stage predictions must be non-negative and active minutes must be positive");
  }
  for (const path of input.writes) assertSafeInline(path, "Stage write");
  assertSafeInline(input.tempRoot, "Stage tempRoot");
  assertSafeProse(input.description, "Stage description", STAGE_DESCRIPTION_HINT);
  assertStageContract(input);
  const meta = JSON.stringify({
    deliveryId: input.deliveryId,
    depends: input.depends,
    parallelWith: input.parallelWith,
    writes: input.writes,
    tempRoot: input.tempRoot,
    verifyActiveMinutes: input.verifyActiveMinutes,
    verifyCredits: input.verifyCredits,
  });
  // Two visible lines per Task: the story, and a hidden metadata comment.
  // Forecast/How/RED stay machine-readable and surface through start-task.
  const tasks = input.tasks.flatMap((task) => {
    const taskMeta = JSON.stringify({
      writes: task.writes,
      predictedActiveMinutes: task.predictedActiveMinutes,
      predictedCredits: task.predictedCredits,
      how: task.how,
      red: task.red,
    });
    if (taskMeta.includes("-->")) throw new Error(`Task ${task.id} metadata must not contain "-->"`);
    return [
      `- [ ] ${task.id} — ${task.story} (${task.predictedActiveMinutes} min)`,
      `<!-- plan:task-meta:${taskMeta} -->`,
    ];
  });
  const criteria = input.criteria.map((criterion) => `- [ ] ${criterion}`);
  return [
    stageStart(input.id),
    `<!-- plan:stage-meta:${meta} -->`,
    `#### Stage ${input.id} — ${input.title}`,
    "",
    `- Owner: ${input.owner}; Profile: ${input.profile}; Depends: ${input.depends.length === 0 ? "none" : input.depends.join(", ")}; ` +
      `Parallel with: ${input.parallelWith.length === 0 ? "none" : input.parallelWith.join(", ")}.`,
    `- Writes: ${input.writes.map((path) => `\`${path}\``).join(", ")}.`,
    `- Temp root: \`${input.tempRoot}\` (must be absent at handoff).`,
    `- Predict: ${input.predictedActiveMinutes} active min / ${input.predictedCredits} credits.`,
    `- Of which verification: ${input.verifyActiveMinutes} active min / ${input.verifyCredits} credits.`,
    "",
    ...proseLines(input.description),
    "",
    "##### Tasks",
    "",
    ...tasks,
    "",
    "##### Acceptance criteria",
    "",
    ...criteria,
    "",
    "##### Results",
    "",
    resultsStart(input.id),
    "| Task | Commit | UTC start-end | Active / elapsed | Usage | Result / proof |",
    "|---|---|---|---:|---|---|",
    resultsEnd(input.id),
    stageEnd(input.id),
  ].join("\n");
}

function parseMetaObject(line: string, prefix: string): Readonly<Record<string, unknown>> {
  if (!line.startsWith(prefix) || !line.endsWith(" -->")) throw new Error(`invalid metadata line ${line}`);
  const raw = line.slice(prefix.length, -4);
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("metadata must be an object");
  return value as Readonly<Record<string, unknown>>;
}

function stringArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${name} must be a string array`);
  }
  return value;
}

function renderedPaths(value: string, name: string): readonly string[] {
  const paths = [...value.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1])
    .filter((path): path is string => path !== undefined);
  if (paths.length === 0) throw new Error(`${name} has no rendered paths`);
  return paths;
}

function capture(match: RegExpMatchArray, index: number, name: string): string {
  const value = match[index];
  if (value === undefined) throw new Error(`missing ${name} capture`);
  return value;
}

export function stageInputs(body: string): readonly ParsedStageInput[] {
  const inputs: ParsedStageInput[] = [];
  const expression = /<!-- plan:stage:(D[1-9]\d*-S[1-9]\d*):start -->\n<!-- plan:stage-meta:(\{[^\n]*\}) -->[\s\S]*?Predict: (\d+(?:\.\d+)?) active min \/ (\d+(?:\.\d+)?) credits\.[\s\S]*?<!-- plan:stage:\1:end -->/g;
  for (const match of body.matchAll(expression)) {
    const block = capture(match, 0, "Stage block");
    const id = capture(match, 1, "Stage ID");
    const meta = parseMetaObject(`<!-- plan:stage-meta:${capture(match, 2, "Stage metadata")} -->`, "<!-- plan:stage-meta:");
    const heading = block.match(/^#### Stage [^\n]+ — (.+)$/m);
    const ownerLine = block.match(/^(?:- )?Owner: ([^;]+); Profile: (fast|strong);/m);
    if (heading === null || ownerLine === null) throw new Error(`Stage ${match[1]} has incomplete rendered metadata`);
    // Current format: story line + hidden task-meta comment. Legacy format
    // (visible Writes/Predict/How/RED lines) still parses so committed plans
    // keep working; the two patterns cannot match the same task.
    const modernTasks = [...block.matchAll(
      /^- \[([ x])\] ([A-Z][A-Z0-9_-]*) — ([^\n]+)\n<!-- plan:task-meta:(\{[^\n]*\}) -->/gm,
    )].map((task) => {
      const id = capture(task, 2, "Task ID");
      const meta = parseMetaObject(`<!-- plan:task-meta:${capture(task, 4, "Task metadata")} -->`, "<!-- plan:task-meta:");
      if (typeof meta.how !== "string" || typeof meta.red !== "string") {
        throw new Error(`Task ${id} metadata must carry how and red`);
      }
      const completed = capture(task, 1, "Task state") === "x";
      const renderedStory = capture(task, 3, "Task story");
      const completionCommit = completed ? renderedStory.match(/ — ([0-9a-f]{7,40})$/)?.[1] ?? null : null;
      const rawStory = completed ? renderedStory.replace(/ — [0-9a-f]{7,40}$/, "") : renderedStory;
      return {
        index: task.index ?? 0,
        completed,
        completionCommit,
        format: "modern" as const,
        input: {
          id,
          story: rawStory.replace(/ \(\d+(?:\.\d+)? min\)$/, ""),
          writes: stringArray(meta.writes, `Task ${id} writes`),
          predictedActiveMinutes: Number(meta.predictedActiveMinutes),
          predictedCredits: Number(meta.predictedCredits),
          how: meta.how,
          red: meta.red,
        },
      };
    });
    const legacyTasks = [...block.matchAll(
      /^- \[([ x])\] ([A-Z][A-Z0-9_-]*) — ([^\n]+)\n\s+Writes: ([^\n]+)\.\n\s+Predict: (\d+(?:\.\d+)?) active min \/ (\d+(?:\.\d+)?) credits\.\n\s+How: ([^\n]+)\n\s+RED: `([^`]+)`/gm,
    )].map((task) => {
      const completed = capture(task, 1, "Task state") === "x";
      const renderedStory = capture(task, 3, "Task story");
      const completionCommit = completed ? renderedStory.match(/ — ([0-9a-f]{7,40})$/)?.[1] ?? null : null;
      return {
        index: task.index ?? 0,
        completed,
        completionCommit,
        format: "legacy" as const,
        input: {
          id: capture(task, 2, "Task ID"),
          story: completed ? renderedStory.replace(/ — [0-9a-f]{7,40}$/, "") : renderedStory,
        writes: renderedPaths(capture(task, 4, "Task writes"), `Task ${capture(task, 2, "Task ID")} writes`),
        predictedActiveMinutes: Number(capture(task, 5, "Task active minutes")),
        predictedCredits: Number(capture(task, 6, "Task credits")),
        how: parseHow(capture(task, 7, "Task how")),
        red: capture(task, 8, "Task RED"),
        },
      };
    });
    const taskMatches = [...modernTasks, ...legacyTasks].sort((left, right) => left.index - right.index);
    const criteriaBlock = block.match(/##### Acceptance criteria\n\n([\s\S]*?)\n\n##### Results/);
    // The prose between the forecast lines and the Tasks. A plan rendered
    // before descriptions existed has nothing there and reads as "".
    const descriptionBlock = block.match(/\n(?:- )?Of which verification: [^\n]+\n\n([\s\S]*?)\n\n##### Tasks\n/);
    inputs.push({
      id,
      deliveryId: typeof meta.deliveryId === "string" ? meta.deliveryId : "",
      title: capture(heading, 1, "Stage title"),
      owner: capture(ownerLine, 1, "Stage owner"),
      profile: capture(ownerLine, 2, "Stage profile") === "fast" ? "fast" : "strong",
      depends: stringArray(meta.depends, "Stage dependencies"),
      parallelWith: stringArray(meta.parallelWith, "Stage parallel set"),
      writes: stringArray(meta.writes, "Stage writes"),
      tempRoot: typeof meta.tempRoot === "string" ? meta.tempRoot : "",
      predictedActiveMinutes: Number(capture(match, 3, "Stage active minutes")),
      predictedCredits: Number(capture(match, 4, "Stage credits")),
      // Legacy plans carry no verification share: it derives as the gap
      // between the stage forecast and the task sum, which is its meaning.
      verifyActiveMinutes: typeof meta.verifyActiveMinutes === "number"
        ? meta.verifyActiveMinutes
        : Math.max(0, Number(capture(match, 3, "Stage active minutes"))
          - taskMatches.reduce((sum, task) => sum + task.input.predictedActiveMinutes, 0)),
      verifyCredits: typeof meta.verifyCredits === "number"
        ? meta.verifyCredits
        : Math.max(0, Number(capture(match, 4, "Stage credits"))
          - taskMatches.reduce((sum, task) => sum + task.input.predictedCredits, 0)),
      description: descriptionBlock === null ? "" : capture(descriptionBlock, 1, "Stage description").trim(),
      tasks: taskMatches.map((task) => ({
        ...task.input,
        completed: task.completed,
        completionCommit: task.completionCommit,
        format: task.format,
      })),
      criteria: criteriaBlock === null
        ? []
        : capture(criteriaBlock, 1, "Stage criteria").split("\n").filter((line) => /^- \[[ x]\] /.test(line)).map((line) =>
          line.replace(/^- \[[ x]\] /, "").replace(/ — [0-9a-f]{7,40}$/, "")
        ),
    });
  }
  return inputs;
}

/**
 * @tested-by: tst_int_planctl_calibration_001
 * @invariant: completed forecast evidence is derived from canonical Stage Results, not a second execution registry.
 */
export function completedStageSamples(body: string): readonly CompletedWorkSample[] {
  const samples: CompletedWorkSample[] = [];
  for (const stage of stageInputs(body)) {
    const block = region(body, stageStart(stage.id), stageEnd(stage.id)).text;
    const groups = new Map<string, {
      readonly commit: string;
      readonly completedAt: string;
      readonly actualActiveMinutes: number;
      readonly taskIds: Set<string>;
    }>();
    const rows = block.matchAll(
      /^\| ([A-Z][A-Z0-9_-]*) \| ([0-9a-f]{40}) \| ([^|\s]+)–([^|\s]+) \| (\d+(?:\.\d+)?) \/ \d+(?:\.\d+)? min \|/gm,
    );
    for (const match of rows) {
      const taskId = capture(match, 1, "Stage Result Task ID");
      const commit = capture(match, 2, "Stage Result commit");
      const completedAt = capture(match, 4, "Stage Result end");
      const actualActiveMinutes = Number(capture(match, 5, "Stage Result active minutes"));
      if (!Number.isFinite(Date.parse(completedAt)) || !Number.isFinite(actualActiveMinutes)) {
        throw new Error(`Stage ${stage.id} has invalid completed timing evidence`);
      }
      const key = `${commit}:${completedAt}:${actualActiveMinutes}`;
      const grouped = groups.get(key) ?? { commit, completedAt, actualActiveMinutes, taskIds: new Set<string>() };
      grouped.taskIds.add(taskId);
      groups.set(key, grouped);
    }
    for (const grouped of groups.values()) {
      const predictedActiveMinutes = [...grouped.taskIds].reduce((total, taskId) => {
        const task = stage.tasks.find((candidate) => candidate.id === taskId);
        if (task === undefined) throw new Error(`Stage ${stage.id} Result names unknown Task ${taskId}`);
        return total + task.predictedActiveMinutes;
      }, 0);
      samples.push({
        sampleId: `${stage.id}:${grouped.commit}`,
        predictedActiveMinutes,
        actualActiveMinutes: grouped.actualActiveMinutes,
        completedAt: grouped.completedAt,
      });
    }
  }
  return samples.sort((left, right) => left.completedAt.localeCompare(right.completedAt)
    || left.sampleId.localeCompare(right.sampleId));
}

export function deliveryMetas(body: string): readonly DeliveryMeta[] {

  const values: DeliveryMeta[] = [];
  const expression = /<!-- plan:delivery:(D[1-9]\d*):start -->\n<!-- plan:delivery-meta:(\{[^\n]*\}) -->/g;
  for (const match of body.matchAll(expression)) {
    const id = capture(match, 1, "Delivery ID");
    const meta = parseMetaObject(`<!-- plan:delivery-meta:${capture(match, 2, "Delivery metadata")} -->`, "<!-- plan:delivery-meta:");
    if (typeof meta.active !== "boolean") throw new Error(`Delivery ${id} lacks active metadata`);
    // A plan rendered before the forecast existed carries no wait: it reads as 0.
    const wait = typeof meta.predictedExternalWaitMinutes === "number" ? meta.predictedExternalWaitMinutes : 0;
    values.push({ id, active: meta.active, predictedExternalWaitMinutes: wait });
  }
  return values;
}

function assertParallelWrites(candidate: StageInput, existing: readonly StageInput[]): void {
  for (const other of existing) {
    if (!candidate.parallelWith.includes(other.id) && !other.parallelWith.includes(candidate.id)) continue;
    const overlap = candidate.writes.filter((path) => other.writes.includes(path));
    if (overlap.length > 0) {
      throw new Error(`parallel write overlap between ${candidate.id} and ${other.id}: ${overlap.join(", ")}`);
    }
  }
}

function validateImplementation(body: string): void {
  const deliveries = deliveryMetas(body);
  if (deliveries.length === 0) throw new Error("implementation has no Delivery");
  if (deliveries.filter((delivery) => delivery.active).length !== 1) {
    throw new Error("implementation must have exactly one active Delivery");
  }
  const stages = stageInputs(body);
  if (stages.length === 0) throw new Error("implementation has no Stage");
  for (const stage of stages) assertStageContract(stage);
  assertUnique(stages.flatMap((stage) => stage.tasks.map((task) => task.id)), "Plan Task IDs");
  const ids = new Set(stages.map((stage) => stage.id));
  for (const stage of stages) {
    for (const dependency of stage.depends) {
      if (!ids.has(dependency)) throw new Error(`${stage.id} depends on unknown Stage ${dependency}`);
    }
    for (const parallel of stage.parallelWith) {
      const other = stages.find((entry) => entry.id === parallel);
      if (other === undefined) throw new Error(`${stage.id} names unknown parallel Stage ${parallel}`);
      if (!other.parallelWith.includes(stage.id)) throw new Error(`${stage.id} parallel relation with ${parallel} is not symmetric`);
    }
    assertParallelWrites(stage, stages.filter((entry) => entry.id !== stage.id));
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`Stage dependency cycle reaches ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const current = stages.find((stage) => stage.id === id);
    if (current === undefined) throw new Error(`unknown Stage ${id}`);
    for (const dependency of current.depends) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const stage of stages) visit(stage.id);
}

function hasOpenTasks(body: string, stageId: string): boolean {
  const stage = region(body, stageStart(stageId), stageEnd(stageId));
  const tasks = stage.text.match(/##### Tasks\n\n([\s\S]*?)\n\n##### Acceptance criteria/);
  if (tasks === null) throw new Error(`Stage ${stageId} has no canonical Tasks section`);
  return /^- \[ \] /m.test(capture(tasks, 1, `Stage ${stageId} Tasks`));
}

export function taskExecutionBrief(body: string, taskId: string): TaskExecutionBrief {
  requireState(body, "APPROVED");
  const stages = stageInputs(body);
  const stage = stages.find((candidate) => candidate.tasks.some((task) => task.id === taskId));
  if (stage === undefined) throw new Error(`unknown Task ${taskId}`);
  const task = stage.tasks.find((candidate) => candidate.id === taskId);
  if (task === undefined) throw new Error(`unknown Task ${taskId}`);
  const activeDelivery = deliveryMetas(body).find((delivery) => delivery.active);
  if (activeDelivery?.id !== stage.deliveryId) throw new Error(`Task ${taskId} is outside the active Delivery`);
  const block = region(body, stageStart(stage.id), stageEnd(stage.id));
  const status = block.text.match(new RegExp(`^- \\[([ x])\\] ${taskId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} — `, "m"));
  if (status === null) throw new Error(`Task ${taskId} text does not match its contract`);
  if (status[1] === "x") throw new Error(`Task ${taskId} is already complete`);
  const blockedBy = stage.depends.filter((dependency) => hasOpenTasks(body, dependency));
  if (blockedBy.length > 0) throw new Error(`Task ${taskId} is blocked by incomplete Stage(s): ${blockedBy.join(", ")}`);
  return {
    ...task,
    deliveryId: stage.deliveryId,
    stageId: stage.id,
    stageTitle: stage.title,
    owner: stage.owner,
    profile: stage.profile,
    tempRoot: stage.tempRoot,
    stageDescription: stage.description,
  };
}

export function lockPlanSpec(body: string, ownerWord: string): MutationResult {
  requireState(body, "SPEC_DRAFT");
  assertSafeInline(ownerWord, "owner word");
  const specHash = protocolSpecHash(body);
  let next = replaceHeader(body, "Status", "SPEC_LOCKED");
  next = replaceHeader(next, "Spec lock", `sha256:${specHash} owner:${ownerWord}`);
  next = appendExecution(next, `lock-spec sha256:${specHash} owner:${ownerWord}`);
  return { body: next, specHash };
}

export function putDelivery(body: string, input: DeliveryInput): MutationResult {
  requireState(body, "SPEC_LOCKED");
  const current = deliveryMetas(body);
  if (input.active && current.some((delivery) => delivery.id !== input.id && delivery.active)) {
    throw new Error("only one active Delivery is allowed");
  }
  if (body.includes(deliveryStart(input.id))) {
    const delivery = region(body, deliveryStart(input.id), deliveryEnd(input.id));
    const firstStage = delivery.text.indexOf("<!-- plan:stage:");
    const stages = firstStage === -1
      ? ""
      : delivery.text.slice(firstStage, delivery.text.lastIndexOf(deliveryEnd(input.id))).trim();
    const rendered = renderDelivery(input, stageInputs(body));
    const beforeEnd = rendered.slice(0, rendered.lastIndexOf(deliveryEnd(input.id))).trimEnd();
    const replacement = `${beforeEnd}${stages === "" ? "" : `\n\n${stages}`}\n${deliveryEnd(input.id)}`;
    let next = `${body.slice(0, delivery.from)}${replacement}${body.slice(delivery.to)}`;
    next = replaceHeader(next, "Active Delivery", input.active
      ? input.id
      : current.find((candidate) => candidate.id !== input.id && candidate.active)?.id ?? "none");
    next = appendExecution(next, `replace-delivery ${input.id}`);
    return { body: next };
  }
  const implementation = region(body, IMPLEMENTATION_START, IMPLEMENTATION_END);
  const beforeEnd = implementation.text.slice(0, implementation.text.lastIndexOf(IMPLEMENTATION_END)).trimEnd();
  const replacement = `${beforeEnd}\n\n${renderDelivery(input, stageInputs(body))}\n${IMPLEMENTATION_END}`;
  let next = replaceRegion(body, IMPLEMENTATION_START, IMPLEMENTATION_END, replacement);
  next = replaceHeader(next, "Active Delivery", input.active ? input.id : current.find((delivery) => delivery.active)?.id ?? "none");
  next = appendExecution(next, `put-delivery ${input.id}`);
  return { body: next };
}

export function putStage(body: string, input: StageInput): MutationResult {
  requireState(body, "SPEC_LOCKED");
  const existing = stageInputs(body);
  for (const dependency of input.depends) {
    if (dependency === input.id || !existing.some((stage) => stage.id === dependency)) {
      throw new Error(`${input.id} depends on unknown Stage ${dependency}`);
    }
  }
  assertParallelWrites(input, existing.filter((stage) => stage.id !== input.id));
  if (body.includes(stageStart(input.id))) {
    const current = region(body, stageStart(input.id), stageEnd(input.id));
    let next = `${body.slice(0, current.from)}${renderStage(input)}${body.slice(current.to)}`;
    next = refreshDeliveryForecast(next, input.deliveryId);
    next = appendExecution(next, `replace-stage ${input.id}`);
    return { body: next };
  }
  const delivery = region(body, deliveryStart(input.deliveryId), deliveryEnd(input.deliveryId));
  const beforeEnd = delivery.text.slice(0, delivery.text.lastIndexOf(deliveryEnd(input.deliveryId))).trimEnd();
  const replacement = `${beforeEnd}\n\n${renderStage(input)}\n${deliveryEnd(input.deliveryId)}`;
  let next = replaceRegion(body, deliveryStart(input.deliveryId), deliveryEnd(input.deliveryId), replacement);
  next = refreshDeliveryForecast(next, input.deliveryId);
  next = appendExecution(next, `put-stage ${input.id}`);
  return { body: next };
}

export function dropImplementationRecord(body: string, id: string): MutationResult {
  requireState(body, "SPEC_LOCKED");
  const start = STAGE_ID.test(id) ? stageStart(id) : deliveryStart(id);
  const end = STAGE_ID.test(id) ? stageEnd(id) : deliveryEnd(id);
  const current = region(body, start, end);
  let next = `${body.slice(0, current.from)}${body.slice(current.to)}`.replace(/\n{3,}/g, "\n\n");
  next = appendExecution(next, `drop ${id}`);
  return { body: next };
}

export function removeDraftStage(body: string, id: string): MutationResult {
  const match = id.match(STAGE_ID);
  if (match === null) throw new Error(`invalid Stage ID ${id}`);
  const dropped = dropImplementationRecord(body, id);
  const deliveryId = capture(match, 1, "Delivery ID");
  return dropped.body.includes(deliveryStart(deliveryId))
    ? { ...dropped, body: refreshDeliveryForecast(dropped.body, deliveryId) }
    : dropped;
}

export function moveImplementationRecord(body: string, id: string, beforeId: string): MutationResult {
  requireState(body, "SPEC_LOCKED");
  const sourceStart = STAGE_ID.test(id) ? stageStart(id) : deliveryStart(id);
  const sourceEnd = STAGE_ID.test(id) ? stageEnd(id) : deliveryEnd(id);
  const targetStart = STAGE_ID.test(beforeId) ? stageStart(beforeId) : deliveryStart(beforeId);
  const source = region(body, sourceStart, sourceEnd);
  let without = `${body.slice(0, source.from)}${body.slice(source.to)}`;
  const target = without.indexOf(targetStart);
  if (target === -1) throw new Error(`move target ${beforeId} does not exist`);
  without = `${without.slice(0, target)}${source.text}\n\n${without.slice(target)}`.replace(/\n{3,}/g, "\n\n");
  return { body: appendExecution(without, `move ${id} before ${beforeId}`) };
}

export function approvePlan(body: string, ownerWord: string): MutationResult {
  requireState(body, "SPEC_LOCKED");
  assertSafeInline(ownerWord, "owner word");
  validateImplementation(body);
  // The forecast lines are the prediction the approval freezes: recomputed
  // once more here so no Stage change can leave a Delivery line behind.
  let next = body;
  for (const delivery of deliveryMetas(body)) next = refreshDeliveryForecast(next, delivery.id);
  const implementationHash = protocolImplementationHash(next);
  next = replaceHeader(next, "Status", "APPROVED");
  next = replaceHeader(next, "Implementation lock", `sha256:${implementationHash} owner:${ownerWord}`);
  next = appendExecution(next, `approve sha256:${implementationHash} owner:${ownerWord}`);
  return { body: next, implementationHash };
}

function assertReceipt(receipt: StageResultReceipt): void {
  if (receipt.version !== 1) throw new Error("unsupported Stage result version");
  if (!/^docs\/plans\/[a-z0-9][a-z0-9-]*\.md$/.test(receipt.plan)) throw new Error("Stage result plan must be a canonical docs/plans path");
  if (!DELIVERY_ID.test(receipt.deliveryId) || !STAGE_ID.test(receipt.stageId)) throw new Error("Stage result Delivery or Stage ID is invalid");
  if (!SHA.test(receipt.commit)) throw new Error("Stage result commit is not a Git SHA");
  if (receipt.taskIds.length === 0) throw new Error("Stage result must name at least one Task");
  if (receipt.activeMinutes < 0 || receipt.elapsedMinutes < receipt.activeMinutes) {
    throw new Error("Stage result time is invalid");
  }
  const started = Date.parse(receipt.startedAt);
  const ended = Date.parse(receipt.endedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started
    || Math.abs(receipt.elapsedMinutes - ((ended - started) / 60_000)) > 1) {
    throw new Error("Stage result UTC interval does not match elapsedMinutes");
  }
  if (receipt.tests.length === 0) throw new Error("Stage result must name at least one test");
  assertUnique(receipt.taskIds, "Stage result Task IDs");
  assertUnique(receipt.paths, "Stage result paths");
  assertUnique(receipt.tests.map((test) => test.id), "Stage result test IDs");
  assertUnique(receipt.tempRoots.map((temp) => temp.path), "Stage result temp roots");
  for (const taskId of receipt.taskIds) {
    if (!TASK_ID.test(taskId)) throw new Error(`invalid Stage result Task ID ${taskId}`);
  }
  for (const test of receipt.tests) {
    assertSafeInline(test.id, "Stage result test ID");
    assertSafeInline(test.command, `Stage result test ${test.id} command`);
  }
  for (const path of receipt.paths) assertSafeInline(path, "Stage result path");
  for (const deviation of receipt.deviations) assertSafeInline(deviation, "Stage result deviation");
  assertNonEmpty(receipt.result, "Stage result");
  if (receipt.usage.kind === "credits") {
    if (receipt.usage.credits < 0 || receipt.usage.inputTokens < 0 || receipt.usage.cachedInputTokens < 0 || receipt.usage.outputTokens < 0) {
      throw new Error("Stage usage values must be non-negative");
    }
    assertNonEmpty(receipt.usage.rateCardDate, "Stage usage rateCardDate");
    assertNonEmpty(receipt.usage.source, "Stage usage source");
  } else {
    assertNonEmpty(receipt.usage.reason, "unavailable usage reason");
  }
}

function defaultCommitIsAncestor(commit: string): boolean {
  return spawnSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"]).status === 0;
}

export function stageResultCommitPaths(commit: string, root = process.cwd()): readonly string[] {
  const firstParent = spawnSync("git", ["rev-parse", "--verify", `${commit}^1`], {
    cwd: root,
    encoding: "utf8",
  });
  const result = firstParent.status === 0
    ? spawnSync("git", ["diff", "--name-only", firstParent.stdout.trim(), commit], { cwd: root, encoding: "utf8" })
    : spawnSync("git", ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit], {
        cwd: root,
        encoding: "utf8",
      });
  if (result.status !== 0) throw new Error(`cannot inspect Stage result commit ${commit}`);
  return result.stdout.split("\n").filter((path) => path !== "");
}

function defaultCommitPaths(commit: string): readonly string[] {
  return stageResultCommitPaths(commit);
}

export function recordStageResult(
  body: string,
  receipt: StageResultReceipt,
  options: StageResultOptions = {},
): MutationResult {
  requireState(body, "APPROVED");
  assertReceipt(receipt);
  const stage = stageInputs(body).find((entry) => entry.id === receipt.stageId);
  if (stage === undefined || stage.deliveryId !== receipt.deliveryId) throw new Error(`unknown Stage ${receipt.stageId}`);
  const addressedTasks = receipt.taskIds.map((id) => stage.tasks.find((task) => task.id === id));
  if (addressedTasks.some((task) => task === undefined)) {
    throw new Error(`Stage ${receipt.stageId} result names an unknown Task`);
  }
  const declaredPaths = [...new Set(addressedTasks.flatMap((task) => task?.writes ?? []))];
  if (!equalSets(receipt.paths, declaredPaths)) throw new Error(`Stage ${receipt.stageId} result paths differ from addressed Task writes`);
  const commitIsAncestor = options.commitIsAncestor ?? defaultCommitIsAncestor;
  if (!commitIsAncestor(receipt.commit)) throw new Error(`Stage result commit ${receipt.commit} is not ancestral to HEAD`);
  const commitPaths = options.commitPaths ?? defaultCommitPaths;
  const actualPaths = commitPaths(receipt.commit).filter((path) => path !== receipt.plan);
  if (!equalSets(receipt.paths, actualPaths)) throw new Error(`Stage result paths differ from commit ${receipt.commit} diff`);
  const pathExists = options.pathExists ?? existsSync;
  if (receipt.tempRoots.length !== 1 || receipt.tempRoots[0]?.path !== stage.tempRoot) {
    throw new Error(`Stage ${receipt.stageId} result must prove its registered temp root absent: ${stage.tempRoot}`);
  }
  for (const temp of receipt.tempRoots) {
    if (temp.state !== "absent") throw new Error(`temp root ${temp.path} is not declared absent`);
    if (pathExists(temp.path)) throw new Error(`temp root still exists: ${temp.path}`);
  }
  const block = region(body, stageStart(receipt.stageId), stageEnd(receipt.stageId));
  if (block.text.includes(`| ${receipt.taskIds[0]} | ${receipt.commit}`)) throw new Error("Stage result already recorded");
  let changedBlock = block.text;
  for (const taskId of receipt.taskIds) {
    const taskLine = new RegExp(`^- \\[ \\] (${taskId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} — [^\\n]+)$`, "m");
    if (!taskLine.test(changedBlock)) throw new Error(`Task ${taskId} is not open or its text changed`);
    changedBlock = changedBlock.replace(taskLine, `- [x] $1 — ${receipt.commit}`);
  }
  const usage = receipt.usage.kind === "credits" ? `${receipt.usage.credits} credits` : `unavailable: ${receipt.usage.reason}`;
  const rows = receipt.taskIds.map((taskId) =>
    `| ${markdownCell(taskId)} | ${receipt.commit} | ${receipt.startedAt}–${receipt.endedAt} | ` +
    `${receipt.activeMinutes} / ${receipt.elapsedMinutes} min | ${markdownCell(usage)} | ${markdownCell(receipt.result)} |`,
  ).join("\n");
  const resultMarker = resultsEnd(receipt.stageId);
  changedBlock = changedBlock.replace(resultMarker, `${rows}\n${resultMarker}`);
  let next = `${body.slice(0, block.from)}${changedBlock}${body.slice(block.to)}`;
  next = appendExecution(next, `record-result ${receipt.stageId} commit:${receipt.commit}`);
  for (const deviation of receipt.deviations) next = appendExecution(next, `deviation ${receipt.stageId}: ${deviation}`);
  return { body: next };
}

function assertDecision(decision: UnattendedDecisionReceipt): void {
  if (decision.version !== 1) throw new Error("unsupported unattended decision version");
  assertNonEmpty(decision.decidedAt, "decision time");
  assertNonEmpty(decision.goalPreserved, "goalPreserved");
  assertNonEmpty(decision.decision, "decision");
  assertNonEmpty(decision.whyContinueNow, "whyContinueNow");
  if (decision.alternatives.length === 0) throw new Error("unattended decision needs alternatives");
  if (decision.affectedScope.length === 0) throw new Error("unattended decision needs affectedScope");
  if (!SHA.test(decision.rollbackBase)) throw new Error("unattended decision needs a rollbackBase SHA");
  if (decision.verification.length === 0) throw new Error("unattended decision needs verification");
}

function replaceExactlyOnce(value: string, find: string, replacement: string): string {
  assertNonEmpty(find, "amendment find text");
  const first = value.indexOf(find);
  if (first === -1) throw new Error("amendment target is absent");
  if (value.indexOf(find, first + find.length) !== -1) throw new Error("amendment target is ambiguous");
  return `${value.slice(0, first)}${replacement}${value.slice(first + find.length)}`;
}

function amendRegion(body: string, patch: ExactReplacement): string {
  const markers = patch.section === "spec"
    ? [SPEC_START, SPEC_END] as const
    : [IMPLEMENTATION_START, IMPLEMENTATION_END] as const;
  const current = region(body, markers[0], markers[1]);
  const changed = replaceExactlyOnce(current.text, patch.find, patch.replace);
  return `${body.slice(0, current.from)}${changed}${body.slice(current.to)}`;
}

export function applyOwnerAmendment(body: string, ownerWord: string, patch: ExactReplacement): MutationResult {
  if (planState(body) !== "APPROVED") throw new Error("owner amendment requires APPROVED plan");
  assertSafeInline(ownerWord, "owner word");
  let next = amendRegion(body, patch);
  if (patch.section === "spec") {
    const specHash = protocolSpecHash(next);
    next = replaceHeader(next, "Status", "SPEC_LOCKED");
    next = replaceHeader(next, "Spec lock", `sha256:${specHash} owner:${ownerWord}`);
    next = replaceHeader(next, "Implementation lock", "stale");
    next = appendExecution(next, `amend spec owner:${ownerWord} sha256:${specHash}`);
    return { body: next, specHash };
  }
  validateImplementation(next);
  const implementationHash = protocolImplementationHash(next);
  next = replaceHeader(next, "Implementation lock", `sha256:${implementationHash} owner:${ownerWord}`);
  next = appendExecution(next, `amend implementation owner:${ownerWord} sha256:${implementationHash}`);
  return { body: next, implementationHash };
}

export function applyUnattendedAmendment(
  body: string,
  decision: UnattendedDecisionReceipt,
  patch: ExactReplacement,
): MutationResult {
  requireState(body, "APPROVED");
  if (!/^Unattended decisions:\s*allowed\s*$/m.test(body)) throw new Error("unattended decisions are not allowed");
  assertDecision(decision);
  let next = amendRegion(body, patch);
  const changedHash = patch.section === "spec" ? protocolSpecHash(next) : protocolImplementationHash(next);
  if (patch.section === "spec") next = replaceHeader(next, "Spec lock", `sha256:${changedHash} agent-unattended`);
  else next = replaceHeader(next, "Implementation lock", `sha256:${changedHash} agent-unattended`);
  const encoded = Buffer.from(JSON.stringify(decision), "utf8").toString("base64url");
  next = appendExecution(next, `owner_review_pending ${patch.section} sha256:${changedHash} decision:${encoded}`);
  return patch.section === "spec"
    ? { body: next, specHash: changedHash }
    : { body: next, implementationHash: changedHash };
}

export function recordDeviation(body: string, stageId: string, text: string): MutationResult {
  requireState(body, "APPROVED");
  if (!body.includes(stageStart(stageId))) throw new Error(`unknown Stage ${stageId}`);
  assertSafeInline(text, "deviation");
  return { body: appendExecution(body, `deviation ${stageId}: ${text}`) };
}

export function closePlanStage(
  body: string,
  stageId: string,
  options: { readonly root: string; readonly head: string; readonly run?: (command: string) => number | null },
): StageCloseResult {
  requireState(body, "APPROVED");
  const stage = region(body, stageStart(stageId), stageEnd(stageId));
  const taskSection = stage.text.match(/##### Tasks\n\n([\s\S]*?)\n\n##### Acceptance criteria/);
  const criteriaSection = stage.text.match(/##### Acceptance criteria\n\n([\s\S]*?)\n\n##### Results/);
  if (taskSection === null || criteriaSection === null) throw new Error(`Stage ${stageId} has no canonical task/criteria sections`);
  const taskText = capture(taskSection, 1, `Stage ${stageId} Tasks`);
  const criteriaText = capture(criteriaSection, 1, `Stage ${stageId} criteria`);
  if (/^- \[ \] /m.test(taskText)) throw new Error(`Stage ${stageId} still has open Tasks; import its result first`);
  const run = options.run ?? ((command: string): number | null => {
    const result = spawnSync("bash", ["-c", command], { cwd: options.root, timeout: 600_000 });
    return result.error === undefined && result.signal === null ? result.status : null;
  });
  let closed = 0;
  const changedCriteria = criteriaText.split("\n").map((line) => {
    const open = line.match(/^- \[ \] (.+)$/);
    if (open === null) return line;
    const criterion = capture(open, 1, "acceptance criterion");
    const machine = criterion.match(MACHINABLE);
    const proven = machine !== null
      ? run(capture(machine, 1, "criterion command")) === Number(capture(machine, 2, "criterion exit"))
      : criterion === "Commit" && SHA.test(options.head);
    if (!proven) return line;
    closed += 1;
    return `- [x] ${criterion} — ${options.head}`;
  }).join("\n");
  let changedStage = stage.text.replace(criteriaText, changedCriteria);
  const remaining = (changedStage.match(/^- \[ \] /gm) ?? []).length;
  const status = remaining === 0 ? "CLOSED" : "PARTIAL";
  let next = `${body.slice(0, stage.from)}${changedStage}${body.slice(stage.to)}`;
  next = appendExecution(next, `close ${stageId} ${status.toLowerCase()} commit:${options.head}`);
  return { body: next, closed, status };
}

function gitRaw(root: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

function git(root: string, args: readonly string[]): string {
  return gitRaw(root, args).trim();
}

function journalPath(root: string): string {
  const value = git(root, ["rev-parse", "--git-path", "plan-update-journal.json"]);
  return resolve(root, value);
}

function parseJournal(value: unknown): MutationJournal {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("mutation journal is not an object");
  const record = value as Readonly<Record<string, unknown>>;
  if (record.version !== 1 || typeof record.root !== "string" || typeof record.plan !== "string"
    || typeof record.baseHead !== "string" || typeof record.initialHash !== "string"
    || typeof record.candidateHash !== "string" || !Array.isArray(record.events)) {
    throw new Error("mutation journal has an unsupported shape");
  }
  const events: JournalEvent[] = record.events.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new Error("mutation journal event is invalid");
    const event = entry as Readonly<Record<string, unknown>>;
    if (typeof event.operation !== "string" || typeof event.beforeHash !== "string" || typeof event.afterHash !== "string") {
      throw new Error("mutation journal event fields are invalid");
    }
    return { operation: event.operation, beforeHash: event.beforeHash, afterHash: event.afterHash };
  });
  return {
    version: 1,
    root: record.root,
    plan: record.plan,
    baseHead: record.baseHead,
    initialHash: record.initialHash,
    candidateHash: record.candidateHash,
    events,
  };
}

function readJournal(path: string): MutationJournal | null {
  if (!existsSync(path)) return null;
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return parseJournal(parsed);
}

function mutatePlanFile(planArg: string, operation: string, transform: (body: string) => MutationResult): void {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const absolute = resolve(root, planArg);
  const plan = absolute.slice(root.length + 1);
  if (absolute === root || plan.startsWith("..")) throw new Error("plan must be inside the repository");
  const path = journalPath(root);
  const body = readFileSync(absolute, "utf8");
  const head = git(root, ["rev-parse", "HEAD"]);
  const currentHash = digest(body);
  const existing = readJournal(path);
  let initialHash: string;
  let events: readonly JournalEvent[];
  if (existing === null) {
    const committed = gitRaw(root, ["show", `HEAD:${plan}`]);
    const staged = gitRaw(root, ["show", `:${plan}`]);
    if (body !== committed || staged !== committed) throw new Error("dirty preimage: start a plan transaction from committed HEAD");
    initialHash = currentHash;
    events = [];
  } else {
    if (existing.root !== root || existing.plan !== plan || existing.baseHead !== head) {
      throw new Error("mutation journal belongs to a different plan, root or HEAD");
    }
    if (existing.candidateHash !== currentHash) throw new Error("plan differs from the journal candidate; raw edit refused");
    initialHash = existing.initialHash;
    events = existing.events;
  }
  const result = { ...transform(body), body: hardBreakHeader(transform(body).body) };
  const afterHash = digest(result.body);
  if (afterHash === currentHash) throw new Error(`${operation} produced no change`);
  writeFileSync(absolute, result.body);
  git(root, ["add", plan]);
  const journal: MutationJournal = {
    version: 1,
    root,
    plan,
    baseHead: head,
    initialHash,
    candidateHash: afterHash,
    events: [...events, { operation, beforeHash: currentHash, afterHash }],
  };
  writeFileSync(path, `${JSON.stringify(journal, null, 2)}\n`);
}

/** Is a merge in progress in this worktree? */
function merging(root: string): boolean {
  return spawnSync("git", ["-C", root, "rev-parse", "-q", "--verify", "MERGE_HEAD"], {
    encoding: "utf8",
  }).status === 0;
}

export function verifyStagedPlan(planArg: string): void {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  // A MERGE authored none of these bytes here. The journal proves that a
  // locked plan reached its staged shape through planctl in THIS worktree,
  // and a plan arriving from another branch never did — demanding one made
  // every merge that carried an approved plan uncommittable, which is a gate
  // refusing honest work. `plan-gate --freeze` is the authority for a merge:
  // it reads git's own auto-merged tree and refuses a hand edit that a
  // resolution smuggled in. This stands aside and lets it answer.
  if (merging(root)) return;
  const plan = resolve(root, planArg).slice(root.length + 1);
  const journal = readJournal(journalPath(root));
  if (journal === null) throw new Error("locked plan mutation has no journal");
  if (journal.plan !== plan || journal.root !== root || journal.baseHead !== git(root, ["rev-parse", "HEAD"])) {
    throw new Error("mutation journal binding does not match this staged plan");
  }
  const staged = gitRaw(root, ["show", `:${plan}`]);
  if (digest(staged) !== journal.candidateHash) throw new Error("staged plan differs from journal candidate");
  let expected = journal.initialHash;
  for (const event of journal.events) {
    if (event.beforeHash !== expected) throw new Error("mutation journal chain is broken");
    expected = event.afterHash;
  }
  if (expected !== journal.candidateHash) throw new Error("mutation journal does not reach candidate");
}

export function clearSpentJournal(planArg: string, commit: string): void {
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const plan = resolve(root, planArg).slice(root.length + 1);
  const path = journalPath(root);
  const journal = readJournal(path);
  if (journal === null) return;
  if (journal.plan !== plan) throw new Error("mutation journal belongs to another plan");
  const committed = gitRaw(root, ["show", `${commit}:${plan}`]);
  if (digest(committed) !== journal.candidateHash) throw new Error("commit does not contain the journal candidate");
  unlinkSync(path);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function object(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Readonly<Record<string, unknown>>;
}

function requiredString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value;
}

function requiredNumber(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a number`);
  return value;
}

function deliveryFrom(value: unknown): DeliveryInput {
  const record = object(value, "Delivery");
  if (typeof record.active !== "boolean") throw new Error("active must be boolean");
  return {
    id: requiredString(record, "id"), title: requiredString(record, "title"), branch: requiredString(record, "branch"),
    depends: stringArray(record.depends, "depends"), gate: stringArray(record.gate, "gate"), active: record.active,
    stageGraph: requiredString(record, "stageGraph"),
    predictedExternalWaitMinutes: typeof record.predictedExternalWaitMinutes === "number" ? record.predictedExternalWaitMinutes : Number.NaN,
    description: typeof record.description === "string" ? record.description : "",
  };
}

function tasksFrom(value: unknown): readonly TaskInput[] {
  if (!Array.isArray(value)) throw new Error("tasks must be an array");
  return value.map((entry) => {
    const task = object(entry, "Task");
    return {
      id: requiredString(task, "id"),
      story: requiredString(task, "story"),
      writes: stringArray(task.writes, "Task writes"),
      predictedActiveMinutes: requiredNumber(task, "predictedActiveMinutes"),
      predictedCredits: requiredNumber(task, "predictedCredits"),
      how: typeof task.how === "string" ? task.how : stringArray(task.how, "how"),
      red: requiredString(task, "red"),
    };
  });
}

function stageFrom(value: unknown): StageInput {
  const record = object(value, "Stage");
  const profile = requiredString(record, "profile");
  if (profile !== "fast" && profile !== "strong") throw new Error("profile must be fast or strong");
  return {
    id: requiredString(record, "id"), deliveryId: requiredString(record, "deliveryId"), title: requiredString(record, "title"),
    owner: requiredString(record, "owner"), profile, depends: stringArray(record.depends, "depends"),
    parallelWith: stringArray(record.parallelWith, "parallelWith"), writes: stringArray(record.writes, "writes"),
    tempRoot: requiredString(record, "tempRoot"),
    predictedActiveMinutes: requiredNumber(record, "predictedActiveMinutes"), predictedCredits: requiredNumber(record, "predictedCredits"),
    verifyActiveMinutes: requiredNumber(record, "verifyActiveMinutes"), verifyCredits: requiredNumber(record, "verifyCredits"),
    description: typeof record.description === "string" ? record.description : "",
    tasks: tasksFrom(record.tasks), criteria: stringArray(record.criteria, "criteria"),
  };
}

function usageFrom(value: unknown): UsageReceipt {
  const usage = object(value, "Stage result usage");
  const kind = usage.kind;
  if (kind === "unavailable") return { kind, reason: requiredString(usage, "reason") };
  if (kind === "credits") {
    return {
      kind,
      credits: requiredNumber(usage, "credits"),
      inputTokens: requiredNumber(usage, "inputTokens"),
      cachedInputTokens: requiredNumber(usage, "cachedInputTokens"),
      outputTokens: requiredNumber(usage, "outputTokens"),
      rateCardDate: requiredString(usage, "rateCardDate"),
      source: requiredString(usage, "source"),
    };
  }
  throw new Error("usage kind must be credits or unavailable");
}

function testsFrom(value: unknown): StageResultReceipt["tests"] {
  if (!Array.isArray(value)) throw new Error("tests must be an array");
  return value.map((entry) => {
    const test = object(entry, "Stage result test");
    return { id: requiredString(test, "id"), command: requiredString(test, "command") };
  });
}

function tempRootsFrom(value: unknown): StageResultReceipt["tempRoots"] {
  if (!Array.isArray(value)) throw new Error("tempRoots must be an array");
  return value.map((entry) => {
    const temp = object(entry, "Stage result temp root");
    if (temp.state !== "absent") throw new Error("temp root state must be absent");
    return { path: requiredString(temp, "path"), state: "absent" };
  });
}

function stageResultFrom(value: unknown): StageResultReceipt {
  const result = object(value, "Stage result");
  if (result.version !== 1) throw new Error("unsupported Stage result version");
  return {
    version: 1,
    plan: requiredString(result, "plan"),
    deliveryId: requiredString(result, "deliveryId"),
    stageId: requiredString(result, "stageId"),
    taskIds: stringArray(result.taskIds, "taskIds"),
    commit: requiredString(result, "commit"),
    startedAt: requiredString(result, "startedAt"),
    endedAt: requiredString(result, "endedAt"),
    activeMinutes: requiredNumber(result, "activeMinutes"),
    elapsedMinutes: requiredNumber(result, "elapsedMinutes"),
    usage: usageFrom(result.usage),
    paths: stringArray(result.paths, "paths"),
    tests: testsFrom(result.tests),
    result: requiredString(result, "result"),
    deviations: stringArray(result.deviations, "deviations"),
    tempRoots: tempRootsFrom(result.tempRoots),
  };
}

function decisionFrom(value: unknown): UnattendedDecisionReceipt {
  const decision = object(value, "unattended decision");
  if (decision.version !== 1) throw new Error("unsupported unattended decision version");
  return {
    version: 1,
    decidedAt: requiredString(decision, "decidedAt"),
    goalPreserved: requiredString(decision, "goalPreserved"),
    decision: requiredString(decision, "decision"),
    alternatives: stringArray(decision.alternatives, "alternatives"),
    whyContinueNow: requiredString(decision, "whyContinueNow"),
    affectedScope: stringArray(decision.affectedScope, "affectedScope"),
    rollbackBase: requiredString(decision, "rollbackBase"),
    verification: stringArray(decision.verification, "verification"),
  };
}

function patchFrom(value: unknown): ExactReplacement {
  const record = object(value, "patch");
  const section = requiredString(record, "section");
  if (section !== "spec" && section !== "implementation") throw new Error("patch section must be spec or implementation");
  return { section, find: requiredString(record, "find"), replace: requiredString(record, "replace") };
}

function flag(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

function requiredFlag(args: readonly string[], name: string): string {
  const value = flag(args, name);
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
}

function usage(): never {
  console.error("usage: bun planctl/src/core/plan-update.ts <plan> <lock-spec|put-delivery|put-stage|remove-stage|drop|move|approve|record-result|close|deviate|amend|unattended-amend|verify-staged|clear-spent> [options]");
  process.exit(64);
}

if (import.meta.main && ["plan-update.ts", "plan-update.js"].includes(basename(import.meta.path))) {
  const args = process.argv.slice(2);
  const plan = args[0];
  const command = args[1];
  if (plan === undefined || command === undefined) usage();
  try {
    switch (command) {
      case "lock-spec":
        mutatePlanFile(plan, command, (body) => lockPlanSpec(body, requiredFlag(args, "--owner-word")));
        break;
      case "put-delivery":
        mutatePlanFile(plan, command, (body) => putDelivery(body, deliveryFrom(readJson(requiredFlag(args, "--from")))));
        break;
      case "put-stage":
        mutatePlanFile(plan, command, (body) => putStage(body, stageFrom(readJson(requiredFlag(args, "--from")))));
        break;
      case "remove-stage":
        mutatePlanFile(plan, command, (body) => removeDraftStage(body, requiredFlag(args, "--stage")));
        break;
      case "drop":
        mutatePlanFile(plan, command, (body) => dropImplementationRecord(body, requiredFlag(args, "--id")));
        break;
      case "move":
        mutatePlanFile(plan, command, (body) => moveImplementationRecord(body, requiredFlag(args, "--id"), requiredFlag(args, "--before")));
        break;
      case "approve":
        mutatePlanFile(plan, command, (body) => approvePlan(body, requiredFlag(args, "--owner-word")));
        break;
      case "record-result":
        mutatePlanFile(plan, command, (body) => recordStageResult(body, stageResultFrom(readJson(requiredFlag(args, "--from")))));
        break;
      case "close": {
        const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
        const head = git(root, ["rev-parse", "HEAD"]);
        mutatePlanFile(plan, command, (body) => closePlanStage(body, requiredFlag(args, "--stage"), { root, head }));
        break;
      }
      case "deviate":
        mutatePlanFile(plan, command, (body) => recordDeviation(body, requiredFlag(args, "--stage"), requiredFlag(args, "--reason")));
        break;
      case "amend": {
        const patch = patchFrom(readJson(requiredFlag(args, "--patch")));
        mutatePlanFile(plan, command, (body) => applyOwnerAmendment(body, requiredFlag(args, "--owner-word"), patch));
        break;
      }
      case "unattended-amend": {
        const patch = patchFrom(readJson(requiredFlag(args, "--patch")));
        const decision = decisionFrom(readJson(requiredFlag(args, "--from")));
        mutatePlanFile(plan, command, (body) => applyUnattendedAmendment(body, decision, patch));
        break;
      }
      case "verify-staged":
        verifyStagedPlan(plan);
        break;
      case "clear-spent":
        clearSpentJournal(plan, requiredFlag(args, "--commit"));
        break;
      default:
        usage();
    }
    if (command !== "verify-staged" && command !== "clear-spent") {
      console.log(`plan-update: ${command} staged with a bound mutation journal`);
    }
  } catch (error) {
    console.error(`plan-update: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
