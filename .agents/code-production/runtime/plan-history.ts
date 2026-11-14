import {
  applyOwnerAmendment,
  deliveryEnd,
  deliveryMetas,
  deliveryStart,
  planState,
  protocolImplementationHash,
  protocolSpecHash,
  stageInputs,
  validateImplementation,
} from "./plan-update";
import { protocolLockViolations } from "./plan-gate";

const IMPLEMENTATION_START = "<!-- plan:implementation:start -->";
const IMPLEMENTATION_END = "<!-- plan:implementation:end -->";
const SPEC_START = "<!-- plan:spec:start -->";
const SPEC_END = "<!-- plan:spec:end -->";
const EXECUTION_START = "<!-- plan:execution:start -->";
const EXECUTION_END = "<!-- plan:execution:end -->";

/** Read exact record bytes; the native writers and lock checker own their meaning. */
function marked(body: string, start: string, end: string): string {
  const from = body.indexOf(start);
  const to = body.indexOf(end);
  if (from < 0 || to <= from || body.indexOf(start, from + start.length) >= 0 || body.indexOf(end, to + end.length) >= 0) {
    throw new Error("Missing, duplicated or unordered native plan markers");
  }
  return body.slice(from, to + end.length);
}

/** Only this native metadata boolean may differ inside a preserved Delivery. */
function withoutActivation(block: string): string {
  const marker = /^(<!-- plan:delivery-meta:\{"active":)(true|false)([,}])/m;
  if (!marker.test(block)) throw new Error("Missing native Delivery activation metadata");
  return block.replace(marker, "$1false$3");
}

function amendmentFrame(body: string): string {
  const active = deliveryMetas(body).find(delivery => delivery.active);
  const header = body.match(/^Active Delivery:.*$/m)?.[0];
  if (active === undefined || header?.trimEnd() !== `Active Delivery: ${active.id}`) throw new Error("Invalid native active Delivery header");
  return body.replace(marked(body, EXECUTION_START, EXECUTION_END), `${EXECUTION_START}\n${EXECUTION_END}`)
    .replace(/^Active Delivery:.*$/m, "Active Delivery: [native activation]");
}

/** Native writers validate the final approved sections; old execution stays exact. */
function replaysOwnerAmendments(previous: string, candidate: string, required: "spec" | "implementation"): boolean {
  const oldExecution = marked(previous, EXECUTION_START, EXECUTION_END);
  const newExecution = marked(candidate, EXECUTION_START, EXECUTION_END);
  const oldPrefix = oldExecution.slice(0, -EXECUTION_END.length).trimEnd();
  if (!newExecution.startsWith(`${oldPrefix}\n\n`)) return false;
  const records = newExecution.slice(oldPrefix.length + 2, -EXECUTION_END.length).trimEnd().split("\n\n");
  let replayed = previous;
  let lastSpecHash: string | undefined;
  let lastImplementationHash: string | undefined;
  for (const record of records) {
    const event = record.match(/^- amend (spec|implementation) owner:([^\r\n]+) sha256:([0-9a-f]{64})$/);
    if (event === null) {
      if (/^\s*- amend\b/m.test(record)) return false;
      continue;
    }
    const section = event[1], ownerWord = event[2], hash = event[3];
    if ((section !== "spec" && section !== "implementation") || ownerWord === undefined || hash === undefined) return false;
    const [start, end] = section === "spec" ? [SPEC_START, SPEC_END] as const : [IMPLEMENTATION_START, IMPLEMENTATION_END] as const;
    // Only final section bytes exist in tracked history; intermediate drafts are not reconstructed.
    replayed = applyOwnerAmendment(replayed, ownerWord, {
      section, find: marked(replayed, start, end), replace: marked(candidate, start, end),
    }).body;
    if (section === "spec") lastSpecHash = hash;
    else lastImplementationHash = hash;
  }
  const specHash = protocolSpecHash(candidate);
  if (lastSpecHash !== undefined && lastSpecHash !== specHash) return false;
  if (protocolSpecHash(previous) !== specHash && lastSpecHash === undefined) return false;
  if (lastImplementationHash !== undefined && lastImplementationHash !== protocolImplementationHash(candidate)) return false;
  if (required === "spec" ? lastSpecHash === undefined : lastImplementationHash === undefined) return false;
  return amendmentFrame(candidate) === amendmentFrame(replayed);
}

/** A new owner SPEC correction for this same active Delivery preserves every implementation byte. */
export function isOwnerSpecAmendment(previous: string, candidate: string, deliveryId: string): boolean {
  try {
    if (planState(previous) !== "APPROVED" || planState(candidate) !== "APPROVED"
      || protocolLockViolations(previous).length || protocolLockViolations(candidate).length) return false;
    validateImplementation(previous);
    validateImplementation(candidate);
    if (!deliveryMetas(previous).some(delivery => delivery.id === deliveryId && delivery.active)
      || !deliveryMetas(candidate).some(delivery => delivery.id === deliveryId && delivery.active)
      || previous.match(/^Active Delivery:.*$/m)?.[0] !== candidate.match(/^Active Delivery:.*$/m)?.[0]
      || marked(previous, IMPLEMENTATION_START, IMPLEMENTATION_END) !== marked(candidate, IMPLEMENTATION_START, IMPLEMENTATION_END)
      || protocolSpecHash(previous) === protocolSpecHash(candidate)) return false;
    return replaysOwnerAmendments(previous, candidate, "spec");
  } catch {
    return false;
  }
}

