# CHAO OS — Roadmap to Continue the Operating System

**Date:** June 12, 2026
**Baseline:** Smoke test passed (build OK, 12/12 endpoints live, 2 bugs fixed, 2 bugs identified)
**Stack confirmed:** Next.js 14.2.35 (App Router) · React 18.3 · NextAuth v5 beta · Prisma 5.22 + PostgreSQL 16 · TypeScript 5.6 · Tailwind 3.4 · Claude API (claude-sonnet-4-6)

---

## TL;DR — Estado actual

✅ **Lo que funciona (Tier 1 verificado):**
- Build de producción pasa (47+ rutas, 30s)
- 12/12 endpoints autenticados devuelven datos reales
- Login con credenciales → cookie de sesión funcional
- Seed completo: 7 users, 7 clients, 7 proyectos, 28 phases, 8 leads, 5 invoices
- PostgreSQL vía Docker en marcha

🟡 **Lo que está al 60-80% y necesita endurecimiento:**
- AI Layer (Sprint 6) — implementado pero sin tests
- Email / PWA / CI — implementados pero no desplegados

🔴 **Lo que falta o está roto:**
- Bug #3: Middleware redirige API a login HTML (sin JSON 401)
- Zero tests
- Sin service layer (lógica en routes)
- Sin paginación en la mayoría de GETs
- Sin transacciones Prisma en operaciones multi-write

---

## Roadmap propuesto (5 sprints, 8-12 semanas)

### 🚨 SPRINT 0 — Hardening & Bugfixes (1 semana) — **HACER PRIMERO**

| # | Tarea | Esfuerzo | Por qué |
|---|-------|----------|---------|
| 0.1 | Fix middleware para devolver 401 JSON en `/api/*` sin sesión | 1h | Bug #3 — bloquea clientes API |
| 0.2 | Extraer `requireAuth()` helper (DRY) — reemplazar 30+ duplicados | 2h | Mantenibilidad |
| 0.3 | Crear tipo `ApiResponse<T>` + helper `withApiHandler()` | 3h | Type-safety + DRY |
| 0.4 | Wrapping transacciones Prisma en `convert/route.ts` (lead → project) | 2h | Atomicidad — evitar estado parcial |
| 0.5 | Wrapping transacciones en `invoices/status/route.ts` (status + notification) | 1h | Atomicidad |
| 0.6 | Optimizar N+1 en `studio/capacity/route.ts` → 1 query con GROUP BY | 1h | Performance con >50 team members |
| 0.7 | Configurar zona horaria `America/La_Paz` en `lib/time-util.ts` (ya existe) y usarla en KPIs/capacity | 2h | Correctness de fechas |
| 0.8 | Añadir `.env.test` + `package.json` script `test:db:reset` | 1h | Setup para tests |
| 0.9 | Validar `public/icons/icon.svg` no se rompa en build de producción | 0.5h | Polish |

**Entregable:** Zero bugs críticos, código más limpio, listo para tests.

---

### 🧪 SPRINT 1 — Test Harness + Critical Coverage (1.5 semanas)

**Stack de tests:** Vitest (unit) + Playwright (E2E) + supertest-like for API

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 1.1 | Configurar Vitest + `@testing-library/react` + happy-dom | 3h |
| 1.2 | Configurar Playwright con `playwright.config.ts` + Docker postgres fixture | 3h |
| 1.3 | Test harness de Prisma: `tests/helpers/db.ts` con reset+migrate+seed | 2h |
| 1.4 | **Unit tests** para `lib/claude.ts` (mock fetch) — scoreLead, generateProposalDraft, retry logic | 4h |
| 1.5 | **Unit tests** para `lib/portal-auth.ts` — token generation, hashing, roundtrip | 1h |
| 1.6 | **Unit tests** para `lib/ratelimit.ts` — 5 attempts then block | 1h |
| 1.7 | **Unit tests** para `lib/validations.ts` — cada schema, casos válidos + inválidos | 2h |
| 1.8 | **API integration tests** para `/api/projects` — CRUD + auth + pagination | 4h |
| 1.9 | **API integration tests** para `/api/leads/[id]/convert` — happy path + state errors | 3h |
| 1.10 | **API integration tests** para `/api/invoices/[id]/status` — payments validation, OVERDUE auto-detect | 3h |
| 1.11 | **E2E test** del flujo login → dashboard → click proyecto → ver detalle | 4h |
| 1.12 | **E2E test** del flujo create lead → move Kanban → convert to project | 4h |
| 1.13 | Setup GitHub Actions CI: install → typecheck → lint → test → build | 3h |
| 1.14 | Coverage gate: ≥70% en `lib/**`, ≥50% en `app/api/**` | 1h |

**Entregable:** CI verde en cada PR, ~70% de cobertura en código crítico, no más regresiones silenciosas.

---

### 🏗️ SPRINT 2 — Service Layer + Architecture Refactor (2 semanas)

