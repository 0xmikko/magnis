#!/usr/bin/env bun
// The acceptance gate over a plan's own checkboxes. A closed box must carry
// a commit receipt that exists and is an ancestor of HEAD; a criterion
// written in the machinable form (`command` exits N) is re-executed; open
// boxes are counted, and --closure refuses any. This is what makes "he
// didn't finish and decided it was fine" a red check instead of a review
// finding (docs/development-process.md §Cadence).
//
//   bun planctl/src/core/plan-gate.ts <plan.md> [--closure] [--root <repo>]

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import { basename } from "node:path";

export interface GateViolation {
  kind: "missing-receipt" | "unknown-receipt" | "stray-receipt" | "criterion-failed" | "open-box"
    | "unapproved-plan" | "awaiting-owner" | "protocol-shape" | "lock-mismatch";
  line: number;
  text: string;
}

export interface GateReport {
  openBoxes: number;
  closedBoxes: number;
  checkedCriteria: number;
  violations: GateViolation[];
}

export const CLOSED = /^\s*-\s\[x\]\s(.*)$/;
export const OPEN = /^\s*-\s\[\s\]\s/;
// Exported because plan-close reads the same receipt grammar rather than
// re-deriving it; the review called a second copy a blocking defect.
export const RECEIPT = /—\s*([0-9a-f]{7,40})\s*$/;
// A complete project gate is an accepted machinable criterion and may exceed
// two minutes. Keep a bound for hung commands while allowing the declared
// publication gate to finish.
// Staging reached this conclusion independently while this branch raised
// plan-close's own ceiling for the same reason — two sessions, one measured
// fact.
const DEFAULT_CRITERION_TIMEOUT_MS = 12 * 60_000;
// A criterion is machinable only when the command OPENS the item — prose
// that quotes the form mid-sentence is not an instruction to execute it.
export const MACHINABLE = /^`([^`]+)`\s+exits\s+(\d+)/;

const PROTOCOL_SPEC_START = "<!-- plan:spec:start -->";
const PROTOCOL_SPEC_END = "<!-- plan:spec:end -->";
const PROTOCOL_IMPLEMENTATION_START = "<!-- plan:implementation:start -->";
const PROTOCOL_IMPLEMENTATION_END = "<!-- plan:implementation:end -->";

function protocolRegion(body: string, start: string, end: string): string {
  const from = body.indexOf(start);
  const to = body.indexOf(end);
  if (from === -1 || to === -1 || to <= from) throw new Error(`missing ordered markers ${start} and ${end}`);
  return body.slice(from, to + end.length);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function protocolSpecHash(body: string): string {
  return sha256(protocolRegion(body, PROTOCOL_SPEC_START, PROTOCOL_SPEC_END));
}

export function protocolImplementationHash(body: string): string {
  const normalized = protocolRegion(body, PROTOCOL_IMPLEMENTATION_START, PROTOCOL_IMPLEMENTATION_END)
    .replace(/^- \[[ x]\]/gm, "- [ ]")
    .replace(/^(\s*- \[ \].*?) — [0-9a-f]{7,40}$/gm, "$1")
    .replace(
      /<!-- plan:results:(D[1-9]\d*-S[1-9]\d*):start -->[\s\S]*?<!-- plan:results:\1:end -->/g,
      "<!-- plan:results:$1:start -->\n<!-- plan:results:$1:end -->",
    );
  return sha256(normalized);
}

export function protocolLockViolations(body: string): readonly string[] {
  if (!body.includes(PROTOCOL_SPEC_START)) return [];
  const violations: string[] = [];
  try {
    const state = body.match(/^Status:\s*(SPEC_DRAFT|SPEC_LOCKED|APPROVED)\b/m)?.[1];
    if (state === undefined) return ["missing canonical protocol Status header"];
    if (state === "SPEC_LOCKED" || state === "APPROVED") {
      const locked = body.match(/^Spec lock:\s*sha256:([0-9a-f]{64})\b/m)?.[1];
      if (locked === undefined || locked !== protocolSpecHash(body)) violations.push("SPEC lock does not match the marked SPEC bytes");
    }
    if (state === "APPROVED") {
      const locked = body.match(/^Implementation lock:\s*sha256:([0-9a-f]{64})\b/m)?.[1];
      if (locked === undefined || locked !== protocolImplementationHash(body)) {
        violations.push("implementation lock does not match the normalized Delivery/Stage contract");
      }
    }
  } catch (error) {
    violations.push(error instanceof Error ? error.message : String(error));
  }
  return violations;
}

export function shaKnownAndAncestor(root: string, sha: string): boolean {
  const probe = spawnSync("git", ["-C", root, "cat-file", "-e", `${sha}^{commit}`]);
  if (probe.status !== 0) return false;
  const ancestor = spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", sha, "HEAD"]);
  return ancestor.status === 0;
}

export const CONTINUATION = /^\s{2,}(?!-\s\[)\S/;

export interface PlanItem {
  /** 1-based, over Tasks then Acceptance criteria in document order. */
  ordinal: number;
  section: "tasks" | "criteria";
  /** Continuations trimmed and joined with single spaces — the canonical
   * form a verdict quotes, since a wrapped box is unquotable on one line. */
  text: string;
  /** Index of the box's FIRST line in the body. */
  line: number;
  /** Index of the box's LAST line, so a receipt lands at the item's end. */
  lastLine: number;
  closed: boolean;
  /** The stamped commit, read from the checkbox line or the item's end —
   * the two places a receipt can terminate. Undefined when none is stamped. */
  receipt: string | undefined;
  hasReceipt: boolean;
}

const STAGE_HEADING = /^###\s+Stage\s+(\d+)/i;
const TASKS_HEADING = /^####\s+Tasks\s*$/i;
const CRITERIA_HEADING = /^####\s+Acceptance criteria\s*$/i;

/** Every box in the document, in order — the one place box grammar lives:
 * the checkbox, the wrapped continuation, the normalized text. Both the gate
 * and the closer consume it; a second copy would be a review-blocking
 * duplicate, which is what the implementation review found here. */
export function allPlanItems(lines: string[]): PlanItem[] {
  return collectItems(lines, null);
}

/** Every box in one stage, numbered as a reader sees them. */
export function planItems(body: string, stage: number): PlanItem[] {
  return collectItems(body.split("\n"), stage);
}

function collectItems(lines: string[], stage: number | null): PlanItem[] {
  const items: PlanItem[] = [];
  let inStage = stage === null;
  let section: PlanItem["section"] | null = stage === null ? "tasks" : null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    const heading = line.match(STAGE_HEADING);
    if (heading && stage !== null) {
      inStage = Number(heading[1]) === stage;
      section = null;
      continue;
    }
    if (!inStage) continue;
    if (stage !== null && /^##\s/.test(line)) break;   // the stage list ended
    if (TASKS_HEADING.test(line)) { section = "tasks"; continue; }
    if (CRITERIA_HEADING.test(line)) { section = "criteria"; continue; }
    if (section === null) continue;

    const closedMatch = line.match(CLOSED);
    if (!closedMatch && !OPEN.test(line)) continue;

    const closedText = closedMatch?.[1];
    const story = (closedText ?? line.replace(OPEN, "")).trim();
    let text = story;
    let last = index;
    while (last + 1 < lines.length) {
      const continuation = lines[last + 1];
      if (continuation === undefined || !CONTINUATION.test(continuation)) break;
      last += 1;
      text += ` ${continuation.trim()}`;
    }
    // A receipt terminates a LINE of the item, and which line depends on what
    // the item is. Wrapped prose runs its sentence past the wrap, so the
    // receipt ends the last line. A Task carries Writes/Predict/How/RED under
    // its story, and a SHA appended after a RED command would be neither a
    // receipt nor a runnable command — there it ends the checkbox line, which
    // is also the only place the implementation lock strips a receipt from.
    const receipt = (RECEIPT.exec(story) ?? RECEIPT.exec(text))?.[1];
    items.push({
      ordinal: items.length + 1,
      section,
      text,
      line: index,
      lastLine: last,
      closed: Boolean(closedMatch),
      receipt,
      hasReceipt: receipt !== undefined,
    });
  }
  return items;
}


export function gatePlan(
  planPath: string,
  options: {
    root: string; closure?: boolean; start?: boolean; noExec?: boolean; criterionTimeoutMs?: number;
    /** Override the inherited recursion flag. A caller that IS the gate's own
     * suite needs to exercise criterion execution even when it happens to be
     * running as somebody's criterion — but it must say so for itself alone.
     * The alternative, deleting PLAN_GATE_NESTED from the environment, also
     * deletes it for every child, and that is what turned this file into a
     * fork bomb on 2026-08-24. */
    nested?: boolean;
  },
): GateReport {
  const lines = readFileSync(planPath, "utf8").split("\n");
  const body = lines.join("\n");
  const report: GateReport = { openBoxes: 0, closedBoxes: 0, checkedCriteria: 0, violations: [] };

  for (const text of protocolLockViolations(body)) {
    report.violations.push({ kind: text.includes("lock") ? "lock-mismatch" : "protocol-shape", line: 1, text });
  }

  // --start: work must not begin on an unsettled plan. Approval comes from
  // the owner (frontmatter `status: approved` or a body `Status: APPROVED`),
  // and no line may still be waiting on the owner's verdict.
  if (options.start) {
    if (!/^status:\s*approved\s*$/im.test(lines.slice(0, 10).join("\n"))
      && !lines.some((line) => /^Status:\s*APPROVED/.test(line))) {
      report.violations.push({ kind: "unapproved-plan", line: 1, text: "plan is not owner-approved" });
    }
    lines.forEach((line, index) => {
      if (/await(s|ing)? the owner/i.test(line)) {
        report.violations.push({ kind: "awaiting-owner", line: index + 1, text: line.trim() });
      }
    });
  }

  // ONE parser: `planItems` above owns box grammar — the checkbox, the
  // wrapped continuation, the normalized text — and this gate consumes it
  // rather than re-deriving it. A second copy of an existing mechanism is a
  // review-blocking defect here, and the review caught exactly that.
  //
  // Boxes under a `## Superseded …` heading are dead text a reformat parked,
  // not outstanding work — counting them made --closure unreachable for any
  // reworked plan (PR #160: 16 of 47 open-box violations were dead text).
  const superseded = new Set<number>();
  let inSuperseded = false;
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/.test(line)) inSuperseded = /superseded/i.test(line);
    if (inSuperseded) superseded.add(index);
  });

  for (const item of allPlanItems(lines)) {
    if (superseded.has(item.line)) continue;
    const number = item.line + 1;
    const sourceLine = lines[item.line] ?? item.text;
    if (!item.closed) {
      report.openBoxes += 1;
      if (options.closure) {
        report.violations.push({ kind: "open-box", line: number, text: sourceLine.trim() });
      }
      continue;
    }
    report.closedBoxes += 1;

    if (item.receipt === undefined) {
      report.violations.push({ kind: "missing-receipt", line: number, text: sourceLine.trim() });
    } else if (!shaKnownAndAncestor(options.root, item.receipt)) {
      report.violations.push({ kind: "unknown-receipt", line: number, text: sourceLine.trim() });
    }

    const criterion = item.text.match(MACHINABLE);
    // A criterion may invoke plan-gate itself (a plan asserting its own
    // --start, for instance) — without a guard that recursed forever. A
    // nested gate validates structure and receipts only; only the TOP-level
    // run executes criteria, each under a timeout so a hanging criterion is
    // a failed criterion, not a hung gate. --no-exec skips execution the
    // same way: a thin environment (the CI plan-gate job) can vouch for
    // receipts, but a criterion is only as true as the environment that
    // runs it — execution belongs to machines that carry the real stack.
    const nested = options.nested ?? process.env.PLAN_GATE_NESTED === "1";
    if (criterion?.[1] !== undefined && criterion[2] !== undefined && !options.noExec && !nested) {
      report.checkedCriteria += 1;
      const run = spawnSync("bash", ["-c", criterion[1]], {
        cwd: options.root,
        timeout: options.criterionTimeoutMs ?? DEFAULT_CRITERION_TIMEOUT_MS,
        env: { ...process.env, PLAN_GATE_NESTED: "1" },
      });
      if ((run.status ?? 1) !== Number(criterion[2])) {
        report.violations.push({ kind: "criterion-failed", line: number, text: sourceLine.trim() });
      }
    }
  }

  return report;
}

