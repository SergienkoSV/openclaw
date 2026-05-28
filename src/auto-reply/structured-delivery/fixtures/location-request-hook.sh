#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"

case "${OPENCLAW_STRUCTURED_DELIVERY_TEST_MODE:-}" in
  fail)
    printf 'fixture location request failed\n' >&2
    exit 17
    ;;
  sleep)
    sleep 2
    ;;
esac

if [[ -n "${OPENCLAW_STRUCTURED_DELIVERY_TEST_OUTPUT:-}" ]]; then
  printf '%s\n' "$payload" >"$OPENCLAW_STRUCTURED_DELIVERY_TEST_OUTPUT"
fi
