# CHAO OS — Quick Context for New Chat Session

## What We Built

A full-stack CRM+OS for CHAO Arquitectura S.R.L. (architecture firm in Santa Cruz de la Sierra, Bolivia).

**Project root:** `C:\Users\KB\Documents\Open code\Chao RCM\`
**Spec doc:** `CHAO-OS-Handover.md` (in project root)
**Memory files:** `.opencode/memory/project_chao-os.md`, `.opencode/memory/task_plan.md`

---

## Stack
- Next.js 14 App Router + TypeScript + Tailwind CSS
- Prisma ORM + PostgreSQL
- NextAuth.js v5 (JWT + credentials)
- Recharts, React Hook Form + Zod, Lucide icons
- Puppeteer for PDF generation
- Claude API (Sprint 6 — pending)

---

## Completed Sprints (1-5 of 6)

### Sprint 1 — Foundation ✅ (49 files)
- `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`
- Prisma schema with 19 models (all entities: User, Lead, Project, Phase, Client, Invoice, InvoiceLineItem, Payment, Milestone, Task, TimeEntry, Expense, Document, Comment, Notification, AuditLog, TeamMember, ProjectMember, PasswordChange)
- `prisma/seed.ts` — admin user + 6 team + 7 projects + 8 leads + 5 invoices
- `lib/auth.ts` — NextAuth v5 with credentials provider
- `lib/prisma.ts`, `lib/utils.ts`, `lib/validations.ts`
- Design system: `app/globals.css` with 48 CSS tokens (g05-g95 grayscale, green/yellow/red/blue)
- UI components: Button, Card, Badge, Table, Modal, Input, Select, ProgressBar, Avatar, Tabs
- Layout: Sidebar (8 nav items), Topbar (live SCZ clock), SessionProvider
- Pages: login, dashboard, bd, projects, finance, studio, ai, settings
- Portal layout: white theme (route group `(portal)`)

### Sprint 2 — Projects ✅ (13 files)
- `app/api/projects/route.ts` — GET list + POST create (auto-creates 4 phases)
- `app/api/projects/[id]/route.ts` — GET full detail + PUT + DELETE
- `app/api/projects/[id]/phase/route.ts` — PATCH phase advance
- `app/api/projects/[id]/team/route.ts` — GET team + POST add member
- `app/api/clients/route.ts` — GET + POST
- `app/api/team/route.ts` — GET with capacity
- `app/api/dashboard/kpis/route.ts` — active projects, pipeline value, month billed, utilization
- `app/api/dashboard/activity/route.ts` — recent projects + invoices
- `app/api/dashboard/alerts/route.ts` — overdue invoices, budget warnings, overloaded team
- `components/projects/ProjectDetailPanel.tsx` — slide-in from right (520px), Escape + backdrop to close
- `components/modals/NewProjectModal.tsx` — React Hook Form + Zod
- `app/(dashboard)/projects/page.tsx` — full list with search/filter + click-to-panel
- `app/(dashboard)/dashboard/page.tsx` — live API calls (KPIs, alerts, activity)

### Sprint 3 — Business Development ✅ (16 files)
- `app/api/leads/route.ts` — GET list + POST create (auto sortOrder)
- `app/api/leads/[id]/route.ts` — GET + PUT + DELETE
- `app/api/leads/[id]/stage/route.ts` — PATCH stage (auto 100% prob on WON)
- `app/api/leads/[id]/convert/route.ts` — WON → Project (creates client + 4 phases)
- `app/api/leads/funnel/route.ts` — funnel analytics (win rate, cycle, weighted)
- `app/api/leads/[id]/ai-score/route.ts` — mock AI scoring stub (Sprint 6 real)
- `components/bd/KanbanBoard.tsx` — 6-column Kanban, native HTML5 drag-and-drop
- `components/bd/NewLeadModal.tsx` — React Hook Form + Zod create form
- `components/bd/LeadDetailModal.tsx` — detail + AI breakdown + stage buttons + convert
- `components/bd/ContactsTable.tsx` — searchable/sortable, merges leads + clients
- `components/bd/GoNoGoScore.tsx` — 5-dimension score bars + GO/NO_GO/REVIEW
- `app/(dashboard)/bd/page.tsx` — all 4 tabs wired (Pipeline, Contactos, Analítica, Configuración)

### Sprint 4 — Finance ✅ (14 files)
- `app/api/invoices/route.ts` — GET list + POST create (auto INV-XXXX)
- `app/api/invoices/[id]/route.ts` — GET + PUT + DELETE (DRAFT only)
- `app/api/invoices/[id]/status/route.ts` — PATCH with auto-OVERDUE detection + notifications
- `app/api/invoices/[id]/payments/route.ts` — POST partial payment + auto-PAID when sum >= total
- `app/api/invoices/[id]/pdf/route.ts` — GET PDF
- `app/api/finance/pnl/route.ts` — P&L (revenue - expenses - $50/hr labor)
- `app/api/finance/cashflow/route.ts` — 90-day forecast, 12-week rolling
- `lib/pdf/generateInvoicePdf.ts` — Puppeteer HTML→PDF + placeholder fallback
- `components/finance/InvoiceDetailPanel.tsx` — slide-in panel, status actions, payment history
- `components/modals/NewInvoiceModal.tsx` — React Hook Form + Zod, USD/BOB
- `components/finance/FinanceCharts.tsx` — Recharts: P&L bar + cashflow area + summary table
- `app/(dashboard)/finance/page.tsx` — Gráficos + Facturas tabs

### Sprint 5 — Studio + Portal ✅ (13 files)
- `app/api/time-entries/route.ts` — GET list + POST create (auto-recalculates utilization)
- `app/api/time-entries/[id]/route.ts` — DELETE (owner or admin, rolls back task hours)
- `app/api/team/[id]/route.ts` — GET detail + PUT update (ADMIN/PRINCIPAL only)
- `app/api/studio/capacity/route.ts` — GET team-wide capacity grid
- `app/api/portal/auth/route.ts` — POST verify signed token → return access
- `app/api/portal/project/[id]/route.ts` — GET project (token-verified + ownership-checked)
- `app/(portal)/layout.tsx` — WHITE theme layout with CHAO header + footer
- `app/(portal)/page.tsx` — redirect if token+projectId, else welcome message
- `app/(portal)/projects/[id]/page.tsx` — client dashboard (progress, phases, milestones, docs, invoices)
- `app/(dashboard)/studio/page.tsx` — capacity grid + summary cards
- `components/studio/TimeTrackingWidget.tsx` — live timer (start/pause/reset), manual hours fallback
- `lib/portal-auth.ts` — `generatePortalToken()` using crypto.randomBytes

---

## Sprint 6 — AI Layer (NEXT — PENDING)
Remaining work:
- `lib/claude.ts` — Claude API client wrapper (retry, streaming, rate limiting)
- `app/api/ai/score-lead/route.ts` — real Go/No-Go scoring with Claude
- `app/api/ai/draft-proposal/route.ts` — proposal generation
- `app/api/ai/chat/route.ts` — SSE streaming chat assistant
- `app/api/ai/alerts/route.ts` — budget overrun + capacity alerts
- `app/api/ai/income-forecast/route.ts` — pipeline probability × value forecast
- `components/ai/ChatPanel.tsx` — chat UI with streaming responses
- `components/ai/BudgetAlert.tsx` — budget overrun alert cards
- `components/ai/IncomeForecast.tsx` — forecast chart
- `app/(dashboard)/ai/page.tsx` — full AI assistant page

---

## Setup to Run
```bash
cd "C:\Users\KB\Documents\Open code\Chao RCM"
cp .env.example .env.local
# Add your DATABASE_URL to .env.local (PostgreSQL)
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```
Login: `admin@chaoarquitectura.bo` / `Cha0Admin2025!`

---

## Key Decisions Made
- NextAuth v5 (edge-compatible beta)
- Portal: same app `(portal)` route group, white theme
- Portal auth: signed URL token `?token=XXX&projectId=YYY` (Client.portalToken field)
- Kanban: native HTML5 drag-and-drop (no @dnd-kit)
- PDF: Puppeteer with HTML template + placeholder fallback
- Invoice lifecycle: DRAFT → SENT → PENDING → OVERDUE/PAID
- Partial payments: Payment model tracks each payment separately
- Time entry: always belongs to logged-in user (enforced server-side)
- Team utilization: auto-recalculates on time entry create/delete

## To Start Sprint 6
See `task_plan.md` for full roadmap. Sprint 6 = AI Layer (Claude API + streaming).
