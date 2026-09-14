#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# @tested-by: tst_scripts_tgflood_001 — exact targets, filters and child exit codes.
if [[ "${1:-}" == "--agent" ]]; then
  shift
  engine=""
  option_value=0
  for argument in "$@"; do
    if [[ "$option_value" == 1 ]]; then
      option_value=0
      continue
    fi
    case "$argument" in
      -t|--test-name-pattern|--timeout) option_value=1; continue ;;
      -*) continue ;;
    esac
    if [[ ! "$argument" =~ \.test\.tsx?$ || ! -f "$argument" ]]; then
      echo "Unsupported test target: $argument (supply an existing exact test file)." >&2
      exit 64
    fi
    if grep -Eq "[\"']bun:test[\"']" "$argument"; then
      selected="bun"
    else
      case "$argument" in
        plugins/modules/*/module/*.test.ts|plugins/modules/*/ui/*/sourceStatusAdapter.test.ts|packages/plugin-sdk/__tests__/*.test.ts|packages/testkit/__tests__/module.test.ts)
          selected="vitest" ;;
        *) echo "Unsupported backend lane: $argument; use its owning agent:test adapter." >&2; exit 64 ;;
      esac
    fi
    if [[ -n "$engine" && "$engine" != "$selected" ]]; then
      echo "Mixed Bun/Vitest targets are not supported; run each lane explicitly." >&2
      exit 64
    fi
    engine="$selected"
  done
  if [[ "$option_value" == 1 ]]; then
    echo "Missing test filter/timeout value." >&2
    exit 64
  fi
  if [[ "$engine" == "bun" ]]; then exec bun test "$@"; fi
  exec bunx vitest run "$@"
fi

for d in plugins/sources/x plugins/sources/anysite plugins/sources/google plugins/sources/telegram \
         plugins/sources/mock-x plugins/sources/mock-linkedin plugins/sources/mock-gmail \
         plugins/sources/mock-telegram plugins/sources/local packages/source-statemachine \
         packages/connector-sdk; do
  echo "bun test: $d"
  (cd "$d" && bun test)
done

# @magnis/testkit Source/certification self-tests — the bun lane of the testkit
# package. Keep exact paths: the same dir also holds module.test.ts, which is the
# vitest lane (imports `vitest`) and must not be swept up by `bun test`.
echo "bun test: packages/testkit Source/certification gates"
(cd packages/testkit && bun test \
  __tests__/source.test.ts \
  __tests__/tst_cat_src_cert_001.test.ts \
  __tests__/tst_cat_src_parity_001.test.ts)
