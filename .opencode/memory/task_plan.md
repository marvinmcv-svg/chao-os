# CHAO OS — Sprint Roadmap (MASTER PROMPT Phases)

## Quick Reference

### Sprint 1 — Foundation (Weeks 1–2)
Parallel workstreams:
- **A:** Next.js scaffold + Tailwind + package.json
- **B:** Prisma schema (all entities) + seed script
- **C:** Design system tokens (CSS variables) + UI components (Button, Card, Badge, Table, Modal, Input)
- **D:** NextAuth.js config + middleware + login page
- **E:** Sidebar + Topbar + dashboard layout shell
- **F:** Dashboard page (static data, no API yet)

### Sprint 2 — Projects Module (Weeks 3–4)
Parallel workstreams:
- **A:** Project API routes (CRUD + phase update)
- **B:** Project list view + table component
- **C:** Project detail slide-in panel
- **D:** Phase progress bars + budget vs actual
- **E:** New Project modal (React Hook Form + Zod)

### Sprint 3 — Business Development (Weeks 5–6)
Parallel workstreams:
- **A:** Kanban pipeline (@dnd-kit, 5 columns, stage PATCH endpoint)
- **B:** Lead API routes (CRUD + stage + convert-to-project)
- **C:** Lead forms + modals (New Lead, Lead Detail)
- **D:** Contacts table (search, filter, sort)
- **E:** Go/No-Go score UI (score breakdown bars per dimension)

### Sprint 4 — Finance (Weeks 7–8)
Parallel workstreams:
- **A:** Invoice API routes (CRUD + status + send)
- **B:** Invoice list + filters + status badges
- **C:** Invoice PDF generation (TBD: Puppeteer or react-pdf)
- **D:** P&L chart per project + cash flow chart (90-day)
- **E:** Overdue invoice alerts component

### Sprint 5 — Studio + Portal (Weeks 9–10)
Parallel workstreams:
- **A:** Team API routes (CRUD)
- **B:** Capacity grid + utilization bars per team member
- **C:** Time tracking (manual entry + timer, linked to project+phase)
- **D:** Portal layout (white theme, separate route group)
- **E:** Portal project status view + document download

### Sprint 6 — AI Layer (Weeks 11–12)
Parallel workstreams:
- **A:** Claude API client lib (retry, streaming, rate limiting)
- **B:** Go/No-Go scoring endpoint + UI integration
- **C:** Proposal drafting endpoint
- **D:** Chat assistant (SSE streaming)
- **E:** Budget alerts + income forecast

## Phase 0 Blockers to Resolve First
1. NextAuth v5 (edge-compatible) vs v4 (more examples) — recommend v5
2. Portal: same app (route group) vs separate deployment — recommend same app `(portal)` route group
3. PDF: Puppeteer vs react-pdf — TBD, affects Sprint 4
4. Dev DB: Docker PostgreSQL (recommended) vs SQLite parity risk
5. Portal auth: signed URL token — CONFIRMED
6. Lead sortOrder field for Kanban — CONFIRMED add it
7. Claude data privacy review — confirm what data leaves system

## Can-Start-Now (15 atomic tasks — no dependencies)
| # | Task | Output |
|---|------|--------|
| 1 | Design system CSS tokens | `app/globals.css` |
| 2 | Tailwind custom color config | `tailwind.config.js` |
| 3 | Prisma schema (all entities) | `prisma/schema.prisma` |
| 4 | Seed script | `prisma/seed.ts` |
| 5 | NextAuth config skeleton | `lib/auth.ts` |
| 6 | `.env.example` | `.env.example` |
| 7 | Zod validation schemas | `lib/validations.ts` |
| 8 | UI component stubs | `components/ui/{Button,Card,Badge,Table,Modal,Input}.tsx` |
| 9 | API route stubs | `app/api/{projects,leads,clients,invoices,team}/route.ts` |
| 10 | Claude API client wrapper | `lib/claude.ts` |
| 11 | Invoice PDF template | `lib/pdf/invoice-template.tsx` |
| 12 | Storybook config | `.storybook/` |
| 13 | GitHub Actions CI | `.github/workflows/ci.yml` |
| 14 | Directory scaffold | `app/(dashboard)/`, `components/`, `lib/`, `prisma/` |
| 15 | Memory/tracing files | `.opencode/memory/MEMORY.md`, `progress.md` |