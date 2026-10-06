#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
fail=0
# Typecheck every unit that ships a tsconfig: modules, sources, packages, and
# these build scripts. Sources previously had NO tsconfig and were never
# typechecked — that gap hid real type errors (and the lifecycle bug).
# tsconfig.declarations.json is listed apart from the modules on purpose: it is
# the ONLY project that sees entities.ts, because a module's own tsconfig
# including its declaration would pull zod's types into the module and the UI
# through the very check meant to keep them out.
for t in modules/*/tsconfig.json \
         sources/*/tsconfig.json \
         packages/*/tsconfig.json \
         apps/desktop/build/tsconfig.json \
         tsconfig.declarations.json \
         scripts/tsconfig.json; do
  [ -f "$t" ] || continue
  echo "tsc: $t"
  bunx tsc -p "$t" || fail=1
done
exit $fail
