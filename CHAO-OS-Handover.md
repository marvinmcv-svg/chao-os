# CHAO OS — Agent Handover Document
**Version:** 0.1.0 — Prototype
**Date:** May 1, 2025
**Prepared by:** CHAO OS Design & Architecture Team
**Handover to:** Development Agent

---

## 1. Project Overview

**CHAO OS** is a full-stack CRM and Operating System built specifically for architecture firms. The product is inspired by a deep-research analysis of the top 10 platforms in the AEC (Architecture, Engineering & Construction) space — extracting the best features from Deltek Vantagepoint, Monograph, BQE CORE, HubSpot, Scoro, Pipedrive, Zoho, Unanet, Capsule, and Drum PSA — and synthesizing them into a single, purpose-built operating system.

**Primary client:** CHAO Arquitectura S.R.L.
**Location:** Santa Cruz de la Sierra, Bolivia
**Language:** Spanish (es-BO)
**Base currency:** USD (with BOB support)
**Timezone:** America/La_Paz (UTC-4)

---

## 2. What Has Been Built (Prototype)

A fully interactive **single-file HTML prototype** (`CHAO-OS-App.html`) has been delivered. This is a **frontend-only SPA** with no backend, no database, and no authentication. All data is hardcoded. It serves as the definitive visual and UX specification for the production build.

### 2.1 Prototype File
- **File:** `CHAO-OS-App.html`
- **Size:** ~96KB
- **Stack:** Vanilla HTML5 + CSS3 + JavaScript (no frameworks, no dependencies)
- **Fonts:** Google Fonts — DM Serif Display, DM Mono, Syne
- **Design System:** Black & white editorial aesthetic with monospace type, status accent colors (green/yellow/red/blue)

### 2.2 Implemented Views (All Clickable)

| View | Route Concept | Status |
|---|---|---|
| Dashboard | `/dashboard` | ✅ Prototype complete |
| Business Development | `/bd` | ✅ Prototype complete |
| Proyectos | `/projects` | ✅ Prototype complete |
| Finanzas | `/finance` | ✅ Prototype complete |
| Estudio | `/studio` | ✅ Prototype complete |
| Portal Cliente | `/portal` | ✅ Prototype complete |
| Asistente IA | `/ai` | ✅ Prototype complete |
| Configuración | `/settings` | ✅ Prototype complete |

### 2.3 Interactive Elements in Prototype

- **Sidebar navigation** — all 8 views navigable, active state highlighted
- **Tab systems** — BD (4 tabs), Projects (3 tabs), each tab-switching functional
- **Project detail panel** — slide-in right panel triggered by clicking any project row, populated dynamically with project data
- **Modals** — New Lead, New Project, Lead Detail, New Invoice — all open/close with form inputs
- **Kanban pipeline** — 5-column BD pipeline with real opportunity cards
- **Go/No-Go scoring** — AI score visualization with per-dimension bars
- **Live clock** — Santa Cruz de la Sierra time, updates every second
- **Keyboard support** — Escape closes all modals and panels
- **Client portal preview** — white-theme portal as seen by the client (Rodrigo Méndez / Torre Buganvillas)
- **AI assistant panel** — alert cards + chat input UI

---

## 3. System Architecture (Recommended Production Stack)

### 3.1 Frontend
```
Framework:      Next.js 14+ (App Router)
Language:       TypeScript
Styling:        Tailwind CSS + CSS Modules for design system
State:          Zustand (global) + React Query (server state)
Charts:         Recharts or Tremor
Icons:          Lucide React
Forms:          React Hook Form + Zod validation
Tables:         TanStack Table v8
Drag & Drop:    @dnd-kit (for Kanban pipeline)
Dates:          date-fns (with es-BO locale)
Auth UI:        NextAuth.js
```

### 3.2 Backend
```
Runtime:        Node.js with Next.js API routes (or separate Express/Fastify)
Language:       TypeScript
ORM:            Prisma
Database:       PostgreSQL (primary)
Cache:          Redis (sessions, rate limiting)
File Storage:   AWS S3 or Cloudflare R2
Auth:           NextAuth.js with JWT + refresh tokens
Email:          Resend or Sendgrid
PDF Generation: Puppeteer or React-PDF (for invoices/proposals)
```