/* ── The plan freeze ─────────────────────────────────────────────────────
 *
 * An APPROVED plan is a contract with the owner. A commit may tick a box,
 * stamp a receipt, correct a measurement or record a Deviation without
 * asking anyone — none of those change what was agreed. Anything else in
 * the Goal, the target file tree, a stage heading or an acceptance
 * criterion needs an Amendments line added BY THAT SAME COMMIT, because a
 * rule without a named author is not a rule.
 *
 * It reads no history and runs no git: the caller hands over the parent
 * version, the candidate version, and git's own rename and merge metadata
 * from the transaction it is already inspecting. The specimen it exists
 * for is ee92a86eb, which rewrote a Goal, a target tree and criteria
 * inside a commit whose subject was about code, green through every gate.
 */
export type PlanFreezeVerdict =
  | { allowed: true }
  | { allowed: false; reason: string };

export interface PlanFreezeInput {
  /** The plan's path in the candidate tree. */
  path: string;
  /** Its content at the parent commit; null when the file is new. */
  parent: string | null;
  /** Its content in the index. */
  candidate: string;
  /** Git's auto-merge of the two sides, on a merge. */
  autoMerged?: string;
}

/** A status line that says APPROVED and then says who and when is still an
 * approved plan. Anchoring the word to the end of the line left six plans in
 * `docs/plans` outside the freeze entirely — not a weaker contract, none at
 * all — and the count is measured with these two regexes over the corpus, 18
 * before and 24 after, not with a grep that approximates them. The optional
 * `**` is the corpus's own bold spelling; the word boundary keeps DRAFT,
 * COMPLETE and IMPLEMENTED out. One recovered plan records a self-declared
 * approval, which `plan-format.md` bans: it is admitted deliberately, because
 * refusing it protects nothing at all in a plan whose status is already
 * irregular, and whether that approval counts is the owner's question, not
 * this predicate's. */
