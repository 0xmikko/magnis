// StateMock archetype 'oauth'. The package owns this fixed wire declaration;
// only --state-dir remains an optional programming input for deterministic tests.
import { runStateMock } from "@magnis/source-statemachine";

const stateDirIndex = process.argv.indexOf("--state-dir");
const stateDir = stateDirIndex >= 0 ? process.argv[stateDirIndex + 1] : undefined;
process.argv = [
  ...process.argv.slice(0, 2),
  "--surfaces",
  "smo-a,smo-b,smo-c",
  "--mode",
  "poll",
  ...(stateDir === undefined ? [] : ["--state-dir", stateDir]),
];
await runStateMock();
