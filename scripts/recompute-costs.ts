/**
 * Deploy-time cost backfill (idempotent). Snapshots cost rates on legacy
 * time entries and recomputes every project's derived cost. The first run
 * turns the old manual figures into opening balances (no jump in totals).
 *
 *   npx tsx scripts/recompute-costs.ts
 */
import { CostService } from '../services/CostService'
import { prisma } from '../lib/prisma'

CostService.backfill()
  .then((r) => {
    console.log(`▶ Costs: ${r.projects} projects recomputed (${r.migrated} migrated to derived cost), ${r.snapshotted} time entries rate-snapshotted`)
  })
  .catch((e) => {
    console.error('✗ Cost backfill failed', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