**Objetivo:** Sacar lógica de negocio de los route handlers para que sean testables sin HTTP.

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 2.1 | Crear `services/ProjectService.ts` — `create()`, `update()`, `advancePhase()`, `assignTeam()` | 6h |
| 2.2 | Crear `services/LeadService.ts` — `create()`, `updateStage()`, `convertToProject()` (con tx) | 6h |
| 2.3 | Crear `services/InvoiceService.ts` — `create()`, `updateStatus()` (con tx + notification), `recordPayment()` | 6h |
| 2.4 | Crear `services/TimeEntryService.ts` — `create()` (recalc util), `delete()` (rollback) | 3h |
| 2.5 | Crear `services/NotificationService.ts` — `createManyForRole()`, `markAllRead()` | 2h |
| 2.6 | Crear `services/StudioService.ts` — `getCapacityGrid()` (1 query, no N+1) | 3h |
| 2.7 | Crear `services/PortalService.ts` — `authenticate()`, `getProjectForClient()` | 2h |
| 2.8 | Refactor de los 41 route handlers para usar los services (cero lógica) | 8h |
| 2.9 | Añadir unit tests para cada service (mock Prisma) | 6h |
| 2.10 | Crear `lib/result.ts` con `Result<T, E>` para errores de dominio tipados | 2h |

**Entregable:** Route handlers de ~10 líneas (auth + parse + service call + response). Lógica de negocio reutilizable y testeable.

---

### ⚡ SPRINT 3 — Performance, Observability & Production-Readiness (2 semanas)

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 3.1 | Integrar Sentry (o GlitchTip) para error tracking client + server | 3h |
| 3.2 | Structured logging con `pino` + request IDs (middleware) | 4h |
| 3.3 | Rate limiting real con Upstash Redis (reemplazar in-memory `lib/ratelimit.ts`) | 3h |
| 3.4 | Caché con TanStack Query: `staleTime`, `gcTime`, `refetchOnWindowFocus` | 4h |
| 3.5 | Caché server-side con `unstable_cache` para KPIs y dashboard | 3h |
| 3.6 | Indexar DB: revisar EXPLAIN de las 5 queries más usadas, añadir índices | 4h |
| 3.7 | Paginación cursor-based en `/api/leads`, `/api/invoices`, `/api/clients` | 4h |
| 3.8 | Background jobs (cron-like) para OVERDUE detection y budget alerts | 6h |
| 3.9 | Health check endpoint `/api/health` (db + claude + s3 + resend) | 2h |
| 3.10 | Documentar OpenAPI spec desde Zod schemas con `zod-to-openapi` | 4h |
| 3.11 | PWA real: service worker con Workbox, offline page, push notifications | 6h |
| 3.12 | Real PNG icons (192×192, 512×512) + apple-touch-icon | 1h |
| 3.13 | Docker Compose para dev: postgres + redis + mailhog (email testing) | 3h |

**Entregable:** App lista para producción con monitoring, caching, y backpressure handling.

---

### 🧠 SPRINT 4 — AI Hardening & Integrations (2 semanas)

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 4.1 | Cache de respuestas Claude por hash del prompt (Redis) — ahorra costos | 4h |
| 4.2 | Streaming tokens a UI: usar `useChat` de `ai-sdk` o custom hook con abort | 4h |
| 4.3 | Tool use: permitir a Claude invocar queries Prisma (read-only) | 8h |
| 4.4 | Proposal drafter: usar template engine (`@handlebars/handlebars`) con placeholders del proyecto | 4h |
| 4.5 | Integración QuickBooks Online: OAuth + sync invoices + payments | 12h |
| 4.6 | Integración S3/R2 con upload multipart para archivos >50MB | 4h |
| 4.7 | Email templates en MJML o react-email (más mantenibles que HTML strings) | 4h |
| 4.8 | Búsqueda full-text con Postgres `tsvector` (proyectos, leads, clientes) | 6h |
| 4.9 | Audit log UI (admin) — ver quién hizo qué y cuándo | 4h |
| 4.10 | GDPR/LGPD compliance: export user data, delete account, cookie consent | 8h |

**Entregable:** AI que responde más rápido y más barato, integraciones reales, búsqueda, compliance.

---

### 📱 SPRINT 5 — Mobile, E2E, Beta Launch (2-3 semanas)

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 5.1 | Mobile-first responsive: revisar 7 vistas con Playwright en viewports | 8h |
| 5.2 | Onboarding tour (primera vez): driver.js o shepherd.js | 4h |
| 5.3 | Notificaciones por email configurables (user preferences) | 4h |
| 5.4 | i18n con `next-intl` (es-BO, en-US) | 6h |
| 5.5 | Modo cliente (multi-tenant) — schema con `firmId` | 12h |
| 5.6 | Modo claro/oscuro (toggle) — actualmente hardcoded a dark | 4h |
| 5.7 | Storybook para componentes UI | 4h |
| 5.8 | E2E suite completo: 20+ escenarios críticos | 8h |
| 5.9 | Performance audit: Lighthouse ≥90 en desktop y mobile | 4h |
| 5.10 | Security audit: dependency check, OWASP top 10, penetration test | 6h |
| 5.11 | Beta con 3 estudios de arquitectura reales (Santa Cruz) | ongoing |
| 5.12 | Landing page + onboarding público (signup form) | 8h |

