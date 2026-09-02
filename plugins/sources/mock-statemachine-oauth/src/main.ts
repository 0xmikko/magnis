// StateMock archetype 'oauth'. The package owns this fixed wire declaration;
// only --state-dir remains an optional programming input for deterministic tests.
import { runConnector } from "@magnis/connector-sdk";
import { fetchStateMock, probeStateMock } from "@magnis/source-statemachine";
import { exchangeFixtureOAuth, revokeFixtureOAuth } from "./auth";

const stateDirIndex = process.argv.indexOf("--state-dir");
const stateDir = stateDirIndex >= 0 ? process.argv[stateDirIndex + 1] : undefined;
process.argv = [
  ...process.argv.slice(0, 2),
  "--surfaces",
  "email",
  "--mode",
  "poll",
  ...(stateDir === undefined ? [] : ["--state-dir", stateDir]),
];
await runConnector({
  name: "magnis-mock-statemachine",
  version: "0.1.0",
  surfaces: ["email"],
  mode: "poll",
  intervalSecs: 300,
  fetch: fetchStateMock,
  probeAuth: probeStateMock,
  auth: {
    exchange: exchangeFixtureOAuth,
    revoke: revokeFixtureOAuth,
  },
});
