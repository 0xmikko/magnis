#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
for d in plugins/sources/x plugins/sources/linkedin plugins/sources/google plugins/sources/telegram \
         plugins/sources/mock-x plugins/sources/mock-linkedin plugins/sources/mock-gmail \
         plugins/sources/mock-telegram plugins/sources/local plugins/sources/_statemachine \
         packages/connector-sdk; do
  echo "bun test: $d"
  (cd "$d" && bun test)
done