### 3.3 AI Layer
```
Provider:       Anthropic Claude API (claude-sonnet-4-6)
Use cases:      Go/No-Go scoring, proposal drafting, budget alerts, chat assistant
Pattern:        Streaming responses via Server-Sent Events
```

### 3.4 Infrastructure
```
Hosting:        Vercel (frontend) + Railway or Render (backend services)
Database:       Supabase (managed PostgreSQL) or PlanetScale
Monitoring:     Sentry (errors) + Posthog (analytics)
CI/CD:          GitHub Actions
```

---

## 4. Data Models (Core Entities)

### 4.1 User
```typescript
interface User {
  id: string
  name: string
  email: string
  role: 'principal' | 'architect_senior' | 'architect' | 'bim' | 'admin'
  avatarInitials: string
  capacityPercent: number  // 0–100
  activeProjectIds: string[]
  createdAt: Date
  updatedAt: Date
}
```

### 4.2 Lead (Business Development)
```typescript
interface Lead {
  id: string
  projectName: string
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  estimatedValueUSD: number
  projectType: 'residential' | 'commercial' | 'industrial' | 'institutional' | 'mixed'
  pipelineStage: 'prospect' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
  closeProbability: number        // 0–100
  aiScore: number                  // 0–100 (Go/No-Go)
  aiScoreBreakdown: {
    margin: number
    clientHistory: number
    capacity: number
    complexity: number
    competition: number
  }
  aiRecommendation: 'go' | 'no_go' | 'review'
  notes: string
  sourceType: 'referral' | 'direct' | 'online' | 'network'
  assignedTo: string              // userId
  createdAt: Date
  updatedAt: Date
}
```

### 4.3 Project
```typescript
type ProjectPhase = 'SD' | 'DD' | 'CD' | 'CA'

interface ProjectPhaseData {
  phase: ProjectPhase
  label: string
  budgetUSD: number
  spentUSD: number
  progressPercent: number
  status: 'not_started' | 'in_progress' | 'complete'
  startDate: Date | null
  endDate: Date | null
}

interface Project {
  id: string
  code: string                     // e.g. "P-2025-001"
  name: string
  clientId: string
  projectManagerId: string
  teamMemberIds: string[]
  type: 'residential' | 'commercial' | 'industrial' | 'institutional' | 'mixed'
  contractType: 'fixed_fee' | 'percentage' | 'time_and_materials'
  currentPhase: ProjectPhase
  phases: ProjectPhaseData[]
  totalBudgetUSD: number
  totalSpentUSD: number
  overallProgressPercent: number
  status: 'on_track' | 'at_risk' | 'over_budget' | 'closing' | 'completed'
  startDate: Date
  estimatedEndDate: Date
  actualEndDate: Date | null
  convertedFromLeadId: string | null
  createdAt: Date
  updatedAt: Date
}
```

### 4.4 Client
```typescript
interface Client {
  id: string
  name: string                     // person or company
  company: string
  email: string
  phone: string
  type: 'active' | 'prospect' | 'past'
  aiScore: number                  // 0–100 relationship score
  projectIds: string[]
  totalBilledUSD: number
  portalAccessEnabled: boolean
  portalLastLogin: Date | null
  notes: string
  createdAt: Date
}
```

### 4.5 Invoice
```typescript
interface Invoice {
  id: string
  number: string                   // e.g. "INV-0142"
  projectId: string
  clientId: string
  milestoneLabel: string           // e.g. "Hito 3 — DD 50%"
  amountUSD: number
  currency: 'USD' | 'BOB'
  exchangeRate: number             // BOB/USD rate at time of issue
  status: 'draft' | 'sent' | 'pending' | 'overdue' | 'paid'
  issuedAt: Date
  dueDate: Date
  paidAt: Date | null
  notes: string
  pdfUrl: string | null
  createdAt: Date
}
```

### 4.6 TeamMember (extends User)
```typescript
interface TeamMember extends User {
  weeklyHoursCapacity: number      // default 40
  weeklyHoursLogged: number
  utilizationPercent: number
  activeTaskIds: string[]
  upcomingDeadlines: Task[]
}
```