const APPROVED = /^\s*status:\s*\*{0,2}approved\b/im;

/** The sections that are the contract. Everything else in a plan — the
 * stage prose, the reuse map, the measurements — is the agent's to write. */
const PROTECTED: ReadonlyArray<{ name: string; heading: RegExp }> = [
  // Prefix-tolerant on purpose: plans in this repository head these sections
  // `## The goal`, `## 1. The goal` and `## The goal — <subtitle>`. Matching
  // one spelling left 15 of 46 plans with no protected Goal at all.
  { name: "the goal", heading: /^##\s+(?:\d+\.\s*)?The goal\b/i },
  { name: "the target", heading: /^##\s+(?:\d+\.\s*)?The target\b/i },
];

const AMENDMENTS_HEADING = /^##\s+Amendments\s*$/i;
const BOX = /^\s*-\s\[[ x]\]\s/;

/** A box line, reduced to what the owner agreed to: the checkbox state, any
 * appended receipt and any appended measurement are the agent's to write, so
 * they are stripped before comparison. */
function boxContract(line: string): string {
  return line
    .replace(/^\s*-\s\[[ x]\]\s/, "- ")
    // RECEIPT, not a second spelling of it: its own comment says it is
    // exported so there is exactly one copy, and this file had the copy.
    .replace(RECEIPT, "")
    .replace(/\s+/g, " ")
    .trimEnd();
}

/** Lines the contract is made of, keyed by where they live. Prose inside a
 * stage is deliberately absent: freezing it would make every clarification
 * need the owner's word, and a rule that expensive gets routed around. */
function contractLines(body: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  const lines = body.split("\n");
  let current: string | null = null;
  let inCriteria = false;

  for (const line of lines) {
    const protectedSection = PROTECTED.find((entry) => entry.heading.test(line));
    if (protectedSection) {
      current = protectedSection.name;
      inCriteria = false;
      continue;
    }
    if (STAGE_HEADING.test(line)) {
      sections.set("stage headings", [...(sections.get("stage headings") ?? []), line.trim()]);
      current = null;
      inCriteria = false;
      continue;
    }
    if (CRITERIA_HEADING.test(line)) {
      current = null;
      inCriteria = true;
      continue;
    }
    if (/^#{2,4}\s/.test(line)) {
      // Legacy plans without protocol hashes keep their historical heading
      // freeze. New planctl documents lock the entire marked SPEC above.
      current = null;
      inCriteria = false;
      continue;
    }
    if (inCriteria && BOX.test(line)) {
      sections.set("acceptance criteria", [
        ...(sections.get("acceptance criteria") ?? []),
        boxContract(line),
      ]);
      continue;
    }
    if (inCriteria && CONTINUATION.test(line)) {
      // A criterion that wraps is still ONE sentence, and the assertion often
      // lives past the wrap: stage-loop's own "a clean merge runs nothing"
      // sits on a continuation line. Recording only the box line let that
      // sentence be flipped to its opposite with the freeze saying `allowed`.
      // The grammar is the shared CONTINUATION, not "any nonblank line": a
      // plan's unindented `Receipt:` prose is not part of the criterion, and
      // absorbing it refused edits nobody agreed to protect.
      const recorded = sections.get("acceptance criteria");
      if (recorded !== undefined && recorded.length > 0) {
        recorded[recorded.length - 1] = `${recorded[recorded.length - 1]} ${boxContract(line)}`;
        continue;
      }
    }
    if (current !== null && line.trim() !== "") {
      sections.set(current, [...(sections.get(current) ?? []), line.trim()]);
    }
  }
  return sections;
}

/** The Amendments lines a version carries, so "added by this commit" is a
 * comparison rather than a promise. */
function amendments(body: string): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of body.split("\n")) {
    if (AMENDMENTS_HEADING.test(line)) { inside = true; continue; }
    if (inside && /^##\s/.test(line)) break;
    if (inside && /^\s*-\s/.test(line)) out.push(line.trim());
  }
  return out;
}

/** Digits become a placeholder, so a re-measurement reads as unchanged. This
 * is the "corrected measurement" delta the plan grants, and it carries the
 * limit the plan names in the same breath: a weakened THRESHOLD dressed as a
 * measurement passes here and is a review finding, not a machine one. The
 * receipt for granting it is staging's 2deb648c7, an honest re-measurement of
 * an approved plan (409 -> 412 violations) that any stricter rule refuses. */
function withoutMeasurements(text: string): string {
  // Two numbers are NOT measurements: the exit code a criterion declares and
  // the number in a stage heading. Masking them let a criterion flip from
  // `exits 0` to `exits 1` — and plan-close would then tick that box on the
  // opposite outcome — and let Stage 1 become Stage 2. Split on them, mask
  // only what is left.
  const GUARDED = /(exits\s+\d+|^###\s+Stage\s+\d+)/gm;
  return text
    .split(GUARDED)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/\d[\d.,]*/g, "#")))
    .join("");
}