/** A new completed repair of the same approved Task, preserved in native tracked history.
 * Git ancestry/new-commit evidence belongs to the caller's checked publication window.
 * @tested-by: tst_unit_planctl_publication_004
 */
export function isNativeExecutionRepair(previous: string, candidate: string, deliveryId: string,
  isNewCommit: (commit: string) => boolean): boolean {
  try {
    if (planState(previous) !== "APPROVED" || planState(candidate) !== "APPROVED"
      || protocolLockViolations(previous).length || protocolLockViolations(candidate).length
      || protocolSpecHash(previous) !== protocolSpecHash(candidate)
      || protocolImplementationHash(previous) !== protocolImplementationHash(candidate)) return false;
    validateImplementation(previous);
    validateImplementation(candidate);
    if (!deliveryMetas(previous).some(delivery => delivery.id === deliveryId && delivery.active)
      || !deliveryMetas(candidate).some(delivery => delivery.id === deliveryId && delivery.active)) return false;
    const oldExecution = marked(previous, EXECUTION_START, EXECUTION_END).slice(0, -EXECUTION_END.length).trimEnd();
    const newExecution = marked(candidate, EXECUTION_START, EXECUTION_END);
    if (!newExecution.startsWith(`${oldExecution}\n\n`)) return false;
    const appendedExecution = newExecution.slice(oldExecution.length);
    const allBefore = stageInputs(previous);
    // @tested-by: tst_core_planctl_native_repair_001
    // A fresh Task receipt cannot authorize rewriting any earlier proof,
    // including unrepaired Stages and already completed Deliveries.
    const appendedResults = new Map<string, string>();
    for (const stage of allBefore) {
      const start = `<!-- plan:results:${stage.id}:start -->`, end = `<!-- plan:results:${stage.id}:end -->`;
      const oldResults = marked(previous, start, end).slice(0, -end.length).trimEnd();
      const newResults = marked(candidate, start, end);
      if (!newResults.startsWith(`${oldResults}\n`)) return false;
      appendedResults.set(stage.id, newResults.slice(oldResults.length));
    }
    const before = allBefore.filter(stage => stage.deliveryId === deliveryId);
    const after = stageInputs(candidate).filter(stage => stage.deliveryId === deliveryId);
    const meaning = (stages: typeof before) => stages.map(stage => ({ ...stage,
      tasks: stage.tasks.map(({ completed: _completed, completionCommit: _commit, ...task }) => task) }));
    if (!before.length || JSON.stringify(meaning(before)) !== JSON.stringify(meaning(after))) return false;
    let repaired = false;
    for (const stage of after) for (const task of stage.tasks) {
      const old = before.find(entry => entry.id === stage.id)?.tasks.find(entry => entry.id === task.id);
      if (old?.completionCommit === task.completionCommit) continue;
      const commit = task.completionCommit;
      if (!old?.completed || !task.completed || commit === null || !isNewCommit(commit)
        || !appendedExecution.split("\n").includes(`- record-result ${stage.id} commit:${commit}`)) return false;
      if (!appendedResults.get(stage.id)?.split("\n").some(row => row.startsWith(`| ${task.id} | ${commit} | `) && row.endsWith(" |"))) return false;
      repaired = true;
    }
    return repaired;
  } catch {
    return false;
  }
}

/**
 * Read-only proof from tracked native history, not a replay of the Git-local writer journal.
 * Old Delivery bytes stay exact except activation; only complete new Deliveries append.
 */
export function isAdditiveDeliveryAmendment(previous: string, candidate: string): boolean {
  try {
    if (planState(previous) !== "APPROVED" || planState(candidate) !== "APPROVED") return false;
    if (protocolLockViolations(previous).length || protocolLockViolations(candidate).length) return false;
    validateImplementation(previous);
    validateImplementation(candidate);
    const oldDeliveries = deliveryMetas(previous);
    const newDeliveries = deliveryMetas(candidate);
    if (newDeliveries.length <= oldDeliveries.length
      || new Set(oldDeliveries.map(delivery => delivery.id)).size !== oldDeliveries.length
      || new Set(newDeliveries.map(delivery => delivery.id)).size !== newDeliveries.length
      || oldDeliveries.some((delivery, index) => newDeliveries[index]?.id !== delivery.id)) return false;

    const oldImplementation = marked(previous, IMPLEMENTATION_START, IMPLEMENTATION_END);
    const newImplementation = marked(candidate, IMPLEMENTATION_START, IMPLEMENTATION_END);
    let preserved = oldImplementation;
    for (const delivery of oldDeliveries) {
      const oldBlock = marked(previous, deliveryStart(delivery.id), deliveryEnd(delivery.id));
      const newBlock = marked(candidate, deliveryStart(delivery.id), deliveryEnd(delivery.id));
      if (withoutActivation(oldBlock) !== withoutActivation(newBlock)) return false;
      preserved = preserved.replace(oldBlock, newBlock);
    }
    const appended = newDeliveries.slice(oldDeliveries.length)
      .map(delivery => marked(candidate, deliveryStart(delivery.id), deliveryEnd(delivery.id)));
    const expected = `${preserved.slice(0, -IMPLEMENTATION_END.length).trimEnd()}\n\n${appended.join("\n\n")}\n${IMPLEMENTATION_END}`;
    if (newImplementation !== expected) return false;

    return replaysOwnerAmendments(previous, candidate, "implementation");
  } catch {
    return false;
  }
}
