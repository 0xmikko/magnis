#!/usr/bin/env bun

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { AuthoringContract } from "../core/plan-gate";
import type { TaskBrief } from "../core/plan-update";
import type { OwnerWaitReceipt, TaskRun, TaskRunIdentity, TaskRunV1 } from "../core/task-run";
import type { GitWorktreeIdentity } from "../machine/sessions/session-source";
import type { ProgressPlanView } from "./render";

function portableRuntimeFile(name: "plan-gate.ts" | "plan-update.ts" | "retro-register.ts"): string {
  const layout = basename(import.meta.dir);
  const runtimeName = import.meta.path.endsWith(".js") ? name.replace(/\.ts$/, ".js") : name;
  if (layout === "cli") return resolve(import.meta.dir, "../core", runtimeName);
  if (layout === "runtime") return resolve(import.meta.dir, runtimeName);
  throw new Error(`unsupported planctl runtime layout: ${import.meta.dir}`);
}

const PLAN_UPDATE_FILE = portableRuntimeFile("plan-update.ts");
const {
  completeTask: completeTaskOperation,
  initPlan,
  mutatePlanFile,
  needsOwner: needsOwnerOperation,
  replaceDraftSpec,
  resumeTask: resumeTaskOperation,
  startTask: startTaskOperation,
  taskRunPath,
  verifyStagedPlan,
} = await import(PLAN_UPDATE_FILE);
const { authoringContract, protocolImplementationHash, protocolLockViolations } = await import(portableRuntimeFile("plan-gate.ts"));

const GENERAL_HELP = `Usage: planctl <command> [arguments]

Small agent-facing CLI over one canonical writer: plan-update.
Plans are authored and advanced by commands; approved plan bytes are never
edited directly.

Authoring:
  init               Create and stage a SPEC_DRAFT plan
  mcp                Serve the tools over stdio for Claude and Codex
  stats              The five tables from ~/.local/share/planctl/events.jsonl
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
  progress           Show local progress or explicitly request the observer
  needs-owner        Mark one active Task as awaiting an owner response
  resume-task        Clear a structured owner-response wait
  complete-task      Import a validated Stage result and close its Task(s)
  add-deviation      Append one scoped execution deviation
  approve-stage      Journal the owner's word on one Stage
  stage-approved     Exit 0 only if the owner's word on that Stage is journaled
  retro-status       Exit 0 only if the last retro experiment carries the owner's status
  close-stage        Prove and close a Stage's acceptance criteria
  amend              Apply an explicit owner amendment

Checks:
  verify             Verify SPEC and implementation locks
  verify-staged      Verify the staged mutation journal

Run planctl <command> --help for exact syntax and JSON contracts.
`;

