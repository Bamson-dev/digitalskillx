#!/usr/bin/env bash
# Hit Digitalskillx Paystack external backfill (Coolify scheduled task / host cron).
# Usage (on VPS or any runner with network to production):
#   export CRON_SECRET=...
#   ./scripts/cron-paystack-external-backfill.sh
set -euo pipefail

BASE_URL=${BASE_URL:-https://www.digitalskillx.com}
if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "CRON_SECRET is required" >&2
  exit 1
fi

curl -fsS -m 55 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${BASE_URL%/}/api/cron/paystack-external-backfill"
echo