### 4.7 Task
```typescript
interface Task {
  id: string
  projectId: string
  assignedTo: string              // userId
  title: string
  description: string
  phase: ProjectPhase
  status: 'todo' | 'in_progress' | 'review' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  dueDate: Date
  estimatedHours: number
  loggedHours: number
  createdAt: Date
}
```

---

## 5. The Six CHAO Modules — Feature Spec

### Module C — Client Intelligence (CRM + BD)
- [ ] Lead creation form with all fields
- [ ] Kanban pipeline (drag & drop between stages)
- [ ] AI Go/No-Go scoring on lead creation (calls Claude API)
- [ ] Contact list with search, filter, sort
- [ ] AI prospect enrichment (auto-fill company info)
- [ ] Lead-to-Project conversion (one click, auto-creates project with template)
- [ ] Proposal template engine (AI-generated from past similar projects)
- [ ] Email sequence automation (follow-up reminders)
- [ ] Pipeline analytics (win rate, avg cycle, weighted value)

### Module H — Handoff Engine
- [ ] Automatic project creation when lead is marked "Won"
- [ ] Template-based project scaffolding (phases, milestones pre-populated)
- [ ] Client onboarding email sent automatically
- [ ] Portal access provisioned for client on project creation
- [ ] Zero data re-entry — all lead data maps to project fields

### Module A — Architecture Project OS
- [ ] Project list with all metadata
- [ ] Phase-based progress tracking (SD → DD → CD → CA)
- [ ] Per-phase budget vs. actual tracking
- [ ] Real-time overrun alerts (configurable threshold, default 80%)
- [ ] Task management within each phase
- [ ] Gantt/chronogram view (read-only in v1, interactive in v2)
- [ ] Document management per phase (upload, version, approve)
- [ ] RFI log (Request for Information)
- [ ] Submittal log
- [ ] Milestone tracking with client approval workflow

### Module O — Operations & Finance
- [ ] Invoice creation (milestone-based and manual)
- [ ] Invoice PDF generation with firm branding
- [ ] Payment tracking (mark as paid, partial payment)
- [ ] Overdue invoice alerts
- [ ] P&L per project (revenue - cost of time - expenses)
- [ ] Real-time profitability dashboard
- [ ] Cash flow forecast (90-day and annual)
- [ ] Time tracking (manual entry + timer) linked to project + phase
- [ ] Expense tracking per project
- [ ] QuickBooks Online integration (sync invoices and payments)
- [ ] Multi-currency support (USD primary, BOB secondary)

### Module S — Studio Management
- [ ] Team member directory
- [ ] Capacity planning (weekly hours available vs. assigned)
- [ ] Utilization rate per person and overall
- [ ] Resource assignment to projects and phases
- [ ] Overload alerts (configurable threshold, default 90%)
- [ ] Workload rebalancing suggestions (AI)
- [ ] Upcoming deadlines view (per person and team-wide)
- [ ] Basic HR fields (role, start date, rate)

### Module Portal + AI
- [ ] Branded client portal (separate URL or subdomain)
- [ ] Per-client login with portal access
- [ ] Live project status visible to client (phase progress, milestones)
- [ ] Document download (approved deliverables only)
- [ ] Invoice view and PDF download for client
- [ ] Client feedback / comment thread per milestone
- [ ] AI assistant panel (internal — staff only)
- [ ] AI budget alert engine (monitors spend vs. progress)
- [ ] AI proposal drafting (uses Claude API with project history context)
- [ ] AI chat (answers questions about projects, team, pipeline)
- [ ] Income forecast (based on pipeline probability × value)

---

## 6. Design System Tokens

```css
/* Colors */
--black:   #000000
--white:   #ffffff
--g95:     #0a0a0a   /* app background */
--g90:     #111111
--g85:     #1a1a1a   /* card background */
--g80:     #222222   /* card borders, table rows */
--g75:     #282828
--g70:     #333333   /* dividers */
--g60:     #444444
--g50:     #555555   /* disabled */
--g40:     #666666   /* labels */
--g30:     #888888   /* secondary text */
--g20:     #aaaaaa   /* body text */
--g10:     #dddddd
--g05:     #f4f4f4

/* Status colors */
--green:   #4ade80
--yellow:  #facc15
--red:     #f87171
--blue:    #60a5fa

/* Typography */
--font-display: 'DM Serif Display', Georgia, serif       /* headings */
--font-mono:    'DM Mono', 'Courier New', monospace      /* labels, codes, data */
--font-ui:      'Syne', sans-serif                       /* all UI text, buttons */

/* Layout */
--sidebar-w: 240px
--topbar-h:  56px
--radius:    6px
```