function firstDivergence(before: Map<string, string[]>, after: Map<string, string[]>): string | null {
  const names = new Set([...before.keys(), ...after.keys()]);
  for (const name of names) {
    const a = (before.get(name) ?? []).join("\n");
    const b = (after.get(name) ?? []).join("\n");
    // The masked comparison is the whole test: two strings that differ only in
    // their numbers mask to the same text, and two that mask differently were
    // never equal to begin with. An `a !== b` in front decided nothing.
    if (withoutMeasurements(a) !== withoutMeasurements(b)) return name;
  }
  return null;
}

export function checkPlanFreeze(input: PlanFreezeInput): PlanFreezeVerdict {
  // A merge inherits, and that answer comes FIRST. Content equal to git's own
  // auto-merge was written by nobody here; the branch that wrote it answered
  // for it already. Judged after the born-APPROVED refusal below, a plan
  // ARRIVING with a merge — added on the other side, absent on ours — was
  // called a plan created already approved, which is someone else's landed
  // work being blamed on whoever merged it.
  if (input.autoMerged !== undefined && input.autoMerged === input.candidate) {
    return { allowed: true };
  }

  // A plan born APPROVED never had an owner read it. Approval is an act on
  // something that existed first, which is why the draft is committed and
  // pushed before it is asked for (docs/development-process.md).
  if (input.parent === null) {
    return APPROVED.test(input.candidate)
      ? {
          allowed: false,
          reason: "a plan cannot be created already APPROVED — commit the draft, then let the owner approve what they read",
        }
      : { allowed: true };
  }

  // Two situations, ONE rule, which is why they share one lane: a plan the
  // owner has already approved, and the commit that approves a draft — the
  // flip may carry the approval and the free deltas, never a rewrite bundled
  // with them. Written as two blocks, the same three steps stood twice and
  // only the refusal sentence differed.
  const wasApproved = APPROVED.test(input.parent);
  if (!wasApproved && !APPROVED.test(input.candidate)) return { allowed: true };

  const divergence = firstDivergence(contractLines(input.parent), contractLines(input.candidate));
  if (divergence === null) return { allowed: true };

  // An Amendment written in THIS commit is the owner's word arriving with the
  // change it licenses; one already in the parent licenses nothing.
  const before = amendments(input.parent);
  if (amendments(input.candidate).some((line) => !before.includes(line))) return { allowed: true };

  return {
    allowed: false,
    reason: wasApproved
      ? `${input.path}: "${divergence}" is protected in an approved plan. ` +
        "Change it only with the owner's word, recorded as an Amendments line in THIS commit. " +
        "An Amendment already present from an earlier change licenses nothing."
      : "the commit that approves a plan may carry the approval and the free deltas only, not a rewrite of what it approves",
  };
}

