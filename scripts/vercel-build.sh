#!/usr/bin/env bash
# Vercel build entrypoint (package.json "vercel-build").
#  1. Resolve the database URL (DATABASE_URL, else the Neon integration's vars)
#  2. Sync the Prisma schema to the database (non-destructive: `db push`
#     refuses changes that would drop data)
#  3. Seed demo data ONLY when the database has no users yet — redeploys
#     never wipe real data
#  4. Recompute derived project costs (timesheets × rate + expenses)
#  5. next build
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="${NEON_POSTGRES_PRISMA_URL:-${NEON_DATABASE_URL:-}}"
fi
# Schema changes need a direct (unpooled) connection
MIGRATE_URL="${NEON_DATABASE_URL_UNPOOLED:-${NEON_POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}"

npx prisma generate

if [ -n "$MIGRATE_URL" ]; then
  echo "▶ Syncing database schema"
  DATABASE_URL="$MIGRATE_URL" npx prisma db push --skip-generate
  USERS=$(DATABASE_URL="$MIGRATE_URL" node scripts/count-users.cjs)
  if [ "$USERS" = "0" ]; then
    echo "▶ Empty database — loading demo data"
    DATABASE_URL="$MIGRATE_URL" npx tsx prisma/seed.ts
  else
    echo "▶ Database has $USERS users — skipping seed"
  fi
  # Derived project cost (idempotent). Never blocks a deploy: the next
  # timesheet/expense change or deploy recomputes again.
  DATABASE_URL="$MIGRATE_URL" npx tsx scripts/recompute-costs.ts || echo "⚠ Cost backfill failed — continuing"
else
  echo "⚠ No database URL configured — skipping schema sync"
fi

npx next build