---

## 7. Hardcoded Seed Data (from prototype)

All data below should be seeded into the database for initial development and demo.

### Projects (7 active)
| Code | Name | Client | Phase | Progress | Budget |
|---|---|---|---|---|---|
| P-2025-001 | Torre Buganvillas | Inmobiliaria Oriente | DD | 65% | $320,000 |
| P-2025-002 | Clínica Santa Rita | Grupo Médico Rita | CD | 82% | $218,000 |
| P-2025-003 | Residencias Urubó | Familia Méndez | SD | 28% | $145,000 |
| P-2025-004 | Centro Empresarial Norte | Grupo Empresarial Norte | CA | 91% | $385,000 |
| P-2025-005 | Hotel Camiri Boutique | Camiri Hospitality | DD | 44% | $164,000 |
| P-2025-6 | Nave Industrial Warnes | Agro-Export Bolivia | SD | 12% | $92,000 |
| P-2025-007 | Casa Gutiérrez | Familia Gutiérrez | DD | 55% | $48,000 |

### Team (8 members)
| Initials | Name | Role | Load |
|---|---|---|---|
| MA | Marco Arce | Arquitecto Principal | 92% |
| SH | Sofía Herrera | Arquitecta Senior | 98% ⚠ |
| JM | Jorge Molina | Arquitecto | 68% |
| PR | Paula Ribera | Arquitecta Junior | 55% |
| DV | Diego Vásquez | BIM Manager | 84% |
| LC | Lorena Chávez | Coordinator Admin | 60% |

### Pipeline Leads (8 open)
| Name | Stage | Value | Prob. |
|---|---|---|---|
| Edificio Equipetrol Norte | Prospecto | $280K | 35% |
| Residencia Los Jardines | Prospecto | $85K | 50% |
| Clínica Dental Premium | Prospecto | $62K | 60% |
| Centro Comercial Palmasola | Calificado | $420K | 65% |
| Torre Residencial Hamacas | Calificado | $195K | 70% |
| Remodelación Hotel Los Tajibos | Propuesta | $78K | 80% |
| Colegio Internacional SCZ | Propuesta | $135K | 75% |
| Nave Industrial Warnes | Negociación | $92K | 90% |

### Invoices (recent)
| # | Project | Amount | Status |
|---|---|---|---|
| INV-0142 | Hotel Camiri Boutique | $18,500 | Pending |
| INV-0141 | Clínica Santa Rita | $29,600 | **Overdue** |
| INV-0140 | Torre Buganvillas | $48,000 | Paid |
| INV-0139 | Residencias Urubó | $21,750 | Paid |
| INV-0138 | Centro Empresarial Norte | $57,750 | Paid |

---

## 8. Priority Build Order (Recommended Sprints)

### Sprint 1 — Foundation (Week 1–2)
- [ ] Next.js project setup with TypeScript + Tailwind
- [ ] Design system implementation (tokens, components: Button, Card, Badge, Table, Modal)
- [ ] Sidebar + Topbar layout shell
- [ ] Authentication (login, session, protected routes)
- [ ] Database schema (Prisma) + seed data
- [ ] Dashboard view — static data first

### Sprint 2 — Projects Module (Week 3–4)
- [ ] Project list view with all columns
- [ ] Project detail slide-in panel
- [ ] Phase tracking component (progress bars per phase)
- [ ] Budget vs. actual component
- [ ] New project modal (form + validation)
- [ ] Phase tab switcher (Fases + Cronograma views)

### Sprint 3 — Business Development (Week 5–6)
- [ ] Kanban pipeline with drag & drop
- [ ] Lead detail modal
- [ ] New lead form
- [ ] Go/No-Go scoring UI
- [ ] Contacts table with search
- [ ] Lead → Project conversion flow

### Sprint 4 — Finance (Week 7–8)
- [ ] Invoice list with filters
- [ ] New invoice form
- [ ] Invoice PDF generation
- [ ] P&L dashboard per project
- [ ] Cash flow chart (90-day)
- [ ] Overdue alerts

