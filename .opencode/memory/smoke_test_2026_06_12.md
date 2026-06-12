# Smoke Test Re-Run — June 12, 2026

## Environment
- **OS:** Windows 11, PowerShell 5.1
- **Node:** v24.16.0
- **npm:** 11.13.0
- **PostgreSQL:** Not local — used Docker `postgres:16-alpine` container (`chao-pg`)
- **Docker:** 29.5.2

## Setup Steps Verified
1. `git clone https://github.com/marvinmcv-svg/chao-os.git chao-os` ✅
2. `npm install` ✅ (526 packages, ~3 min)
3. `npx prisma generate` ✅ (v5.22.0)
4. `docker run postgres:16-alpine` ✅ (started in 8s)
5. Edit `.env`: real `DATABASE_URL`, real `NEXTAUTH_SECRET` (32+ chars)
6. `npx prisma db push --accept-data-loss` ✅ (1.56s)
7. `npm run db:seed` ✅ (after fix — see Bug #1)
8. `npm run build` ✅ (after fix — see Bug #2)
9. `npm run dev` ✅ (Ready in 5.7s)
10. Endpoints smoke test ✅ (12/12 authenticated endpoints returned 200)

## Bugs Found

### Bug #1 — `prisma/seed.ts` missing `title` on Notification creates
**File:** `prisma/seed.ts` lines 1066-1101
**Symptom:** `Argument 'title' is missing` on `prisma.notification.create()` — seed crashes after creating 5 time entries.
**Root cause:** In Sprint 7, `title` was added to the `Notification` model in `schema.prisma` (line 502: `title     String`). The seed file was not updated. All 4 `notification.create()` calls lack the required `title` field.
**Severity:** 🔴 Blocker (seed crashes, no demo data)
**Fix:** Added `title: '<es label>'` to all 4 notification creates:
- `BUDGET_ALERT` → "Alerta de presupuesto"
- `OVERDUE_INVOICE` → "Factura vencida"
- `CAPACITY_ALERT` → "Capacidad del equipo"
- `DEADLINE_APPROACHING` → "Hito próximo a vencer"

### Bug #2 — `package.json` build script fails on Windows
**File:** `package.json` line 7
**Symptom:** `! Unknown command "generate;"` from Prisma CLI
**Root cause:** `"build": "prisma generate; next build"` — npm uses `cmd.exe` on Windows, where `;` is **not** a command separator. The entire string `prisma generate; next build` is passed as one argument to Prisma, which doesn't know the command `generate;`.
**Severity:** 🔴 Blocker (cannot build on Windows)
**Fix:** Replaced with the standard npm `prebuild` pattern:
```json
"prebuild": "prisma generate",
"build": "next build"
```
**Bonus:** This is also POSIX-safe and more idiomatic.

### Bug #3 — Middleware redirects API routes to login HTML (unauthenticated)
**File:** `middleware.ts` line 21
**Symptom:** `GET /api/projects` (no session) returns `200 OK` with `text/html` (9057 bytes = login page). API clients expecting JSON get HTML.
**Root cause:** The middleware redirects ALL non-auth paths to `/login`, including `/api/*` routes (except `/api/auth/*`). API calls should return `401 Unauthorized` with `{"error": "Unauthorized"}` JSON, not a 307 to an HTML page.
**Severity:** 🟠 High (breaks API consumers, confusing for SDK/test clients)
**Fix:** Add API detection in middleware. Suggested:
```typescript
const isApiRoute = req.nextUrl.pathname.startsWith('/api/')
if (!isLoggedIn && isApiRoute) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
if (!isLoginPage && !isLoggedIn && !isPublicRoute) {
  return NextResponse.redirect(new URL('/login', req.url))
}
```
**Status:** 🟡 NOT YET FIXED — captured in roadmap

### Bug #4 — Login page slow first compile (~20s in dev)
**File:** `app/login/page.tsx` + `app/(dashboard)/layout.tsx`
**Symptom:** First `GET /login` takes 15-20s in dev (subsequent calls ~100ms).
**Root cause:** Normal Next.js dev mode behavior — first request triggers JIT compilation. Production build is fast (~5.7s startup, login route builds to 2.38 kB).
**Severity:** 🟢 Low (dev-only, not user-facing in prod)
**Fix:** None required. Could be improved by pre-warming routes or using a static export for login.

## Runtime Verification (Tier 1)

### Public routes
- `GET /login` → 200, `text/html` (9057 bytes) — ✅

### Unauthenticated API (Bug #3 confirmed)
- `GET /api/projects` → 200, `text/html` (9057 bytes) — 🐛 should be 401 JSON
- `GET /api/dashboard/kpis` → 200, `text/html` (9057 bytes) — 🐛 should be 401 JSON
- `GET /api/auth/session` → 200, JSON `null` — ✅ correct (auth routes allowed)

### Authenticated API (12/12 pass)
- `GET /api/auth/csrf` → 200 (CSRF token) ✅
- `POST /api/auth/callback/credentials` → 200 (sets `chao-session` cookie) ✅
- `GET /api/auth/session` → 200 (full user object) ✅
- `GET /api/projects` → 200, 12559 bytes (7 projects) ✅
- `GET /api/dashboard/kpis` → 200, 190B (`{activeProjects: 7, pipelineWeightedValue: 833650, ...}`) ✅
- `GET /api/dashboard/alerts` → 200, 581B (1 OVERDUE_INVOICE alert) ✅
- `GET /api/dashboard/activity` → 200, 5824B ✅
- `GET /api/leads` → 200, 6858B (8 leads) ✅
- `GET /api/leads/funnel` → 200, 725B ✅
- `GET /api/clients` → 200, 2819B (7 clients) ✅
- `GET /api/team` → 200, 2359B ✅
- `GET /api/studio/capacity` → 200, 1967B ✅
- `GET /api/finance/pnl` → 200, 1283B ✅
- `GET /api/finance/cashflow` → 200, 651B ✅
- `GET /api/invoices` → 200, 4218B (5 invoices) ✅
- `GET /api/notifications` → 200 (`{notifications:[], unreadCount:0}` for admin) ✅

## Build Output
- 41 API routes compiled
- 8 pages compiled (bd, dashboard, finance, login, portal, projects, settings, studio)
- Middleware: 104 kB
- Build time: ~30s
- First Load JS shared: 87.5 kB

## Files Modified (uncommitted, NOT pushed)
- `package.json` (3 lines: build script fix)
- `prisma/seed.ts` (4 lines: title field on 4 notifications)
- `package-lock.json` (untracked — generated by `npm install`)

## Recommendations for Next Phase
1. **Fix Bug #3 (middleware)** — high priority, blocks external API consumers
2. **Add Vitest/Jest test harness** — current code has zero tests
3. **Add CI typecheck + lint** — `.github/workflows/ci.yml` exists but is placeholder
4. **Add real PNG icons** for PWA (currently uses SVG placeholder)
5. **Configure Puppeteer Chromium install** for production PDF generation
6. **Add AI integration tests** with mocked Claude API responses
