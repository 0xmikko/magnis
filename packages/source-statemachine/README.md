# @magnis/source-statemachine

The auth/sync state machine shared by source connectors. It models the connector lifecycle the host drives — the `magnis.auth.begin/step/exchange/revoke` ceremony (oauth2, phone_code, api_key) and the sync phases around it — so each connector implements provider specifics, not flow control.

Exercised end-to-end by the `mock-statemachine-*` dev sources, which cover each auth flavor in tests. Entry point: `src/index.ts`.
