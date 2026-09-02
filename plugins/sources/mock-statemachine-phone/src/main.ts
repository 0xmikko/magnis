// StateMock archetype 'phone'. The package owns this fixed wire declaration;
// only --state-dir remains an optional programming input for deterministic tests.
import { runConnector } from "@magnis/connector-sdk";
import { fetchStateMock, probeStateMock } from "@magnis/source-statemachine";
import {
  beginFixturePhone,
  revokeFixturePhone,
  stepFixturePhone,
} from "./auth";

/**
 * @tested-by: tst_cert_phone_001
 * @invariant: the phone fixture is a callable push Source, so opening and
 * closing a subscription must be accepted by the packaged process.
 */
function listenStart(): Promise<void> {
  return Promise.resolve();
}

function listenStop(): Promise<void> {
  return Promise.resolve();
}

await runConnector({
  name: "magnis-mock-statemachine",
  version: "0.1.0",
  surfaces: ["telegram"],
  mode: "push",
  intervalSecs: 300,
  fetch: fetchStateMock,
  probeAuth: probeStateMock,
  auth: {
    begin: beginFixturePhone,
    step: stepFixturePhone,
    revoke: revokeFixturePhone,
  },
  listenStart,
  listenStop,
});
