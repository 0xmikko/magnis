#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { DeliveryMeta, ParsedStageInput, TaskExecutionBrief } from "../core/plan-update";
import type { OwnerWaitMarker, TaskRun, TaskRunV1 } from "../core/task-run";
import type { GitWorktreeIdentity } from "../machine/sessions/session-source";
import type { FocusView, ProgressPlanView } from "./render";

function portableRuntimeFile(name: "plan-gate.ts" | "plan-update.ts"): string {
  const layout = basename(import.meta.dir);
  const runtimeName = import.meta.path.endsWith(".js") ? name.replace(/\.ts$/, ".js") : name;
  if (layout === "cli") return resolve(import.meta.dir, "../core", runtimeName);
  if (layout === "runtime") return resolve(import.meta.dir, runtimeName);
  throw new Error(`unsupported planctl runtime layout: ${import.meta.dir}`);
}

const PLAN_UPDATE_FILE = portableRuntimeFile("plan-update.ts");
const {
  createDraftPlan,
  deliveryMetas,
  replaceDraftSpec,
  stageInputs,
  taskExecutionBrief,
  verifyStagedPlan,
} = await import(PLAN_UPDATE_FILE);
const { protocolImplementationHash, protocolLockViolations } = await import(portableRuntimeFile("plan-gate.ts"));

const GENERAL_HELP = `Usage: planctl <command> [arguments]

Small agent-facing CLI over one canonical writer: plan-update.
Plans are authored and advanced by commands; approved plan bytes are never
edited directly.

Authoring:
  init               Create and stage a SPEC_DRAFT plan
  set-spec           Replace and stage SPEC while it is still draft
  approve-spec       Lock SPEC after explicit owner approval
  put-delivery       Add or replace one draft PR Delivery from JSON
  put-stage          Add or replace one draft commit-sized Stage from JSON
  remove-stage       Remove one draft Stage
  approve-plan       Lock Delivery, Stage and Task meaning

Configuration:
  config init        Write a commented machine or server template
  config check       Validate one machine or server TOML file

Execution:
  start-task         Validate one approved Task, print its scope and start timing
  focus              Reprint the Goal, exact Task, next ready work and evidence
  progress           Show local progress or explicitly request the observer
  needs-owner        Mark one active Task as awaiting an owner response
  resume-task        Clear a structured owner-response wait
  complete-task      Import a validated Stage result and close its Task(s)
  add-deviation      Append one scoped execution deviation
  close-stage        Prove and close a Stage's acceptance criteria
  amend              Apply an explicit owner amendment

Checks:
  verify             Verify SPEC and implementation locks
  verify-staged      Verify the staged mutation journal

Run planctl <command> --help for exact syntax and JSON contracts.
`;

