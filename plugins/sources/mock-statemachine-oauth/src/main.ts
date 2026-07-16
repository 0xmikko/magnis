// StateMock archetype 'oauth' — the shared @magnis/source-statemachine connector
// in an oauth2/poll shape. The shape itself comes from the manifest's
// [spawn] args (--surfaces smo-a,smo-b,smo-c --mode poll); tests add --state-dir to program it.
import { runStateMock } from "@magnis/source-statemachine";

await runStateMock();
