#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
fail=0
# Typecheck every unit that ships a tsconfig: modules, sources, packages, and
# these build scripts. Sources previously had NO tsconfig and were never
# typechecked — that gap hid real type errors (and the lifecycle bug).
for t in plugins/modules/*/tsconfig.json \
         plugins/sources/*/tsconfig.json \
         packages/*/tsconfig.json \
         scripts/tsconfig.json; do
  [ -f "$t" ] || continue
  echo "tsc: $t"
  bunx tsc -p "$t" || fail=1
done
exit $fail
