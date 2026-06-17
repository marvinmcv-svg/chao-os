/**
 * scripts/smoke-portal.ts
 *
 * End-to-end smoke test for PortalService against the REAL local DB.
 *
 * What it does:
 *   1. Loads env from .env.test (real DB connection, not mocks)
 *   2. Creates test data: a Client with portal access, a Project, and
 *      a Phase / Milestone / Invoice / Document to exercise the relations
 *   3. Calls PortalService.authenticate() — happy path + 4 failure cases
 *   4. Calls PortalService.getProjectForClient() — happy path + 3 failure cases
 *   5. Verifies the portalLastLogin side effect
 *   6. Cleans up all test data (idempotent — safe to re-run)
 *
 * Run from the project root with:
 *   npx tsx scripts/smoke-portal.ts
 *
 * Requires:
 *   - .env.test in the project root (auto-loaded)
 *   - chao-pg Docker container running on localhost:5432
 *   - chao_os_test DB migrated (run `npm run test:db:push` first)
 *   - At least one User with role ADMIN (run `npm run db:seed` first
 *     against the test DB, or copy seed data over)
 *
 * Exit code: 0 on full success, 1 on any failure.
 */

// ─── 1. Top-level: Node built-ins only + env loader ──────────────────────
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Minimal .env parser. Loads KEY=VALUE pairs into process.env if not
 * already set. Handles quoted values and `#` comments. No deps.
 */
