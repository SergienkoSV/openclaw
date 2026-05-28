#!/usr/bin/env bash
set -euo pipefail

case "${OPENCLAW_STRUCTURED_DELIVERY_TEST_MODE:-success}" in
  fail)
    echo "fixture delivery failed" >&2
    exit 17
    ;;
  sleep)
    sleep 2
    exit 0
    ;;
esac

: "${OPENCLAW_STRUCTURED_DELIVERY_TEST_OUTPUT:?missing output path}"
cat > "$OPENCLAW_STRUCTURED_DELIVERY_TEST_OUTPUT"