### Sprint 5 — Studio + Portal (Week 9–10)
- [ ] Team capacity grid
- [ ] Hours tracking (manual entry)
- [ ] Client portal (separate authenticated route)
- [ ] Portal: project status view for client
- [ ] Portal: document download

### Sprint 6 — AI Layer (Week 11–12)
- [ ] Claude API integration
- [ ] Go/No-Go AI scoring on lead creation
- [ ] Budget overrun AI alerts
- [ ] AI proposal drafting
- [ ] AI chat assistant
- [ ] Income forecast engine

---

## 9. Key UX Patterns to Preserve

1. **Slide-in detail panel** — never navigate away to see project detail; always open from the right
2. **Tab switching** — BD and Projects views use in-page tab switching, not routing
3. **Modal pattern** — all create/edit actions open centered modals with overlay
4. **Escape to close** — always keyboard-dismissible
5. **Live clock** — topbar always shows current Santa Cruz time
6. **AI panel at bottom of Dashboard** — always visible on load with the most critical alert
7. **Kanban pipeline** — drag between columns to update stage
8. **Portal is a separate view** — white theme, client-facing, never mix with the dark admin UI
9. **Status colors are consistent** — green = on track, yellow = at risk, red = critical, blue = in-progress phase
10. **All currency in USD** unless explicitly BOB — format as `$XXX,XXX` with no decimals for large values

---

## 10. API Endpoints to Build (v1)

```
AUTH
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

PROJECTS
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
PATCH  /api/projects/:id/phase
DELETE /api/projects/:id

LEADS (BD)
GET    /api/leads
POST   /api/leads
GET    /api/leads/:id
PUT    /api/leads/:id
PATCH  /api/leads/:id/stage
POST   /api/leads/:id/convert     ← converts lead to project

CLIENTS
GET    /api/clients
POST   /api/clients
GET    /api/clients/:id
PUT    /api/clients/:id

INVOICES
GET    /api/invoices
POST   /api/invoices
GET    /api/invoices/:id
PATCH  /api/invoices/:id/status
GET    /api/invoices/:id/pdf

TEAM
GET    /api/team
POST   /api/team
GET    /api/team/:id
PUT    /api/team/:id

TASKS
GET    /api/tasks?projectId=
POST   /api/tasks
PATCH  /api/tasks/:id

AI
POST   /api/ai/score-lead         ← Go/No-Go scoring
POST   /api/ai/draft-proposal     ← Proposal generation
POST   /api/ai/chat               ← Assistant chat (streaming)
GET    /api/ai/alerts             ← Budget + capacity alerts

DASHBOARD
GET    /api/dashboard/kpis
GET    /api/dashboard/activity
GET    /api/dashboard/forecast

PORTAL (client-facing, separate auth)
GET    /api/portal/project/:id
GET    /api/portal/invoices
GET    /api/portal/documents
```

---

## 11. Environment Variables Required

```env
# App
NEXT_PUBLIC_APP_URL=https://app.chaoos.bo
NEXT_PUBLIC_APP_NAME="CHAO OS"

# Database
DATABASE_URL=postgresql://...

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Claude AI
ANTHROPIC_API_KEY=

# Email
RESEND_API_KEY=

# Storage
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# QuickBooks (future)
QB_CLIENT_ID=
QB_CLIENT_SECRET=
```

---

## 12. Files Delivered

| File | Description |
|---|---|
| `CHAO-OS-App.html` | Full interactive prototype — the UX/design spec |
| `CHAO-OS-Intelligence-Report.html` | Research report on top 10 CRM platforms |
| `CHAO-OS-Presentation.pptx` | 10-slide investor/sales deck |
| `CHAO-OS-Handover.md` | This document |

---

## 13. Out of Scope for v1

- Mobile responsive layout (desktop-first for v1)
- Native mobile app
- Multi-firm / multi-tenant architecture
- AutoCAD / Revit / BIM integration
- E-signature on contracts
- Full accounting module (use QuickBooks integration instead)
- Public marketing website

---

*CHAO OS — Built for architecture firms ready to move from surviving to scaling.*
*Santa Cruz de la Sierra, Bolivia · 2025*