function loadEnvFile(filepath: string): void {
  if (!existsSync(filepath)) {
    throw new Error(`.env file not found: ${filepath}`)
  }
  const content = readFileSync(filepath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue
    let value = rawValue.trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env.test'))

// ─── 2. main() with try/finally for guaranteed prisma disconnect ─────────
async function main(): Promise<void> {
  // prisma is declared outside try so finally can always reach it.
  // The `any` type is intentional — prisma's types depend on generated
  // client and we want this script to work even if types are stale.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any = null

  try {
    // Dynamic imports — must run AFTER loadEnvFile so prisma picks up
    // the right DATABASE_URL. Hoisted top-level imports would run
    // before our env loader.
    const prismaMod = await import('@/lib/prisma')
    prisma = prismaMod.prisma

    const { generatePortalToken } = await import('@/lib/portal-auth')
    const { PortalService } = await import('@/services/PortalService')
    const { UnauthorizedError } = await import('@/lib/require-auth')
    const {
      ValidationError,
      ForbiddenError,
      NotFoundError,
    } = await import('@/lib/result')
    const {
      UserRole,
      ClientType,
      ProjectType,
      ContractType,
      ProjectPhase,
      PhaseStatus,
      InvoiceStatus,
      DocumentStatus,
    } = await import('@prisma/client')

    // ─── 3. Test fixture tracking ────────────────────────────────────────
    const TEST_TAG = `smoke-${Date.now()}`
    const TEST_CLIENT_EMAIL = `${TEST_TAG}@example.com`
    const TEST_PROJECT_CODE = `SMOKE-${Date.now()}`

    // Track which entities we successfully created so cleanup is idempotent
    const created = {
      client: false,
      project: false,
      phase: false,
      milestone: false,
      invoice: false,
      document: false,
    }

    const cleanup = async (): Promise<void> => {
      console.log('\n--- CLEANUP ---')
      try {
        // Order: leaf entities first, then project, then client.
        // Schema cascades handle most, but Invoice has no cascade from
        // Project, so we explicitly delete it.
        if (created.document) {
          const n = await prisma.document.deleteMany({
            where: { project: { code: TEST_PROJECT_CODE } },
          })
          console.log(`  documents deleted: ${n.count}`)
        }
        if (created.invoice) {
          const n = await prisma.invoice.deleteMany({
            where: { project: { code: TEST_PROJECT_CODE } },
          })
          console.log(`  invoices deleted: ${n.count}`)
        }
        // Milestones and Phases cascade from Project
        if (created.project) {
          const n = await prisma.project.deleteMany({
            where: { code: TEST_PROJECT_CODE },
          })
          console.log(`  projects deleted: ${n.count} (cascades phases + milestones)`)
        }
        if (created.client) {
          const n = await prisma.client.deleteMany({
            where: { email: TEST_CLIENT_EMAIL },
          })
          console.log(`  clients deleted: ${n.count}`)
        }
      } catch (err) {
        console.error('  cleanup error (non-fatal):', err)
      }
    }

    // ─── 4. Test helpers ────────────────────────────────────────────────
    let assertionFailures = 0

    // Use `any` for the ErrorClass param to accept constructors with
    // different signatures (e.g. ValidationError takes (msg, field?)).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expectThrowAsync = async (
      fn: () => Promise<unknown>,
      ErrorClass: new (...args: any[]) => Error,
      label: string,
    ): Promise<void> => {
      try {
        await fn()
        console.log(`  FAIL [${label}]: expected ${ErrorClass.name} but did not throw`)
        assertionFailures++
      } catch (err) {
        if (err instanceof ErrorClass) {
          console.log(`  PASS [${label}]: threw ${ErrorClass.name}`)
        } else {
          const actualName = err instanceof Error ? err.constructor.name : typeof err
          console.log(
            `  FAIL [${label}]: expected ${ErrorClass.name}, got ${actualName}: ${err}`,
          )
          assertionFailures++
        }
      }
    }

    const assert = (cond: boolean, msg: string): void => {
      if (!cond) {
        console.log(`  FAIL: ${msg}`)
        assertionFailures++
      }
    }

    // ─── 5. Test flow ───────────────────────────────────────────────────
    console.log('=== PortalService smoke test ===')
    const dbUrl = process.env.DATABASE_URL || '(not set!)'
    const masked = dbUrl.replace(/:[^:@]+@/, ':***@')
    console.log('Database:', masked)

    // 5.1 Find a project manager
    console.log('\n[1/8] Finding a project manager user (role=ADMIN)...')
    const pm = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } })
    if (!pm) {
      throw new Error(
        'No ADMIN user in test DB. Run `npm run db:seed` first ' +
          'against the test DB (cross-env DATABASE_URL=...tsx prisma/seed.ts).',
      )
    }
    console.log(`  found PM: ${pm.email} (id=${pm.id})`)

    // 5.2 Generate portal token
    console.log('\n[2/8] Generating portal token...')
    const { raw: rawToken, hash: tokenHash } = generatePortalToken()
    console.log(`  raw length: ${rawToken.length} chars`)
    console.log(`  hash prefix: ${tokenHash.slice(0, 16)}...`)

    // 5.3 Create test client
    console.log('\n[3/8] Creating test client...')
    const client = await prisma.client.create({
      data: {
        name: 'Smoke Test Client',
        company: 'Smoke Co',
        email: TEST_CLIENT_EMAIL,
        phone: '+1-555-0000',
        type: ClientType.PROSPECT,
        portalAccessEnabled: true,
        portalTokenHash: tokenHash,
      },
    })
    created.client = true
    console.log(`  client id: ${client.id}`)

    // 5.4 Create test project
    console.log('\n[4/8] Creating test project...')
    const project = await prisma.project.create({
      data: {
        code: TEST_PROJECT_CODE,
        name: 'Smoke Test Project',
        clientId: client.id,
        projectManagerId: pm.id,
        type: ProjectType.RESIDENTIAL,
        contractType: ContractType.FIXED_FEE,
        currentPhase: ProjectPhase.DD,
        totalBudgetUSD: 100000,
        startDate: new Date(),
        estimatedEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    })
    created.project = true
    console.log(`  project id: ${project.id} (code=${project.code})`)

    // 5.5 Create test relations
    console.log('\n[5/8] Creating test relations (phase, milestone, invoice, document)...')
    const phase = await prisma.phase.create({
      data: {
        projectId: project.id,
        phase: ProjectPhase.SD,
        label: 'Schematic Design',
        budgetUSD: 10000,
        progressPercent: 100,
        status: PhaseStatus.COMPLETE,
      },
    })
    created.phase = true
    console.log(`  phase: ${phase.id}`)

    const milestone = await prisma.milestone.create({
      data: {
        projectId: project.id,
        phase: ProjectPhase.SD,
        label: 'Client Approval',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'pending',
      },
    })
    created.milestone = true
    console.log(`  milestone: ${milestone.id}`)

    const invoice = await prisma.invoice.create({
      data: {
        number: `INV-SMOKE-${Date.now()}`,
        projectId: project.id,
        clientId: client.id,
        amountUSD: 5000,
        status: InvoiceStatus.SENT,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    created.invoice = true
    console.log(`  invoice: ${invoice.id}`)

    const document = await prisma.document.create({
      data: {
        projectId: project.id,
        filename: 'floor-plan.pdf',
        url: 'https://example.com/floor-plan.pdf',
        status: DocumentStatus.APPROVED,
        uploadedById: pm.id,
      },
    })
    created.document = true
    console.log(`  document: ${document.id}`)

    // 5.6 Authenticate tests
    console.log('\n[6/8] PortalService.authenticate() — happy path...')
    const session = await PortalService.authenticate({
      token: rawToken,
      projectId: project.id,
    })
    console.log(`  session.clientId:   ${session.clientId}`)
    console.log(`  session.clientName: ${session.clientName}`)
    console.log(`  session.company:    ${session.company}`)
    console.log(`  session.projectId:  ${session.projectId}`)

    assert(session.clientId === client.id, 'session.clientId mismatch')
    assert(session.projectId === project.id, 'session.projectId mismatch')
    assert(session.clientName === 'Smoke Test Client', 'session.clientName mismatch')
    assert(session.company === 'Smoke Co', 'session.company mismatch')

    // portalLastLogin side effect
    const updatedClient = await prisma.client.findUnique({ where: { id: client.id } })
    assert(updatedClient?.portalLastLogin != null, 'portalLastLogin was not set')
    if (updatedClient?.portalLastLogin) {
      const secondsAgo = (Date.now() - updatedClient.portalLastLogin.getTime()) / 1000
      assert(secondsAgo <= 5, `portalLastLogin not recent (${secondsAgo.toFixed(1)}s ago)`)
      console.log(`  PASS: portalLastLogin updated ${secondsAgo.toFixed(1)}s ago`)
    }

    console.log('\n[6/8] PortalService.authenticate() — failure cases...')
    await expectThrowAsync(
      () => PortalService.authenticate({ token: undefined, projectId: project.id }),
      ValidationError,
      'missing token',
    )
    await expectThrowAsync(
      () => PortalService.authenticate({ token: rawToken, projectId: undefined }),
      ValidationError,
      'missing projectId',
    )
    await expectThrowAsync(
      () => PortalService.authenticate({ token: 'wrong-token', projectId: project.id }),
      UnauthorizedError,
      'invalid token',
    )
    await expectThrowAsync(
      () =>
        PortalService.authenticate({
          token: rawToken,
          projectId: 'not-this-clients-project',
        }),
      ForbiddenError,
      'project not owned',
    )

    // 5.7 getProjectForClient tests
    console.log('\n[7/8] PortalService.getProjectForClient() — happy path...')
    const data = await PortalService.getProjectForClient({
      token: rawToken,
      projectId: project.id,
    })
    console.log(`  project.id:    ${data.project.id}`)
    console.log(`  project.code:  ${data.project.code}`)
    console.log(`  phases:        ${data.phases.length}`)
    console.log(`  milestones:    ${data.milestones.length}`)
    console.log(`  invoices:      ${data.invoices.length}`)
    console.log(`  documents:     ${data.documents.length}`)

    assert(
      data.project.code === TEST_PROJECT_CODE,
      `project.code expected ${TEST_PROJECT_CODE}, got ${data.project.code}`,
    )
    assert(data.phases.length === 1, `expected 1 phase, got ${data.phases.length}`)
    assert(
      data.milestones.length === 1,
      `expected 1 milestone, got ${data.milestones.length}`,
    )
    assert(
      data.invoices.length === 1,
      `expected 1 invoice, got ${data.invoices.length}`,
    )
    assert(
      data.documents.length === 1,
      `expected 1 document, got ${data.documents.length}`,
    )
    assert(
      data.project.startDate.getTime() === project.startDate.getTime(),
      'project.startDate mismatch',
    )

    console.log('\n[7/8] PortalService.getProjectForClient() — failure cases...')
    await expectThrowAsync(
      () => PortalService.getProjectForClient({ token: undefined, projectId: project.id }),
      UnauthorizedError,
      'missing token',
    )
    await expectThrowAsync(
      () => PortalService.getProjectForClient({ token: 'wrong', projectId: project.id }),
      UnauthorizedError,
      'invalid token',
    )
    await expectThrowAsync(
      () => PortalService.getProjectForClient({ token: rawToken, projectId: 'does-not-exist' }),
      NotFoundError,
      'project not found',
    )

    // 5.8 Done
    console.log('\n[8/8] Summary')
    await cleanup()
    if (assertionFailures > 0) {
      throw new Error(`${assertionFailures} assertion(s) failed`)
    }
    console.log('=== ALL SMOKE TESTS PASSED ===')
  } finally {
    if (prisma) {
      await prisma.$disconnect()
    }
  }
}

// ─── 3. Run with cleanup on success/failure ──────────────────────────────
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n!!! SMOKE TEST FAILED !!!')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