**Entregable:** Beta público, multi-cliente, mobile-friendly, en producción real.

---

## Backlog priorizado (próximos 90 días)

### 🔴 P0 — Hacer en Sprint 0
- [ ] Fix middleware (Bug #3) — 1h
- [ ] Transacciones Prisma en convert/status — 3h
- [ ] `requireAuth()` helper — 2h

### 🟠 P1 — Sprint 1-2
- [ ] Vitest + Playwright setup
- [ ] Service layer extraction
- [ ] 70% test coverage
- [ ] CI en GitHub Actions

### 🟡 P2 — Sprint 3-4
- [ ] Sentry + structured logs
- [ ] Redis rate limiting
- [ ] Claude prompt caching
- [ ] QuickBooks integration
- [ ] Background jobs (overdue, alerts)

### 🟢 P3 — Sprint 5+
- [ ] Mobile responsive audit
- [ ] i18n es-BO / en-US
- [ ] Multi-tenant mode
- [ ] Light mode toggle
- [ ] Storybook

### ⚪ P4 — Backlog
- [ ] Native iOS/Android (React Native o Capacitor)
- [ ] AutoCAD/Revit plugin
- [ ] E-signature on contracts
- [ ] Public marketing site

---

## Quick wins (≤2h cada uno, alto valor)

1. **Fix Bug #3** (middleware 401 JSON) — 1h, alta calidad
2. **`requireAuth()` helper** — 2h, ahorra 30+ duplicaciones
3. **Add request IDs to logs** — 1h, debugging 10× más fácil
4. **`.env.test` + `npm run test:db:reset`** — 1h, unlock tests
5. **Real PNG icons para PWA** — 0.5h, "Add to Home Screen" sin warnings
6. **Add `npm run db:reset`** (drop + push + seed) — 0.5h, dev experience
7. **Add a "Demo data" banner en dev** — 1h, ahorra preguntas

---

## Decisiones pendientes

| Tema | Recomendación | Esfuerzo |
|------|---------------|----------|
| ORM Cache (Prisma Accelerate) vs sin cache | Empezar sin cache, añadir si >1000 req/min | n/a |
| Sentry vs GlitchTip (self-hosted) | GlitchTip por costo, mismo API | 3h |
| Pusher vs Ably vs self-hosted SSE | SSE ya funciona, mantener | 0h |
| NextAuth v5 stable vs beta | Esperar estable, pero v5 beta funciona | 0h |
| Multi-tenant DB strategy | Schema-per-tenant si >50 clientes, shared schema si <50 | 12h |
| Vercel vs Railway para deploy | Railway ya elegido (migraron desde Vercel por bcrypt) | n/a |
| Self-host AI vs Anthropic API | API por ahora, evaluar self-host si >$5K/mes | n/a |

---

## Riesgos identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Sprint 0 sin hacer → regresiones al añadir features | Alta | Alto | Hacer Sprint 0 antes de cualquier feature nuevo |
| 0 tests → miedo a refactorizar | Alta | Alto | Sprint 1 prioritario |
| NextAuth v5 beta breaking changes | Media | Alto | Pin version, monitorear releases |
| Prisma N+1 con datos reales | Media | Medio | Sprint 3.6 (índices + monitoring) |
| Costo de Claude API en producción | Media | Alto | Sprint 4.1 (caching) + rate limits |
| Datos sensibles (PII) y AI | Baja | Alto | Revisar qué datos van a Claude |
| Multi-tenant retrofit costoso | Alta | Alto | Decidir Sprint 5 si van multi-tenant |

---

## Métricas de éxito (90 días)

- ✅ 0 bugs P0 en producción
- ✅ 70%+ test coverage
- ✅ <200ms p95 latency en /api/dashboard/*
- ✅ <500ms p95 latency en /api/projects
- ✅ Lighthouse score ≥90 mobile y desktop
- ✅ Zero console.errors en flujos críticos
- ✅ 3 estudios beta activos con feedback weekly
- ✅ CI build <5min, deploy <2min

---

## Próximo paso concreto (ahora)

**Sprint 0, tarea 0.1**: Fix middleware para devolver 401 JSON en `/api/*` sin sesión.

```typescript
// middleware.ts — añadir después de isApiAuthRoute check
const isApiRoute = req.nextUrl.pathname.startsWith('/api/')
if (!isLoggedIn && isApiRoute) {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
    { status: 401 }
  )
}
```

Eso + commit + push + continuar con 0.2 (`requireAuth()` helper).

---

*Roadmap actualizado: June 12, 2026 — smoke test baseline*
