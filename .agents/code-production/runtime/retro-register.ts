/**
 * The register of experiments at the end of the process law: one row per
 * Delivery's retro — the date, the Delivery, the experiment it proposed, and
 * the owner's status on it. `end-work` writes a row and refuses to close a
 * Delivery while the previous row has no status, so a retro changes something
 * or is answered, never just filed.
 */
import { readFileSync } from "node:fs";

export interface ExperimentRow {
  readonly date: string;
  readonly delivery: string;
  readonly experiment: string;
  /** "accepted <date>", "declined <date>", or null when the owner has not spoken. */
  readonly status: string | null;
}

export interface RetroStatus {
  readonly ok: boolean;
  readonly reason: string;
}

const HEADING = "## Register of experiments";

export function retroRegister(lawPath: string): ExperimentRow[] {
  const text = readFileSync(lawPath, "utf8");
  const at = text.indexOf(HEADING);
  if (at === -1) throw new Error(`${lawPath} has no "${HEADING}" section`);
  const rows: ExperimentRow[] = [];
  for (const line of text.slice(at + HEADING.length).split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 4 || cells[0] === "Date" || cells[0]?.startsWith("---")) continue;
    const [date = "", delivery = "", experiment = "", status = ""] = cells;
    if (status !== "" && !/^(accepted|declined)\b/.test(status)) {
      throw new Error(`register row for ${date} ${delivery}: status must be "accepted" or "declined" with a date, got "${status}"`);
    }
    rows.push({ date, delivery, experiment, status: status === "" ? null : status });
  }
  return rows;
}

export function retroStatus(lawPath: string): RetroStatus {
  const rows = retroRegister(lawPath);
  const last = rows.at(-1);
  if (last === undefined) return { ok: true, reason: "no experiment recorded yet" };
  if (last.status === null) {
    return {
      ok: false,
      reason: `the last experiment (${last.date}, ${last.delivery}) has no status; the owner accepts or declines it before the next Delivery closes`,
    };
  }
  return { ok: true, reason: `the last experiment has a status: ${last.status}` };
}
