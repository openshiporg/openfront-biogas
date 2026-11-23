#!/usr/bin/env bash
# npm run verify: typecheck, lint, then every test against a real, migrated Postgres schema.
# The database suites must RUN; a skipped suite is a failure here, never a pass.
#
# Database: BIOGAS_TEST_DATABASE_URL if set (must end in ?schema=vitest), otherwise the `vitest`
# schema of scratch_openfront_biogas on the shared scratch Postgres (~/.config/openfront/scratch-db.env).
# The URL is passed inline and never printed.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "== typecheck"; npx --no-install tsc --noEmit -p .
echo "== lint"; npx --no-install eslint --quiet .
echo "== node tests"; node --test tests/*.cjs 2>&1 | grep -E "^# (tests|pass|fail|skipped)"; node --test tests/*.cjs > /dev/null 2>&1

if [ -z "${BIOGAS_TEST_DATABASE_URL:-}" ]; then
  env_file="$HOME/.config/openfront/scratch-db.env"
  if [ ! -f "$env_file" ]; then
    echo "verify: no BIOGAS_TEST_DATABASE_URL and no $env_file; the database tests cannot run." >&2; exit 1
  fi
  set -a; . "$env_file"; set +a
  BIOGAS_TEST_DATABASE_URL="$OPENFRONT_SCRATCH_DB_BASE/scratch_openfront_biogas?schema=vitest"
fi
export BIOGAS_TEST_DATABASE_URL

echo "== migrate test schema"
DATABASE_URL="$BIOGAS_TEST_DATABASE_URL" timeout 180 npx --no-install prisma migrate deploy < /dev/null 2>&1 \
  | grep -v -F "${OPENFRONT_SCRATCH_DB_BASE:-@@none@@}" | grep -v -F "$BIOGAS_TEST_DATABASE_URL" | tail -3

echo "== tests"
out=$(mktemp)
set +e
npx --no-install vitest run --reporter=default 2>&1 | grep -v -F "$BIOGAS_TEST_DATABASE_URL" | tee "$out"
code=${PIPESTATUS[0]}
set -e
if grep -Eq '\b[0-9]+ skipped\b' "$out"; then echo "verify: some tests were skipped; that is a failure." >&2; code=1; fi
rm -f "$out"
exit "$code"
