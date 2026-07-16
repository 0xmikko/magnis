// StateMock archetype 'key' — the shared @magnis/source-statemachine connector
// in an api_key/poll shape. The shape itself comes from the manifest's
// [spawn] args (--surfaces smk --mode poll); tests add --state-dir to program it.
import { runStateMock } from "@magnis/source-statemachine";

await runStateMock();
