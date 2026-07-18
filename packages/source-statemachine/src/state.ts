// StateMock file-backed programming — ported 1:1 from the Rust
// `magnis-mock-statemachine` binary.
//
// The single source of truth is FILE-BASED (`--state-dir <dir>`): the connector
// child only exists while the host talks to it, so programming must survive
// process boundaries:
//   <dir>/program.json  — { "<surface>": [MockStep, ...] } (queue; re-read and
//                          rewritten on every consuming call)
//   <dir>/calls.jsonl   — append-only log of every tool call
// Without `--state-dir` every fetch is a clean empty page and probes answer the
// default identity — the zero-config archetypes stay usable.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The value of `--<name>` on the command line, if present. */
export function arg(name: string): string | undefined {
  const flag = `--${name}`;
  const args = process.argv;
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

export function stateDir(): string | undefined {
  return arg("state-dir");
}

/** Surfaces this archetype advertises (`--surfaces a,b,c`; default "mock"). */
export function surfaces(): string[] {
  return (arg("surfaces") ?? "mock").split(",").map((s) => s.trim());
}

/** Sync mode this archetype advertises (`--mode poll|push`; default "poll").
 * Echoed VERBATIM into capabilities, exactly as the Rust twin did. */
export function mode(): "poll" | "push" {
  return (arg("mode") ?? "poll") as "poll" | "push";
}

export type MockStep = Record<string, unknown>;

/** Pop the next programmed step for `surface` from the file-backed queue.
 * `null` = nothing programmed (clean default behavior). */
export function nextStep(surface: string): MockStep | null {
  const dir = stateDir();
  if (!dir) return null;
  const path = join(dir, "program.json");
  let programs: Record<string, MockStep[]>;
  try {
    programs = JSON.parse(readFileSync(path, "utf8")) as Record<string, MockStep[]>;
  } catch {
    return null; // missing/unparseable ⇒ empty map ⇒ nothing queued
  }
  const queue = programs?.[surface];
  if (!Array.isArray(queue) || queue.length === 0) return null;
  const step = queue.shift()!;
  try {
    writeFileSync(path, JSON.stringify(programs));
  } catch {
    // Rust ignores the write error too — the step is still consumed.
  }
  return step;
}

/** Append one call record to `calls.jsonl` (no state dir ⇒ no log). */
export function logCall(entry: Record<string, unknown>): void {
  const dir = stateDir();
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "calls.jsonl"), JSON.stringify(entry) + "\n");
  } catch {
    // Best-effort, exactly as in Rust (`let _ = ..`).
  }
}
