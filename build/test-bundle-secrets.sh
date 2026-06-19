#!/usr/bin/env bash
# tst_build_secrets_001 (INV-11): bundle-secrets.sh must fail loudly when a
# required baked key is missing, and emit a magnis.env containing the required
# keys when the source is complete. No fallbacks / no silent empty creds.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE="$SCRIPT_DIR/bundle-secrets.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail=0

# --- case 1: missing a required key (no TELEGRAM_API_HASH) → non-zero exit ---
cat > "$TMP/incomplete.env" <<'EOF'
GOOGLE_CLIENT_ID=cid
GOOGLE_CLIENT_SECRET=csecret
GOOGLE_REDIRECT_URI=http://localhost:3001/cb
TELEGRAM_API_ID=12345
ANTHROPIC_API_KEY=sk-ant-xxx
EOF
out1="$TMP/out1.env"
if MAGNIS_SECRETS_OUT="$out1" bash "$BUNDLE" "$TMP/incomplete.env" 2>"$TMP/err1"; then
  echo "FAIL: expected non-zero exit for missing TELEGRAM_API_HASH"; fail=1
else
  grep -qi "TELEGRAM_API_HASH" "$TMP/err1" || { echo "FAIL: error must name the missing key"; cat "$TMP/err1"; fail=1; }
  [ -f "$out1" ] && { echo "FAIL: no output file should be written on failure"; fail=1; }
fi

# --- case 2: missing ANY llm key → non-zero exit ---
cat > "$TMP/nollm.env" <<'EOF'
GOOGLE_CLIENT_ID=cid
GOOGLE_CLIENT_SECRET=csecret
GOOGLE_REDIRECT_URI=http://localhost:3001/cb
TELEGRAM_API_ID=12345
TELEGRAM_API_HASH=abcdef
EOF
if MAGNIS_SECRETS_OUT="$TMP/out2.env" bash "$BUNDLE" "$TMP/nollm.env" 2>"$TMP/err2"; then
  echo "FAIL: expected non-zero exit when no LLM key present"; fail=1
fi

# --- case 3: complete source → exit 0 + magnis.env with required keys ---
cat > "$TMP/complete.env" <<'EOF'
GOOGLE_CLIENT_ID=cid
GOOGLE_CLIENT_SECRET=csecret
GOOGLE_REDIRECT_URI=http://localhost:3001/cb
TELEGRAM_API_ID=12345
TELEGRAM_API_HASH=abcdef
ANTHROPIC_API_KEY=sk-ant-xxx
DEFAULT_ENGINE=claude
UNRELATED_KEY=should_not_leak
EOF
out3="$TMP/out3.env"
if MAGNIS_SECRETS_OUT="$out3" bash "$BUNDLE" "$TMP/complete.env" 2>"$TMP/err3"; then
  for k in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REDIRECT_URI TELEGRAM_API_ID TELEGRAM_API_HASH ANTHROPIC_API_KEY DEFAULT_ENGINE; do
    grep -q "^$k=" "$out3" || { echo "FAIL: magnis.env missing $k"; fail=1; }
  done
  grep -q "UNRELATED_KEY" "$out3" && { echo "FAIL: unrelated key leaked into magnis.env"; fail=1; }
else
  echo "FAIL: complete source should exit 0"; cat "$TMP/err3"; fail=1
fi

if [ "$fail" -eq 0 ]; then echo "tst_build_secrets_001: PASS"; else echo "tst_build_secrets_001: FAIL"; fi
exit "$fail"
