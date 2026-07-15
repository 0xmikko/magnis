#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
for d in plugins/sources/x plugins/sources/linkedin plugins/sources/google-ts plugins/sources/mock-x plugins/sources/mock-linkedin packages/connector-sdk; do
  echo "bun test: $d"
  (cd "$d" && bun test)
done