const COMMAND_HELP: Readonly<Record<string, string>> = {
  init: `Usage: planctl init <plan.md> --title <text>

Creates the canonical SPEC_DRAFT skeleton and stages it. Commit it before
locking SPEC.
`,
  "set-spec": `Usage: planctl set-spec <plan.md> --from <spec.md>

Replaces only the marked SPEC in SPEC_DRAFT and stages the plan.
`,
  "approve-spec": `Usage: planctl approve-spec <plan.md> --owner-word <receipt>

Locks the exact SPEC bytes. Run only after explicit owner approval.
`,
  "put-delivery": `Usage: planctl put-delivery <plan.md> --from <delivery.json>

Delivery JSON uses the canonical plan-update DeliveryInput contract. IDs are
D1, D2, ...; a Delivery is one PR. Reusing an ID replaces its draft metadata
and preserves its existing Stage blocks.

"predictedExternalWaitMinutes" is the external wait forecast: minutes the
Delivery expects to wait on others — owner review rounds, CI runs, external
services — kept apart from active work. The active-work total and the longest
dependency path are derived from the Stages and rendered as one "Forecast:"
line under the Stage graph, recomputed on every put-stage, frozen by
approve-plan and compared against the Stage Results afterwards.

"description" is the pull request text as of the merge, in plain language:
what changed for people, what changed in the code, how it was proven, what is
not in this PR. Paragraphs separated by one blank line (\\n\\n in JSON). It
renders under the Stage graph. A Delivery without it is refused.

Complete delivery.json (copy this shape):
{
  "id": "D1",
  "title": "Reject overlapping scheduler work",
  "branch": "feat/scheduler-overlap",
  "depends": [],
  "gate": ["backend"],
  "active": true,
  "stageGraph": "D1-S1 -> D1-S2",
  "predictedExternalWaitMinutes": 45,
  "description": "What changed for people. A Stage that would write a file another running Stage owns is refused before it starts, so two agents never edit one file at once.\\n\\nWhat changed in the code. src/scheduler/parse-lanes.ts compares exact Stage writes before assignment.\\n\\nHow it was proven. test/scheduler/parse-lanes.test.ts feeds two ready Stages sharing src/shared.ts and sees the second refused.\\n\\nNot in this PR. Overlap detection across Deliveries."
}
`,
  "put-stage": `Usage: planctl put-stage <plan.md> --from <stage.json>

Add or replace a Stage while the plan is SPEC_LOCKED. Stage JSON is structured
input; planctl renders the Markdown. APPROVED plans remain immutable.

"description" is the Stage in plain language: what this Stage solves and why
now, what is built and where, how it is proven, and the commit message
(subject, then body). Paragraphs separated by one blank line (\\n\\n in
JSON). It renders between the forecast and the Tasks and is shown by
start-task. A Stage without it is refused.

Good Task in a complete stage.json (copy this shape):
{
  "id": "D1-S1",
  "deliveryId": "D1",
  "title": "Reject overlapping scheduler work",
  "owner": "agent-1",
  "profile": "fast",
  "depends": [],
  "parallelWith": [],
  "writes": ["src/scheduler/parse-lanes.ts", "test/scheduler/parse-lanes.test.ts"],
  "tempRoot": ".tmp/code-production/scheduler-overlap/D1-S1",
  "predictedActiveMinutes": 12,
  "verifyActiveMinutes": 2,
  "verifyCredits": 1,
  "predictedCredits": 3,
  "description": "What this Stage solves. Two ready Stages that both write src/shared.ts are assigned together today, and the second silently overwrites the first.\\n\\nWhat is built. src/scheduler/parse-lanes.ts compares exact Stage writes before assignment and refuses the second; test/scheduler/parse-lanes.test.ts carries the refusal case.\\n\\nHow it is proven. tst_scheduler_005 feeds two overlapping Stages and expects the refusal by name.\\n\\nCommit. fix(scheduler): refuse overlapping Stage writes — parse-lanes compares exact write sets before assignment; the overlap case is covered.",
  "tasks": [{
    "id": "PLANCTL_001",
    "story": "Reject overlapping Stage writes in src/scheduler/parse-lanes.ts and cover the refusal in test/scheduler/parse-lanes.test.ts.",
    "writes": ["src/scheduler/parse-lanes.ts", "test/scheduler/parse-lanes.test.ts"],
    "predictedActiveMinutes": 10,
    "predictedCredits": 2,
    "how": "change src/scheduler/parse-lanes.ts to compare exact Stage writes before assignment; add the overlap refusal case to test/scheduler/parse-lanes.test.ts",
    "red": "bun run agent:test:backend -- test/scheduler/parse-lanes.test.ts -t tst_scheduler_005"
  }],
  "criteria": ["\`bun run agent:test:backend -- test/scheduler/parse-lanes.test.ts\` exits 0 — overlap is rejected", "Commit"]
}

Bad Task (rejected):
{"id":"BAD_001","story":"Refactor scheduler","writes":[],"predictedActiveMinutes":0,"predictedCredits":0,"how":"","red":"echo done"}
`,
  "remove-stage": `Usage: planctl remove-stage <plan.md> --stage <D1-S1>

Removes one Stage while the plan is SPEC_LOCKED. APPROVED plans remain
immutable. Re-add or replace remaining Stage JSON before approve-plan.
`,
  "approve-plan": `Usage: planctl approve-plan <plan.md> --owner-word <receipt>

Locks the Delivery/Stage/Task contract after explicit owner approval.
`,
  "start-task": `Usage: planctl start-task <plan.md> --task <Task-ID> [--agent <codex:id|claude:id>] [--config <absolute.toml>]

Reads the Task from the committed or journal-verified staged APPROVED Markdown
source of truth, checks its Delivery and Stage dependencies, prints the exact
story/writes/forecast/How/RED contract, and stores only a Git-local start
receipt. It does not edit the plan. Run it before RED.
`,
  focus: `Usage: planctl focus <plan.md> [--task <Task-ID>] [--server] [--config <absolute.toml>]

Shows the locked Goal, current exact Task contract, next dependency-ready work,
progress/forecast and the evidence behind focused, unassigned, drifted or
owner-blocked status. Server comparison is attempted only with --server.
`,
  progress: `Usage: planctl progress <plan.md> [--server] [--config <absolute.toml>]

Without --server, reads only the canonical local plan. With --server, performs
one bounded authenticated read using the explicit/default machine config and
reports offline evidence without affecting local execution commands.
`,
  "needs-owner": `Usage: planctl needs-owner <plan.md> --task <Task-ID> --reason <safe-line>

Atomically records that an already-started Task needs one owner response.
Transcript punctuation is never interpreted as an owner obligation.
`,
  "resume-task": `Usage: planctl resume-task <plan.md> --task <Task-ID>

Atomically clears the Task's structured owner-response wait.
`,
  "complete-task": `Usage: planctl complete-task <plan.md> --from <stage-result.json>

Imports the canonical StageResultReceipt. It validates Task IDs, commit
ancestry and actual diff paths, declared tests, time/usage and temp cleanup.
Every addressed Task must have a start-task receipt; successful import consumes
those local timers, checks the Task boxes and appends Result rows.

Copy this stage-result.json shape after the work commit:
{
  "version": 1,
  "plan": "docs/plans/example.md",
  "deliveryId": "D1",
  "stageId": "D1-S1",
  "taskIds": ["PLANCTL_001"],
  "commit": "<work-commit-sha>",
  "startedAt": "<exact Started value from start-task>",
  "endedAt": "<UTC ISO timestamp>",
  "activeMinutes": 10,
  "elapsedMinutes": 12,
  "usage": {"kind":"unavailable","reason":"runner did not expose usage"},
  "paths": ["src/scheduler.ts", "test/scheduler.test.ts"],
  "tests": [{"id":"tst_scheduler_005","command":"bun run agent:test:backend -- test/scheduler.test.ts"}],
  "result": "Approved plan changes are rejected outside planctl.",
  "deviations": [],
  "tempRoots": [{"path":".tmp/code-production/scheduler-overlap/D1-S1","state":"absent"}]
}
`,
  "add-deviation": `Usage: planctl add-deviation <plan.md> --stage <D1-S1> --reason <text>

Appends a scoped deviation without changing approved Task meaning.
`,
  "close-stage": `Usage: planctl close-stage <plan.md> --stage <D1-S1>

Re-runs machinable criteria and closes only those proven on the current HEAD.
`,
  amend: `Usage: planctl amend <plan.md> --owner-word <receipt> --patch <patch.json>

Applies one exact owner-authorized replacement through the canonical writer.
`,
  verify: `Usage: planctl verify <plan.md>

Checks the canonical SPEC and implementation hashes. Exits non-zero on drift.
`,
  "verify-staged": `Usage: planctl verify-staged <plan.md>

Checks that staged plan bytes are exactly the script-produced journal head.
`,
  "clear-transaction": `Usage: planctl clear-transaction <plan.md> --commit <sha>

Internal post-commit cleanup for a spent mutation journal.
`,
  config: `Usage: planctl config <init|check> --role <machine|server> [--path <absolute.toml>]

init writes a commented template without inventing identity, endpoint or secret
values. check validates the strict role schema, absolute paths, endpoint safety
and mode-0600 secret files.
`,
};