/** What git ITSELF would produce from the two sides. Asking git rather than
 * rebuilding it: `merge-tree --write-tree` performs the same three-way merge
 * the working merge did, with git's own rename detection in BOTH directions
 * and its own handling of a one-sided add — every special case a hand-rolled
 * engine has to discover one review round at a time. Requires git >= 2.38.
 *
 * Per-FILE granularity comes from `--name-only`, not from the exit status:
 * the status describes the whole merge, so a conflict in some other file
 * would otherwise read as "no auto-merge" for a plan that merged cleanly. A
 * plan in the conflicted list has no auto-merge to inherit, so whatever is
 * staged for it is a human's resolution and is judged as authored.
 *
 * That last part is LOAD-BEARING, and this comment previously claimed the
 * opposite — that no input could reach it, because the two commands label
 * their conflict hunks differently. They do not: the labels differ only when
 * a human merges by REF NAME while `--freeze` reconstructs from the resolved
 * SHA. Merge by SHA and the working-tree markers are byte-identical to the
 * reconstruction, so `git add` on the unresolved soup makes the exemption fire
 * and an unlicensed rewrite of a protected section passes green. Removing the
 * conflicted set is the only thing standing in the way. */
function autoMergedTree(root: string, mergeHead: string): { tree: string; conflicted: Set<string> } | null {
  const out = spawnSync(
    "git",
    ["-C", root, "merge-tree", "--write-tree", "-z", "--name-only", "--no-messages", "HEAD", mergeHead],
    { encoding: "utf8" },
  );
  const [tree, ...rest] = out.stdout.split("\0");
  // A tree OID or nothing. Anything else — an empty string from unrelated
  // histories, a usage error on git < 2.38, a message where an OID was
  // expected — must yield null, because the empty rev reads the INDEX: a
  // blank `tree` would make `read(tree, path)` return the very bytes being
  // judged, so `autoMerged === candidate` always, and INV-SL-4 would be
  // silently OFF for every plan in the repository. Fail closed on shape, not
  // on the exit status.
  if (tree === undefined || !/^[0-9a-f]{40}$/.test(tree.trim())) return null;
  return { tree: tree.trim(), conflicted: new Set(rest.filter((entry) => entry !== "")) };
}