const COMMAND_HELP: Readonly<Record<string, string>> = {
  init: `Usage: planctl init [<plan.md>] --title <text>

Creates docs/plans/<date>-<slug>.md from the branch (or the named file),
stages it, journals it, and prints the authoring contract: the sections,
the vocabulary pairs and the Goal rule. Refuses the integration branch and
a missing code-production.base. Commit the plan before locking SPEC.
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
  "start-task": `Usage: planctl start-task <plan.md> [--task <Task-ID>] [--checkpoint <one line>] [--agent <codex:id|claude:id>] [--config <absolute.toml>]

"What do I do now." Without --task: the Task already running in this
worktree, else the next open one in Stage-graph order, else the first Task
of a child Delivery whose parents have a green PR on their current head.
With --task: that Task, also a completed one of an unmerged Delivery, for
repair. --checkpoint saves one line on the start record. Prints the plan,
the Goal and the Task's scope; keeps one Git-local clock per Task.
`,
  progress: `Usage: planctl progress [<plan.md>] [--root <dir>] [--note] [--server]

"Where am I." Without a plan, finds docs/plans/*-<slug>.md from the branch
of the root and answers nothing when the branch has none. Shows the Goal,
the running Task, the active Delivery beside the whole plan, the PR and CI
gh observes, and the installed runtime against the source. --note prints
one line for a running Task, or nothing. --server reads the observer.
`,
  "needs-owner": `Usage: planctl needs-owner <plan.md> --task <Task-ID> --context <text> --option "<label>: <consequence>" [--option ...] --recommendation <text> --answer <form>

Records that a started Task needs one owner answer, as a form: what this is
about, the options with their consequences, the recommendation, the form
of the answer. Transcript punctuation is never an owner obligation.
`,
  "resume-task": `Usage: planctl resume-task <plan.md> --task <Task-ID>

Clears the Task's owner wait and accounts its duration; without a wait,
nothing changes.
`,
  "complete-task": `Usage: planctl complete-task <plan.md> --task <ID[,ID]> --commit <sha> --result <sentence> [--deviation <text>]
       planctl complete-task <plan.md> --from <stage-result.json>

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
  "approve-stage": `Usage: planctl approve-stage <plan.md> --stage <D1-S1> --owner-word <word>

Appends the owner's word on that Stage to the Execution log. Run it only with
the owner's actual word, after the owner read what the Stage produced.
`,
  "stage-approved": `Usage: planctl stage-approved <plan.md> --stage <D1-S1>

Exits 0 when the Execution log carries an approve-stage line for that Stage,
1 otherwise. A Stage criterion can require it: \`planctl stage-approved <plan> --stage <id>\` exits 0.
`,
  "retro-status": `Usage: planctl retro-status [--law <development-process.md>]

Reads the "Register of experiments" table at the end of the process law and
exits 0 when its last row carries the owner's status (accepted or declined),
1 while it has none. end-work runs it before closing a Delivery. The law
defaults to shared/code-production/laws/development-process.md, then
docs/development-process.md, from the repository root.
`,
  "close-stage": `Usage: planctl close-stage <plan.md> --stage <D1-S1>

Re-runs machinable criteria and closes only those proven on the current HEAD.
`,
  amend: `Usage: planctl amend <plan.md> --owner-word <receipt> --patch <patch.json>

Applies one exact owner-authorized replacement through the canonical writer.
SPEC corrections are accepted in SPEC_LOCKED without approving implementation.
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
  "approve-stage": "approve-stage",
  "stage-approved": "stage-approved",
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
      verifyStagedPlan(rootPath, target.relative);
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



function explicitAgentId(args: readonly string[]): string | null {
  const flagged = optionalFlag(args, "--agent");
  if (flagged !== undefined) return flagged;
  const codex = process.env.CODEX_SESSION_ID ?? process.env.CODEX_THREAD_ID;
  if (codex !== undefined && codex !== "") return `codex:${codex}`;
  const claude = process.env.CLAUDE_SESSION_ID;
  return claude === undefined || claude === "" ? null : `claude:${claude}`;
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

async function progress(args: readonly string[]): Promise<void> {
  dedicatedRuntime();
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
  const rootPath = args.includes("--root") ? resolve(flag(args, "--root")) : root();
  const explicit = args[1] !== undefined && !args[1].startsWith("--") ? addressedPath(rootPath, args[1]).relative : null;
  const progressCore = await import("../core/plan-progress");
  const view = await progressCore.planProgress(rootPath, {
    plan: explicit,
    publication: (branch) => readPublication(rootPath, branch),
    sourceCommit: git(dirname(import.meta.path), "rev-parse", "HEAD"),
    decodeRun: taskRunFrom,
  });
  if (args.includes("--note")) {
    const note = progressCore.progressNote(view);
    if (note !== null) console.log(note);
    return;
  }
  if (view === null) return;
  console.log(render.renderProgressView(view));

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

/** The observer identity a start record carries when observer configuration exists; null in a plain clone. */
async function observerIdentity(args: readonly string[], rootPath: string, body: string): Promise<TaskRunIdentity | null> {
  if (basename(import.meta.dir) !== "cli") return null;
  const agentId = explicitAgentId(args);
  if (agentId === null) return null;
  const configRuntime = await import("../config/config");
  const configPath = optionalFlag(args, "--config") ?? configRuntime.defaultPlanctlConfigPath("machine");
  if (!existsSync(configPath)) {
    if (args.includes("--agent") || args.includes("--config")) {
      throw new Error(`distributed start-task configuration does not exist: ${configPath}`);
    }
    return null;
  }
  const config = configRuntime.loadPlanctlConfig(configPath, "machine");
  if (config.role !== "machine") throw new Error("start-task configuration has the wrong role");
  let identity: GitWorktreeIdentity;
  try {
    identity = await repositoryIdentity(rootPath, config.repositoryIds);
  } catch (error: unknown) {
    if (!args.includes("--agent") && !args.includes("--config")) return null;
    throw new Error(`distributed start-task has no repository identity: ${message(error)}`);
  }
  if (identity.branch === "(detached)") throw new Error("distributed start-task requires a named branch");
  return { machineId: config.machineId, agentId, repositoryId: identity.repositoryId, planRevision: protocolImplementationHash(body) };
}

async function startTask(args: readonly string[]): Promise<void> {
  const { rootPath, target, body } = approvedPlan(args);
  const identity = await observerIdentity(args, rootPath, body);
  const brief: TaskBrief = await startTaskOperation(rootPath, {
    plan: target.relative,
    taskId: optionalFlag(args, "--task") ?? null,
    checkpoint: optionalFlag(args, "--checkpoint") ?? null,
    identity,
    publication: (branch: string) => readPublication(rootPath, branch),
    decodeRun: taskRunFrom,
  });
  const render = await import("./render");
  console.log(render.renderTaskBrief(
    brief,
    identity === null ? "none (local record)" : `${identity.machineId} / ${identity.agentId} / ${identity.repositoryId}`,
  ));
}

/** Serve the tools over stdio; diagnostics go to stderr, the protocol owns stdout. */
async function mcp(args: readonly string[]): Promise<void> {
  dedicatedRuntime();
  const { createPlanctlServer } = await import("../mcp/server");
  const { commandPublisher } = await import("../mcp/publish");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { eventLogPath } = await import("../core/event-log");
  const { claudeModelRunner } = await import("../core/spec-submission");
  const server = createPlanctlServer({
    cwd: process.cwd(),
    publication: readPublication,
    sourceCommit: git(dirname(import.meta.path), "rev-parse", "HEAD"),
    eventLog: eventLogPath(homedir()),
    model: claudeModelRunner,
    publisher: commandPublisher(optionalFlag(args, "--publisher") ?? "mdurl"),
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`planctl mcp: serving from ${dirname(import.meta.path)}`);
  await new Promise<void>((done) => { transport.onclose = done; });
}

/** The five tables from the event log, one set per server source commit. */
async function stats(args: readonly string[]): Promise<void> {
  dedicatedRuntime();
  const { eventLogPath, readEvents, renderStats, stats: tablesOf } = await import("../core/event-log");
  const since = optionalFlag(args, "--since") ?? "1970-01-01T00:00:00.000Z";
  if (!Number.isFinite(Date.parse(since))) throw new Error("--since must be an ISO date");
  console.log(renderStats(tablesOf(readEvents(eventLogPath(homedir()), since))));
}

function questionOption(value: string): { readonly label: string; readonly consequence: string } {
  const separator = value.indexOf(": ");
  if (separator <= 0) throw new Error(`--option needs "label: consequence", got ${value}`);
  return { label: value.slice(0, separator), consequence: value.slice(separator + 2) };
}

async function needsOwner(args: readonly string[]): Promise<void> {
  const { rootPath, target } = approvedPlan(args);
  const taskId = flag(args, "--task");
  const options: string[] = [];
  args.forEach((arg, index) => {
    const next = args[index + 1];
    if (arg === "--option" && next !== undefined) options.push(next);
  });
  const receipt: OwnerWaitReceipt = await needsOwnerOperation(rootPath, {
    plan: target.relative,
    taskId,
    context: flag(args, "--context"),
    options: options.map(questionOption),
    recommendation: flag(args, "--recommendation"),
    answerForm: flag(args, "--answer"),
  });
  console.log([
    `Task ${taskId} AWAITING OWNER`,
    `Context: ${receipt.context}`,
    ...receipt.options.map((option) => `Option: ${option.label} — ${option.consequence}`),
    `Recommendation: ${receipt.recommendation}`,
    `Answer: ${receipt.answerForm}`,
    `Started: ${receipt.startedAt}`,
  ].join("\n"));
}

async function resumeTask(args: readonly string[]): Promise<void> {
  const { rootPath, target } = approvedPlan(args);
  const taskId = flag(args, "--task");
  const resumed = await resumeTaskOperation(rootPath, { plan: target.relative, taskId, decodeRun: taskRunFrom });
  console.log(resumed.marker === null
    ? `Task ${taskId} has no owner wait; nothing cleared`
    : `Task ${taskId} RESUMED\nCleared owner wait: ${resumed.marker.context}`);
}

/** What gh reports for a Delivery branch: the PR, its CI on the current head, the last run. */
function readPublication(rootPath: string, branch: string): import("../core/plan-progress").ProgressView["publication"] {
  const gh = (...ghArgs: readonly string[]): string => {
    const result = spawnSync("gh", ghArgs, { cwd: rootPath, encoding: "utf8" });
    if (result.error !== undefined) throw new Error(result.error.message);
    if (result.status !== 0) throw new Error(result.stderr.trim() || `gh ${ghArgs[0]} exited ${result.status}`);
    return result.stdout;
  };
  const pulls: unknown = JSON.parse(gh("pr", "list", "--head", branch, "--state", "all", "--limit", "1", "--json", "url,headRefOid,mergedAt,statusCheckRollup"));
  if (!Array.isArray(pulls) || pulls.length === 0) return null;
  const pull = pulls[0] as Readonly<Record<string, unknown>>;
  if (typeof pull.url !== "string" || typeof pull.headRefOid !== "string") throw new Error("gh pr list returned no url or head");
  const checks = Array.isArray(pull.statusCheckRollup) ? pull.statusCheckRollup as readonly Readonly<Record<string, unknown>>[] : [];
  const conclusions = checks.map((check) => `${check.conclusion ?? check.state ?? ""}`.toUpperCase());
  const ci = conclusions.some((value) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT"].includes(value))
    ? "red"
    : conclusions.length > 0 && conclusions.every((value) => ["SUCCESS", "SKIPPED", "NEUTRAL"].includes(value)) ? "green" : "pending";
  const runs: unknown = JSON.parse(gh("run", "list", "--branch", branch, "--commit", pull.headRefOid, "--limit", "1", "--json", "databaseId,attempt"));
  const run = Array.isArray(runs) && runs.length > 0 ? runs[0] as Readonly<Record<string, unknown>> : null;
  return {
    prUrl: pull.url,
    ci,
    headSha: pull.headRefOid,
    runId: run === null ? "" : String(run.databaseId),
    attempt: run !== null && typeof run.attempt === "number" ? run.attempt : 0,
    merged: typeof pull.mergedAt === "string",
  };
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
  const taskFlag = optionalFlag(args, "--task");
  if (taskFlag !== undefined) {
    const done = await completeTaskOperation(rootPath, {
      plan: target.relative,
      taskIds: taskFlag.split(",").map((id) => id.trim()).filter((id) => id !== ""),
      commit: flag(args, "--commit"),
      result: flag(args, "--result"),
      deviations: args.flatMap((arg, index) => arg === "--deviation" && args[index + 1] !== undefined ? [args[index + 1]] : []),
    }, taskRunFrom);
    console.log([
      `Tasks ${done.taskIds.join(", ")} COMPLETED — ${done.stageId} commit:${done.commit}`,
      `UTC: ${done.startedAt}–${done.endedAt} — ${done.activeMinutes.toFixed(1)} active (estimate) / ${done.elapsedMinutes.toFixed(1)} elapsed min`,
      `Paths: ${done.paths.join(", ")}`,
      ...(done.beyondWrites.length === 0 ? [] : [`Beyond writes: ${done.beyondWrites.join(", ")}`]),
      `Temp root: ${done.tempRoot.path} (${done.tempRoot.state})`,
    ].join("\n"));
    return 0;
  }
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

async function init(args: readonly string[]): Promise<void> {
  const rootPath = root();
  const explicit = args[1] !== undefined && !args[1].startsWith("--") ? addressedPath(rootPath, args[1]).relative : undefined;
  const title = flag(args, "--title");
  const created = initPlan(rootPath, explicit === undefined ? { title } : { title, plan: explicit });
  if (basename(import.meta.dir) !== "cli") {
    // The installed copy carries no vocabulary parser: the contract comes
    // from the source checkout, as the planctl launcher runs it.
    console.log(`Plan: ${created.plan}\nBranch: ${created.branch} (base ${created.base})\nContract: run init through the planctl launcher for the sections, vocabulary and Goal rule`);
    return;
  }
  const contract: AuthoringContract = await authoringContract(rootPath);
  console.log([
    `Plan: ${created.plan}`,
    `Branch: ${created.branch} (base ${created.base})`,
    `Sections: ${contract.sections.join(", ")}`,
    ...contract.vocabulary.map((pair) => `Vocabulary: ${pair.word} → ${pair.term}`),
    `Goal rule: ${contract.goalRule}`,
  ].join("\n"));
}

function setSpec(args: readonly string[]): void {
  const plan = args[1];
  if (plan === undefined) throw new Error("plan path is required");
  const rootPath = root();
  const target = addressedPath(rootPath, plan);
  const spec = readFileSync(resolve(rootPath, flag(args, "--from")), "utf8");
  // Through the journaled writer, like every other mutation: a SPEC written by
  // hand left no journal, and the managed pre-commit refuses a staged marker
  // plan that has none.
  mutatePlanFile(rootPath, target.relative, "set-spec", (body: string) => replaceDraftSpec(body, spec));
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
    await init(args);
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
  if (command === "retro-status") {
    const rootPath = root();
    const given = optionalFlag(args, "--law");
    const candidates = given === undefined
      ? ["shared/code-production/laws/development-process.md", "docs/development-process.md"].map((path) => join(rootPath, path))
      : [resolve(rootPath, given)];
    const law = candidates.find((path) => existsSync(path));
    if (law === undefined) throw new Error("no process law with a register found; pass --law <file>");
    const { retroStatus } = await import(portableRuntimeFile("retro-register.ts"));
    const verdict = retroStatus(law);
    console.log(`retro-status: ${verdict.reason}`);
    return verdict.ok ? 0 : 1;
  }
  if (command === "progress") {
    await progress(args);
    return 0;
  }
  if (command === "mcp") {
    await mcp(args);
    return 0;
  }
  if (command === "stats") {
    await stats(args);
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
