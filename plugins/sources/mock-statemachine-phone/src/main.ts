// StateMock archetype 'phone' — the shared @magnis/source-statemachine connector
// in a phone_code/push shape. The shape itself comes from the manifest's
// [spawn] args (--surfaces smp --mode push); tests add --state-dir to program it.
import { runStateMock } from "@magnis/source-statemachine";

await runStateMock();