if (import.meta.main && ["plan-gate.ts", "plan-gate.js"].includes(basename(import.meta.path))) {
  const args = process.argv.slice(2);
  // --freeze: the staged-diff mode the commit hook calls. It gathers what the
  // pure check needs — the parent version, the candidate version, and git's
  // own merge metadata — and reports every refusal.
  if (args.includes("--freeze")) {
    const freezeRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
    const read = (rev: string, path: string): string | null => {
      const out = spawnSync("git", ["-C", freezeRoot, "show", `${rev}:${path}`], { encoding: "utf8" });
      return out.status === 0 ? out.stdout : null;
    };
    const merge = spawnSync("git", ["-C", freezeRoot, "rev-parse", "-q", "--verify", "MERGE_HEAD"], { encoding: "utf8" });
    // Git's own rename detection for this transaction. Without it a renamed
    // plan has no parent at its new path, and an UNCHANGED rename was refused
    // as "a plan cannot be created already APPROVED" — a gate refusing honest
    // work, which is the failure mode this repository pays for twice over.
    const renames = new Map<string, string>();
    const status = spawnSync(
      "git",
      ["-C", freezeRoot, "diff", "--cached", "--name-status", "-M"],
      { encoding: "utf8" },
    );
    if (status.status === 0) {
      for (const line of status.stdout.split("\n")) {
        const parts = line.split("\t");
        const from = parts[1];
        const to = parts[2];
        if (parts[0]?.startsWith("R") && from !== undefined && to !== undefined) renames.set(to, from);
      }
    }
    // ONE merge for the whole run: the tree is the same for every path, so
    // computing it inside the loop would re-merge the repository per plan.
    const merged = merge.status === 0 ? autoMergedTree(freezeRoot, merge.stdout.trim()) : null;
    let refused = 0;
    for (const path of args.filter((a) => a.endsWith(".md"))) {
      // The empty rev is the INDEX: what this commit is about to record.
      const candidate = read("", path);
      if (candidate === null) continue;   // deleted: the ledger answers for purges
      const renamedFrom = renames.get(path);
      const parent = read("HEAD", renamedFrom ?? path);
      const autoMerged = merged !== null && !merged.conflicted.has(path)
        ? read(merged.tree, path)
        : null;
      const verdict = checkPlanFreeze(autoMerged === null ? {
        path, parent, candidate,
      } : {
        path, parent, candidate, autoMerged,
        // The rename is fully spent one line above, choosing WHERE the parent
        // version is read from. Passing it on as a field nothing reads made
        // the freeze look rename-aware when the CLI was doing all of that work.
      });
      if (!verdict.allowed) {
        console.error(`plan-freeze: ${verdict.reason}`);
        refused += 1;
      }
    }
    process.exit(refused === 0 ? 0 : 1);
  }
  const closure = args.includes("--closure");
  const start = args.includes("--start");
  const noExec = args.includes("--no-exec");
  const plan = args.find((a) => a.endsWith(".md"));
  if (plan === undefined) {
    console.error("usage: bun planctl/src/core/plan-gate.ts <plan.md> [--closure] [--start] [--no-exec] [--root <repo>]");
    process.exit(64);
  }
  const rootFlag = args.indexOf("--root");
  const root = rootFlag === -1
    ? execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim()
    : args[rootFlag + 1];
  if (!root) {
    console.error("usage: bun planctl/src/core/plan-gate.ts <plan.md> [--closure] [--start] [--no-exec] [--root <repo>]");
    process.exit(64);
  }
  const report = gatePlan(plan, { root, closure, start, noExec });
  console.log(`boxes: ${report.closedBoxes} closed / ${report.openBoxes} open; machinable criteria re-run: ${report.checkedCriteria}`);
  for (const violation of report.violations) {
    console.log(`VIOLATION [${violation.kind}] line ${violation.line}: ${violation.text}`);
  }
  process.exit(report.violations.length === 0 ? 0 : 1);
}