interface CompletionHeader {
  readonly plan: string;
  readonly taskIds: readonly string[];
  readonly commit: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly elapsedMinutes: number;
}

const ENGINE_COMMANDS: Readonly<Record<string, string>> = {
  "approve-spec": "lock-spec",
  "put-delivery": "put-delivery",
  "put-stage": "put-stage",
  "remove-stage": "remove-stage",
  "approve-plan": "approve",
  "complete-task": "record-result",
  "add-deviation": "deviate",
  "close-stage": "close",
  amend: "amend",
  "verify-staged": "verify-staged",
  "clear-transaction": "clear-spent",
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function flag(args: readonly string[], name: string): string {
  const at = args.indexOf(name);
  const value = at === -1 ? undefined : args[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}

function optionalFlag(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  if (at === -1) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function root(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

function git(rootPath: string, ...args: readonly string[]): string {
  return execFileSync("git", ["-C", rootPath, ...args], { encoding: "utf8" }).trim();
}

function addressedPath(rootPath: string, input: string): { readonly absolute: string; readonly relative: string } {
  const absolute = resolve(rootPath, input);
  const repoRelative = relative(rootPath, absolute);
  if (repoRelative === "" || repoRelative === ".." || repoRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    || isAbsolute(repoRelative)) {
    throw new Error("plan must be a file inside the repository");
  }
  return { absolute, relative: repoRelative };
}

function atomicWrite(path: string, body: string): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const temporary = mkdtempSync(join(parent, ".planctl-"));
  const candidate = join(temporary, "plan.md");
  try {
    writeFileSync(candidate, body);
    renameSync(candidate, path);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function stage(rootPath: string, path: string): void {
  execFileSync("git", ["-C", rootPath, "add", "--", path]);
}

function taskRunPath(rootPath: string, plan: string, taskId: string): string {
  const common = git(rootPath, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const planKey = createHash("sha256").update(plan).digest("hex").slice(0, 12);
  return join(common, "planctl", "task-runs", `${planKey}-${taskId}.json`);
}

function writeTaskRun(path: string, run: TaskRun): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const temporary = mkdtempSync(join(parent, ".task-run-"));
  const candidate = join(temporary, "receipt.json");
  try {
    writeFileSync(candidate, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 });
    renameSync(candidate, path);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function gitCommonDir(rootPath: string): string {
  return git(rootPath, "rev-parse", "--path-format=absolute", "--git-common-dir");
}

function legacyTaskRunFrom(value: unknown): TaskRunV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Task start receipt is invalid");
  const record = value as Readonly<Record<string, unknown>>;
  if (record.version !== 1 || typeof record.plan !== "string" || typeof record.deliveryId !== "string"
    || typeof record.stageId !== "string" || typeof record.taskId !== "string"
    || typeof record.startedAt !== "string" || typeof record.baseHead !== "string") {
    throw new Error("Task start receipt has an unsupported shape");
  }
  return {
    version: 1,
    plan: record.plan,
    deliveryId: record.deliveryId,
    stageId: record.stageId,
    taskId: record.taskId,
    startedAt: record.startedAt,
    baseHead: record.baseHead,
  };
}

async function taskRunFrom(value: unknown): Promise<TaskRun> {
  if (basename(import.meta.dir) !== "cli") return legacyTaskRunFrom(value);
  const runtime = await import("../core/task-run");
  return runtime.decodeTaskRun(value);
}

function printTaskStart(brief: TaskExecutionBrief, run: TaskRun): void {
  const distributed = run.version === 1
    ? "unavailable (TaskRunV1)"
    : `TaskRunV2 ${run.machineId} / ${run.agentId} / ${run.repositoryId}`;
  console.log([
    `Task ${brief.id} STARTED`,
    `Source: ${run.plan}`,
    `Distributed correlation: ${distributed}`,
    `Delivery / Stage: ${brief.deliveryId} / ${brief.stageId} — ${brief.stageTitle}`,
    `Stage description: ${brief.stageDescription}`,
    `Owner / Profile: ${brief.owner} / ${brief.profile}`,
    `Started: ${run.startedAt}`,
    `Base: ${run.baseHead}`,
    `Forecast: ${brief.predictedActiveMinutes} active min / ${brief.predictedCredits} credits`,
    `Writes: ${brief.writes.join(", ")}`,
    `Temp root: ${brief.tempRoot} (clean before completion)`,
    `Story: ${brief.story}`,
    `How: ${brief.how}`,
    `RED: ${brief.red}`,
  ].join("\n"));
}

interface ApprovedPlanRead {
  readonly rootPath: string;
  readonly target: { readonly absolute: string; readonly relative: string };
  readonly body: string;
}

function approvedPlan(args: readonly string[]): ApprovedPlanRead {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const rootPath = root();
  const target = addressedPath(rootPath, plan);
  const body = readFileSync(target.absolute, "utf8");
  const committed = execFileSync("git", ["-C", rootPath, "show", `HEAD:${target.relative}`], { encoding: "utf8" });
  if (body !== committed) {
    try {
      verifyStagedPlan(target.relative);
    } catch {
      throw new Error("start-task requires a committed plan or a journal-verified staged result");
    }
  }
  const violations = protocolLockViolations(body);
  if (violations.length > 0) throw new Error(violations.join("; "));
  return { rootPath, target, body };
}

function dedicatedRuntime(): void {
  if (basename(import.meta.dir) !== "cli") throw new Error("command requires the dedicated planctl package");
}

async function ownerWaitRuntime(): Promise<typeof import("../core/task-run")> {
  dedicatedRuntime();
  return import("../core/task-run");
}

async function accountAndClearOwnerWait(
  rootPath: string,
  plan: string,
  taskId: string,
  run: TaskRun,
  resumedAt: string,
): Promise<{ readonly run: TaskRun; readonly marker: OwnerWaitMarker | null }> {
  if (basename(import.meta.dir) !== "cli") return { run, marker: null };
  const runtime = await ownerWaitRuntime();
  const waitPath = runtime.ownerWaitPath(gitCommonDir(rootPath), plan, taskId);
  const marker = runtime.readOwnerWait(waitPath);
  if (marker === null) return { run, marker: null };
  const updated = runtime.accountOwnerWait(run, marker, resumedAt);
  if (updated.version === 2) writeTaskRun(taskRunPath(rootPath, plan, taskId), updated);
  runtime.clearOwnerWait(waitPath);
  return { run: updated, marker };
}

async function startTask(args: readonly string[]): Promise<void> {
  const { rootPath, target, body } = approvedPlan(args);
  const brief = taskExecutionBrief(body, flag(args, "--task"));
  const path = taskRunPath(rootPath, target.relative, brief.id);
  if (existsSync(path)) {
    const existing = await taskRunFrom(JSON.parse(readFileSync(path, "utf8")) as unknown);
    if (existing.plan !== target.relative || existing.taskId !== brief.id || existing.stageId !== brief.stageId) {
      throw new Error(`Task ${brief.id} has a conflicting start receipt`);
    }
    if (spawnSync("git", ["-C", rootPath, "merge-base", "--is-ancestor", existing.baseHead, "HEAD"]).status !== 0) {
      throw new Error(`Task ${brief.id} start base is not ancestral to HEAD`);
    }
    let run = existing.version === 1
      ? await distributedTaskRun(args, rootPath, target.relative, body, existing)
      : existing;
    run = (await accountAndClearOwnerWait(
      rootPath,
      target.relative,
      brief.id,
      run,
      new Date().toISOString(),
    )).run;
    writeTaskRun(path, run);
    printTaskStart(brief, run);
    return;
  }
  const legacy: TaskRunV1 = {
    version: 1,
    plan: target.relative,
    deliveryId: brief.deliveryId,
    stageId: brief.stageId,
    taskId: brief.id,
    startedAt: new Date().toISOString(),
    baseHead: git(rootPath, "rev-parse", "HEAD"),
  };
  let run = await distributedTaskRun(args, rootPath, target.relative, body, legacy);
  run = (await accountAndClearOwnerWait(
    rootPath,
    target.relative,
    brief.id,
    run,
    new Date().toISOString(),
  )).run;
  writeTaskRun(path, run);
  printTaskStart(brief, run);
}

function explicitAgentId(args: readonly string[]): string | null {
  const flagged = optionalFlag(args, "--agent");
  if (flagged !== undefined) return flagged;
  const codex = process.env.CODEX_SESSION_ID ?? process.env.CODEX_THREAD_ID;
  if (codex !== undefined && codex !== "") return `codex:${codex}`;
  const claude = process.env.CLAUDE_SESSION_ID;
  return claude === undefined || claude === "" ? null : `claude:${claude}`;
}

async function repositoryIdentity(
  rootPath: string,
  repositoryIds: Readonly<Record<string, string>>,
): Promise<GitWorktreeIdentity> {
  const common = gitCommonDir(rootPath);
  const repositoryRoot = basename(common) === ".git" ? dirname(common) : rootPath;
  const discoveryRuntime = await import("../machine/discovery/git-worktree.source");
  const discovery = discoveryRuntime.discoverGitWorktrees([repositoryRoot], repositoryIds);
  const identity = discovery.worktrees.find(
    (worktree: GitWorktreeIdentity) => resolve(worktree.path) === resolve(rootPath),
  );
  if (identity !== undefined) return identity;
  throw new Error(discovery.issues[0]?.message ?? `worktree ${rootPath} was not discovered`);
}

async function distributedTaskRun(
  args: readonly string[],
  rootPath: string,
  plan: string,
  body: string,
  legacy: TaskRunV1,
): Promise<TaskRun> {
  if (basename(import.meta.dir) !== "cli") return legacy;
  const agentId = explicitAgentId(args);
  if (agentId === null) return legacy;
  const configRuntime = await import("../config/config");
  const configPath = optionalFlag(args, "--config") ?? configRuntime.defaultPlanctlConfigPath("machine");
  if (!existsSync(configPath)) {
    if (args.includes("--agent") || args.includes("--config")) {
      throw new Error(`distributed start-task configuration does not exist: ${configPath}`);
    }
    return legacy;
  }
  const config = configRuntime.loadPlanctlConfig(configPath, "machine");
  if (config.role !== "machine") throw new Error("start-task configuration has the wrong role");
  let identity: GitWorktreeIdentity;
  try {
    identity = await repositoryIdentity(rootPath, config.repositoryIds);
  } catch (error: unknown) {
    if (!args.includes("--agent") && !args.includes("--config")) return legacy;
    throw new Error(`distributed start-task has no repository identity: ${message(error)}`);
  }
  if (identity.branch === "(detached)") throw new Error("distributed start-task requires a named branch");
  const candidate: TaskRun = {
    ...legacy,
    version: 2,
    machineId: config.machineId,
    agentId,
    repositoryId: identity.repositoryId,
    worktree: rootPath,
    branch: identity.branch,
    planRevision: protocolImplementationHash(body),
    ownerWait: null,
    accumulatedOwnerWaitSeconds: 0,
    lastAccountedOwnerWaitStartedAt: null,
  };
  const taskRuntime = await import("../core/task-run");
  return taskRuntime.decodeTaskRun(candidate);
}

function planGoal(body: string): string {
  const spec = body.match(/<!-- plan:spec:start -->[\s\S]*?## The Goal\n\n([\s\S]*?)(?=\n## |\n<!-- plan:spec:end -->)/);
  const value = spec?.[1]?.split("\n").map((line) => line.trim().replace(/^- /, "")).filter((line) => line !== "").join(" ");
  if (value === undefined || value === "") throw new Error("plan SPEC has no Goal");
  return value;
}

function readyTaskIds(body: string, currentTaskId?: string): readonly string[] {
  const deliveries: readonly DeliveryMeta[] = deliveryMetas(body);
  const activeDelivery = deliveries.find((delivery) => delivery.active);
  if (activeDelivery === undefined) throw new Error("plan has no active Delivery");
  const stages: readonly ParsedStageInput[] = stageInputs(body).filter(
    (stage: ParsedStageInput) => stage.deliveryId === activeDelivery.id,
  );
  const completedStages = new Set(stages.filter((stage) => stage.tasks.every((task) => task.completed)).map((stage) => stage.id));
  return stages
    .filter((stage) => stage.depends.every((dependency) => completedStages.has(dependency)))
    .flatMap((stage) => stage.tasks.filter((task) => !task.completed && task.id !== currentTaskId).map((task) => task.id));
}

async function existingTaskRun(rootPath: string, plan: string, taskId: string): Promise<TaskRun | null> {
  const path = taskRunPath(rootPath, plan, taskId);
  if (!existsSync(path)) return null;
  return await taskRunFrom(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

interface MachineServerSettings {
  readonly machineId: string;
  readonly url: string;
  readonly token: string;
  readonly connectTimeoutMs: number;
  readonly requestTimeoutMs: number;
  readonly repositoryIds: Readonly<Record<string, string>>;
}

async function machineServerSettings(args: readonly string[]): Promise<MachineServerSettings> {
  dedicatedRuntime();
  const config = await import("../config/config");
  const path = optionalFlag(args, "--config") ?? config.defaultPlanctlConfigPath("machine");
  if (!isAbsolute(path)) throw new Error("machine config path must be absolute");
  const loaded = config.loadPlanctlConfig(path, "machine");
  if (loaded.role !== "machine") throw new Error("machine config has the wrong role");
  const token = readFileSync(loaded.server.tokenFile, "utf8").trim();
  if (token === "") throw new Error("machine server token file is empty");
  return {
    machineId: loaded.machineId,
    url: loaded.server.url,
    token,
    connectTimeoutMs: loaded.server.connectTimeoutMs,
    requestTimeoutMs: loaded.server.requestTimeoutMs,
    repositoryIds: loaded.repositoryIds,
  };
}

function serverPlanStatus(attention: { readonly ownerWait: number; readonly stale: number; readonly unassigned: number }): string {
  if (attention.ownerWait > 0) return "awaiting_owner";
  if (attention.stale > 0) return "stale";
  if (attention.unassigned > 0) return "unassigned";
  return "working";
}

async function serverProgress(args: readonly string[]): Promise<{
  readonly settings: MachineServerSettings;
  readonly response: Awaited<ReturnType<typeof import("./server-client")["readServerProgress"]>>;
}> {
  const settings = await machineServerSettings(args);
  const client = await import("./server-client");
  const response = await client.readServerProgress({
    baseUrl: settings.url,
    machineId: settings.machineId,
    token: settings.token,
    connectTimeoutMs: settings.connectTimeoutMs,
    requestTimeoutMs: settings.requestTimeoutMs,
    fetch,
  });
  return { settings, response };
}

async function focus(args: readonly string[]): Promise<void> {
  dedicatedRuntime();
  const { rootPath, target, body } = approvedPlan(args);
  const taskId = optionalFlag(args, "--task");
  const brief = taskId === undefined ? null : taskExecutionBrief(body, taskId);
  const run = taskId === undefined ? null : await existingTaskRun(rootPath, target.relative, taskId);
  const waits = await ownerWaitRuntime();
  const wait = taskId === undefined
    ? null
    : waits.readOwnerWait(waits.ownerWaitPath(gitCommonDir(rootPath), target.relative, taskId));
  const runIsAncestral = run === null
    ? false
    : spawnSync("git", ["-C", rootPath, "merge-base", "--is-ancestor", run.baseHead, "HEAD"]).status === 0;
  const status: FocusView["status"] = brief === null || run === null
    ? "unassigned"
    : !runIsAncestral
      ? "plan_drift"
      : wait === null ? "focused" : "awaiting_owner";
  const evidence = brief === null
    ? "no Task was selected and no TaskRun receipt was addressed"
    : run === null
      ? `Task ${brief.id} has no TaskRun receipt; run start-task before RED`
      : !runIsAncestral
        ? `TaskRun base ${run.baseHead} is not ancestral to HEAD`
        : wait === null
          ? `TaskRun receipt matches HEAD ancestry and locked revision ${protocolImplementationHash(body)}`
          : `structured owner-wait receipt started at ${wait.startedAt}`;
  const now = new Date();
  const analytics = await Promise.all([
    import("../core/plan-progress"),
    import("../core/delivery-forecast"),
    import("./render"),
  ]);
  const progress = analytics[0].projectPlanProgress(body);
  const activeTasks = brief === null || run === null || !runIsAncestral
    ? []
    : [{
      taskId: brief.id,
      state: wait === null ? "working" as const : "awaiting_owner" as const,
      elapsedActiveMinutes: Math.max(0, (now.getTime() - Date.parse(run.startedAt)) / 60_000),
    }];
  const forecast = analytics[1].forecastDelivery(body, {
    now: now.toISOString(),
    activeTasks,
    completedTaskSamples: [],
  });
  let view: FocusView = {
    source: `local plan ${target.relative}`,
    status,
    evidence,
    goal: planGoal(body),
    currentTask: brief === null ? null : {
      id: brief.id,
      story: brief.story,
      writes: brief.writes,
      how: brief.how,
      red: brief.red,
    },
    nextReadyTaskIds: readyTaskIds(body, brief?.id),
    completionPercent: progress.completionPercent,
    completedTasks: progress.tasks.completed,
    totalTasks: progress.tasks.total,
    remainingActiveMinutes: forecast.remainingActiveMinutes,
    criticalPathMinutes: forecast.calibratedCriticalPathMinutes,
    estimatedDeliveryAt: forecast.estimatedDeliveryAt,
    ownerWaitReason: wait?.reason ?? null,
  };
  if (args.includes("--server")) {
    try {
      const remote = await serverProgress(args);
      const identity = await repositoryIdentity(rootPath, remote.settings.repositoryIds);
      const planId = `${identity.repositoryId}:${target.relative}`;
      const serverPlan = remote.response.plans.find((plan) => plan.planId === planId);
      if (serverPlan === undefined) throw new Error(`server has no progress for ${planId}`);
      const localRevision = protocolImplementationHash(body);
      view = serverPlan.planRevision === localRevision
        ? { ...view, source: `server ${remote.settings.url} at ${remote.response.generatedAt}; local plan ${target.relative}` }
        : {
          ...view,
          source: `server ${remote.settings.url} at ${remote.response.generatedAt}; local plan ${target.relative}`,
          status: "plan_drift",
          evidence: `local revision ${localRevision} differs from server revision ${serverPlan.planRevision}`,
        };
    } catch (error: unknown) {
      view = {
        ...view,
        source: `local plan ${target.relative}; server offline`,
        evidence: `server read unavailable (${message(error)}); local evidence: ${view.evidence}`,
      };
    }
  }
  console.log(analytics[2].renderFocus(view));
}

async function progress(args: readonly string[]): Promise<void> {
  dedicatedRuntime();
  const { target, body } = approvedPlan(args);
  const render = await import("./render");
  if (args.includes("--server")) {
    try {
      const remote = await serverProgress(args);
      const plans: readonly ProgressPlanView[] = remote.response.plans.map((plan) => ({
        planId: plan.planId,
        status: serverPlanStatus(plan.attention),
        completionPercent: plan.completionPercent,
        completedTasks: plan.tasks.completed,
        totalTasks: plan.tasks.total,
        remainingActiveMinutes: plan.remainingActiveMinutes,
        criticalPathMinutes: plan.calibratedCriticalPathMinutes,
        estimatedDeliveryAt: plan.estimatedDeliveryAt,
      }));
      console.log(render.renderProgress({
        source: `server ${remote.settings.url}`,
        status: "available",
        evidence: `observer generated this read model at ${remote.response.generatedAt}`,
        plans,
      }));
    } catch (error: unknown) {
      console.log(render.renderProgress({
        source: "explicit observer request",
        status: "offline",
        evidence: message(error),
        plans: [],
      }));
    }
    return;
  }
  const progressCore = await import("../core/plan-progress");
  const forecastCore = await import("../core/delivery-forecast");
  const projected = progressCore.projectPlanProgress(body);
  const forecast = forecastCore.forecastDelivery(body, {
    now: new Date().toISOString(),
    activeTasks: [],
    completedTaskSamples: [],
  });
  console.log(render.renderProgress({
    source: `local plan ${target.relative}`,
    status: "available",
    evidence: `locked implementation revision ${protocolImplementationHash(body)}`,
    plans: [{
      planId: target.relative,
      status: "local",
      completionPercent: projected.completionPercent,
      completedTasks: projected.tasks.completed,
      totalTasks: projected.tasks.total,
      remainingActiveMinutes: forecast.remainingActiveMinutes,
      criticalPathMinutes: forecast.calibratedCriticalPathMinutes,
      estimatedDeliveryAt: forecast.estimatedDeliveryAt,
    }],
  }));
}

async function needsOwner(args: readonly string[]): Promise<void> {
  const { rootPath, target, body } = approvedPlan(args);
  const taskId = flag(args, "--task");
  const brief = taskExecutionBrief(body, taskId);
  const run = await existingTaskRun(rootPath, target.relative, taskId);
  if (run === null) throw new Error(`Task ${taskId} has no start receipt; run planctl start-task first`);
  if (spawnSync("git", ["-C", rootPath, "merge-base", "--is-ancestor", run.baseHead, "HEAD"]).status !== 0) {
    throw new Error(`Task ${taskId} start base is not ancestral to HEAD`);
  }
  const waits = await ownerWaitRuntime();
  const receipt = waits.markOwnerWait(waits.ownerWaitPath(gitCommonDir(rootPath), target.relative, taskId), {
    plan: target.relative,
    taskId: brief.id,
    reason: flag(args, "--reason"),
    startedAt: new Date().toISOString(),
  });
  console.log(`Task ${taskId} AWAITING OWNER\nReason: ${receipt.reason}\nStarted: ${receipt.startedAt}`);
}

async function resumeTask(args: readonly string[]): Promise<void> {
  const { rootPath, target, body } = approvedPlan(args);
  const taskId = flag(args, "--task");
  taskExecutionBrief(body, taskId);
  const run = await existingTaskRun(rootPath, target.relative, taskId);
  if (run === null) throw new Error(`Task ${taskId} has no start receipt; run start-task first`);
  const resumed = await accountAndClearOwnerWait(
    rootPath,
    target.relative,
    taskId,
    run,
    new Date().toISOString(),
  );
  if (resumed.marker === null) throw new Error(`Task ${taskId} has no structured owner wait`);
  console.log(`Task ${taskId} RESUMED\nCleared owner wait: ${resumed.marker.reason}`);
}

function completionHeader(value: unknown): CompletionHeader {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Stage result must be an object");
  const record = value as Readonly<Record<string, unknown>>;
  if (typeof record.plan !== "string" || !Array.isArray(record.taskIds)
    || !record.taskIds.every((id) => typeof id === "string") || record.taskIds.length === 0
    || typeof record.commit !== "string" || typeof record.startedAt !== "string"
    || typeof record.endedAt !== "string" || typeof record.elapsedMinutes !== "number") {
    throw new Error("Stage result timing header is invalid");
  }
  return {
    plan: record.plan,
    taskIds: record.taskIds,
    commit: record.commit,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    elapsedMinutes: record.elapsedMinutes,
  };
}

async function completeTask(args: readonly string[]): Promise<number> {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const rootPath = root();
  const target = addressedPath(rootPath, plan);
  const receipt = completionHeader(JSON.parse(readFileSync(resolve(rootPath, flag(args, "--from")), "utf8")) as unknown);
  if (receipt.plan !== target.relative) throw new Error(`Stage result names ${receipt.plan}, expected ${target.relative}`);
  const runs = await Promise.all(receipt.taskIds.map(async (taskId) => {
    const path = taskRunPath(rootPath, target.relative, taskId);
    if (!existsSync(path)) throw new Error(`Task ${taskId} has no start receipt; run planctl start-task first`);
    return { path, run: await taskRunFrom(JSON.parse(readFileSync(path, "utf8")) as unknown) };
  }));
  const earliest = runs.reduce((value, entry) => entry.run.startedAt < value ? entry.run.startedAt : value, runs[0]?.run.startedAt ?? "");
  if (receipt.startedAt !== earliest) throw new Error(`Stage result startedAt must equal the earliest start-task receipt (${earliest})`);
  const startedMs = Date.parse(receipt.startedAt);
  const endedMs = Date.parse(receipt.endedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs < startedMs) {
    throw new Error("Stage result UTC interval is invalid");
  }
  const measuredMinutes = (endedMs - startedMs) / 60_000;
  if (Math.abs(receipt.elapsedMinutes - measuredMinutes) > 1) {
    throw new Error(`Stage result elapsedMinutes differs from its UTC interval (${measuredMinutes.toFixed(2)} min)`);
  }
  for (const { run } of runs) {
    if (run.plan !== target.relative || run.taskId === "" || !receipt.taskIds.includes(run.taskId)) {
      throw new Error("Task start receipt does not match the Stage result");
    }
    if (spawnSync("git", ["-C", rootPath, "merge-base", "--is-ancestor", run.baseHead, receipt.commit]).status !== 0) {
      throw new Error(`Task ${run.taskId} result commit does not descend from its start base`);
    }
  }
  const status = runEngine(args, "record-result");
  if (status === 0) for (const { path } of runs) unlinkSync(path);
  return status;
}

function init(args: readonly string[]): void {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const rootPath = root();
  const target = addressedPath(rootPath, plan);
  if (existsSync(target.absolute)) throw new Error(`plan already exists: ${target.relative}`);
  atomicWrite(target.absolute, createDraftPlan(flag(args, "--title")));
  stage(rootPath, target.relative);
}

function setSpec(args: readonly string[]): void {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const rootPath = root();
  const target = addressedPath(rootPath, plan);
  const spec = readFileSync(resolve(rootPath, flag(args, "--from")), "utf8");
  const changed = replaceDraftSpec(readFileSync(target.absolute, "utf8"), spec);
  atomicWrite(target.absolute, changed.body);
  stage(rootPath, target.relative);
}

async function configCommand(args: readonly string[]): Promise<void> {
  if (basename(import.meta.dir) !== "cli") throw new Error("config commands require the dedicated planctl package");
  const action = args[1];
  if (action !== "init" && action !== "check") throw new Error("config action must be init or check");
  const role = flag(args, "--role");
  if (role !== "machine" && role !== "server") throw new Error("--role must be machine or server");
  const { defaultPlanctlConfigPath, loadPlanctlConfig, planctlConfigTemplate } = await import("../config/config");
  const path = optionalFlag(args, "--path") ?? defaultPlanctlConfigPath(role);
  if (!isAbsolute(path)) throw new Error("config path must be absolute");
  if (action === "init") {
    if (existsSync(path)) throw new Error(`refusing to overwrite existing config: ${path}`);
    atomicWrite(path, planctlConfigTemplate(role));
    console.log(`planctl: wrote ${role} config template — ${path}`);
    return;
  }
  loadPlanctlConfig(path, role);
  console.log(`planctl: ${role} config OK — ${path}`);
}

function verify(args: readonly string[]): void {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const body = readFileSync(resolve(root(), plan), "utf8");
  const violations = protocolLockViolations(body);
  if (violations.length > 0) throw new Error(violations.join("; "));
  console.log("planctl: locks verified");
}

function runEngine(args: readonly string[], engineCommand: string): number {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const result = spawnSync("bun", [PLAN_UPDATE_FILE, plan, engineCommand, ...args.slice(2)], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  return result.status ?? 1;
}

async function run(args: readonly string[]): Promise<number> {
  const command = args[0];
  if (command === undefined || command === "--help" || command === "-h") {
    console.log(GENERAL_HELP);
    return 0;
  }
  if (args.includes("--help") || args.includes("-h")) {
    const help = COMMAND_HELP[command];
    if (help === undefined) throw new Error(`unknown command ${command}`);
    console.log(help);
    return 0;
  }
  if (command === "init") {
    init(args);
    return 0;
  }
  if (command === "set-spec") {
    setSpec(args);
    return 0;
  }
  if (command === "config") {
    await configCommand(args);
    return 0;
  }
  if (command === "verify") {
    verify(args);
    return 0;
  }
  if (command === "start-task") {
    await startTask(args);
    return 0;
  }
  if (command === "focus") {
    await focus(args);
    return 0;
  }
  if (command === "progress") {
    await progress(args);
    return 0;
  }
  if (command === "needs-owner") {
    await needsOwner(args);
    return 0;
  }
  if (command === "resume-task") {
    await resumeTask(args);
    return 0;
  }
  if (command === "complete-task") return await completeTask(args);
  const engineCommand = ENGINE_COMMANDS[command];
  if (engineCommand === undefined) throw new Error(`unknown command ${command}; run planctl --help`);
  return runEngine(args, engineCommand);
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error: unknown) {
  console.error(`planctl: ${message(error)}`);
  process.exitCode = 1;
}
