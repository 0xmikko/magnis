#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
fail=0
for t in plugins/modules/*/tsconfig.json; do
  echo "tsc: $t"
  bunx tsc -p "$t" || fail=1
done
exit $fail
