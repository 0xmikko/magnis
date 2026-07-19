#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
for d in plugins/sources/x plugins/sources/linkedin plugins/sources/google plugins/sources/telegram \
         plugins/sources/mock-x plugins/sources/mock-linkedin plugins/sources/mock-gmail \
         plugins/sources/mock-telegram plugins/sources/local packages/source-statemachine \
         packages/connector-sdk; do
  echo "bun test: $d"
  (cd "$d" && bun test)
done

# @magnis/testkit/source self-test — the bun lane of the testkit package. Run
# ONLY source.test.ts by path: the same dir also holds module.test.ts, which is
# the vitest lane (imports `vitest`) and must not be swept up by `bun test`.
echo "bun test: packages/testkit/__tests__/source.test.ts"
(cd packages/testkit && bun test __tests__/source.test.ts)
