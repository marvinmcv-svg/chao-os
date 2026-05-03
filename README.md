# CHAO OS

**CRM + Operating System for CHAO Arquitectura S.R.L.**

_Sistema de gestión integral para estudios de arquitectura_

---

## Overview

CHAO OS is a full-stack CRM and project management system built for CHAO Arquitectura, a Santa Cruz de la Sierra architecture firm. It covers the full project lifecycle — lead pipeline, project delivery, invoicing, and client portal — in a single cohesive platform. Built with Next.js 14, Prisma, PostgreSQL, and Claude AI, it combines Kanban-style project tracking with AI-assisted decision making, financial reporting, and a white-label client portal.

---

## Tech Stack

- **Framework** — Next.js 14 (App Router)
- **Language** — TypeScript
- **Database** — PostgreSQL + Prisma ORM
- **Auth** — NextAuth.js v5 (Auth.js)
- **Styling** — Tailwind CSS
- **State & Data** — TanStack Query + Zustand
- **Forms & Validation** — React Hook Form + Zod
- **AI** — Claude AI (SSE streaming for real-time chat)
- **Charts** — Recharts
- **Email** — Resend (fire-and-forget)
- **Storage** — AWS S3 / Cloudflare R2 (S3-compatible API)
- **PDF** — Puppeteer (server-side invoice generation)
- **PWA** — Service Worker + Web App Manifest

---

## Feature Highlights

### 📁 Projects
- Kanban pipeline with drag-and-drop phase transitions
- Phase tracking (Feasibility → Design → Permits → Construction → Handover)
- Budget vs. actual cost monitoring per project
- Team capacity and assignment management

### 🤝 Business Development
- 6-column Kanban board (Lead → Qualified → Proposal → Negotiation → Won/Lost)
- AI Go/No-Go scoring on leads based on budget, timeline, and complexity
- One-click lead-to-project conversion

### 💰 Finance
- Full invoice lifecycle: DRAFT → SENT → PENDING → OVERDUE → PAID
- Partial payments with remaining balance tracking
- P&L charts and cashflow forecasting
- Server-side PDF generation via Puppeteer

### ⏱️ Studio
- Live time-tracking widget with start/stop timer
- Team capacity grid with weekly utilization bars
- Time entry history linked to projects

### 🌐 Client Portal
- White-theme portal accessed via signed URL token (no login required for clients)
- Project progress dashboard with phase completion %
- Document access and approval/rejection workflow
- Invoice history and payment status

### 🤖 AI (Claude)
- Real-time chat panel with SSE streaming
- AI-assisted proposal drafting from project briefs
- Budget alerts when costs exceed thresholds
- Income forecasting based on invoice pipeline

### 🔔 Notifications
- In-app bell with unread badge and notification list
- Fire-and-forget email delivery via Resend

### 📄 Documents
- Presigned URL upload to S3/R2 (drag-and-drop)
- Approve/reject workflow with timestamps

### 📱 PWA
- Installable on mobile via "Add to Home Screen"
- Offline-capable service worker

---

## Getting Started

```bash
# 1. Clone and install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values (see Environment Variables below)

# 3. Initialize the database
npm run db:generate   # Generate Prisma client
npm run db:push      # Push schema to PostgreSQL
npm run db:seed      # Seeds admin user + sample data

# 4. Run the development server
npm run dev
# Open http://localhost:3000

# 5. Login with default credentials
admin@chaoarquitectura.bo / Cha0Admin2025!
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in all values.

### 🔧 App
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Public URL of the app (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_APP_NAME` | Display name for the app (e.g. `"CHAO OS"`) |

### 🗄️ Database
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |

### 🔐 Auth
| Variable | Description |
|---|---|
| `NEXTAUTH_SECRET` | Secret for NextAuth session encryption (min 32 chars) |
| `NEXTAUTH_URL` | Internal URL for NextAuth (use `http://localhost:3000` in dev) |

### 🧠 Claude AI
| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude AI features |

### 📧 Email (Resend)
| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key (free tier: 100 emails/day) |
| `EMAIL_FROM` | Sender address (e.g. `CHAO OS <noreply@chaoarquitectura.bo>`) |
| `CLIENT_PORTAL_URL` | Public URL of the client portal |

### 💾 Storage (S3 or R2)
| Variable | Description |
|---|---|
| `AWS_REGION` | AWS/R2 region (e.g. `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | Access key ID |
| `AWS_SECRET_ACCESS_KEY` | Secret access key |
| `DOCUMENTS_S3_BUCKET` | S3/R2 bucket name for document storage |
| `REDIS_URL` | Redis connection URL (for rate limiting) |

---

## Deployment

**Infrastructure:** Railway (PostgreSQL + Redis) + Vercel (Next.js app)

### Railway
1. Create a new Railway project
2. Provision a PostgreSQL instance and a Redis instance
3. Set the `DATABASE_URL` and `REDIS_URL` environment variables in Railway

### Vercel
1. Connect the GitHub repository to Vercel
2. Add the required environment variables in Vercel's project settings:
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `ANTHROPIC_API_KEY`
   - `RESEND_API_KEY`
   - `AWS_*` variables
   - `NEXT_PUBLIC_APP_URL`
   - `NEXT_PUBLIC_APP_NAME`
3. Deploy — Vercel auto-detects Next.js

### GitHub Actions CI

CI is configured at `.github/workflows/ci.yml`. It runs lint and type-check on every push. For CI to pass:

1. Go to **GitHub → Settings → Secrets and variables → Actions**
2. Add these repository secrets:
   - `DATABASE_URL` — your PostgreSQL connection string
   - `NEXTAUTH_SECRET` — a secure random string (min 32 chars)
   - `ANTHROPIC_API_KEY` — your Anthropic API key

---

## Architecture Decisions

**Why Next.js App Router?**
Server Components by default reduce client-side JS bundle. Route groups `(dashboard)` and `(portal)` cleanly separate auth-gated and public-facing routes without duplicating layouts.

**Why Prisma?**
Type-safe database access with automatic migrations. The schema-as-code approach makes onboarding new developers trivial — `npm run db:push` and you're up to date.

**Why SSE for AI Chat?**
WebSockets would require a persistent connection and a custom server. SSE (Server-Sent Events) works natively with Next.js Route Handlers, streams tokens as they arrive, and requires zero additional infrastructure.

**Why signed URL tokens for the client portal?**
Clients get a time-limited, single-project token — no password, no account creation, no NextAuth session. The token is verified in middleware and expires automatically. Simpler for clients, lower attack surface.

**Why Puppeteer for PDF generation?**
Invoice PDFs need to match the exact visual design. Puppeteer renders a React component in a headless Chromium browser, producing a pixel-perfect PDF with fonts, borders, and layout — no HTML-to-PDF translation layer needed.

---

## Project Structure

```
app/
├── (dashboard)/            # Auth-gated internal app
│   ├── ai/                 # AI chat + assistants
│   ├── bd/                 # Business development (lead Kanban)
│   ├── dashboard/          # KPI widgets + activity feed
│   ├── finance/           # Invoices + charts
│   ├── projects/          # Project Kanban board
│   ├── settings/          # App settings
│   └── studio/            # Time tracking + capacity
├── (portal)/              # Public client portal
│   ├── page.tsx           # Portal entry (signed URL)
│   └── projects/[id]/     # Project progress view
├── api/                   # Route Handlers (REST API)
│   ├── ai/                # Chat, draft-proposal, alerts, forecast
│   ├── dashboard/         # KPIs, activity, alerts
│   ├── documents/         # Upload, approve, reject
│   ├── finance/          # P&L, cashflow
│   ├── invoices/          # CRUD, status, payments, PDF
│   ├── leads/            # CRUD, stage, AI score, funnel, convert
│   ├── notifications/    # Read, read-all
│   ├── portal/           # Portal auth token validation
│   ├── projects/         # CRUD, phase, team
│   ├── studio/           # Capacity, time entries
│   └── team/             # Team member CRUD
├── login/
├── layout.tsx
└── page.tsx

components/
├── ai/          # ChatPanel, BudgetAlert, IncomeForecast
├── bd/          # KanbanBoard, GoNoGoScore, LeadDetailModal
├── finance/     # FinanceCharts, InvoiceDetailPanel
├── layout/      # Sidebar, Topbar, NotificationBell
├── modals/      # NewInvoiceModal, NewProjectModal
├── projects/    # ProjectDetailPanel, DocumentList, DocumentUpload
├── providers/   # SessionProvider
├── studio/      # TimeTrackingWidget
└── ui/          # Avatar, Badge, Button, Card, Input, Modal, ProgressBar, Select, Table, Tabs

lib/
├── auth.ts              # NextAuth configuration
├── claude.ts            # Anthropic client + streaming helper
├── email.ts             # Resend email sender
├── email-templates.ts   # Email HTML templates
├── pdf/
│   └── generateInvoicePdf.ts  # Puppeteer PDF renderer
├── portal-auth.ts       # Signed URL token generation + verification
├── prisma.ts            # Prisma client singleton
├── proposal-store.ts    # In-memory store for draft proposals
├── ratelimit.ts         # Redis-based rate limiter
├── s3.ts                # S3/R2 presigned URL generation
├── types/
│   └── claude.ts        # Claude API type definitions
└── utils.ts             # Shared utility functions

prisma/
├── schema.prisma         # Database schema
└── seed.ts              # Admin user + sample data seeder
```

---

## Contributing

1. **Fork** the repository
2. **Create a feature branch** — `feat/your-feature-name`
3. **Make your changes** with clean, well-typed TypeScript
4. **Run quality checks** — `npm run lint` and `npm run typecheck`
5. **Commit** using conventional commits — `feat(bd): add Go/No-Go scoring endpoint`
6. **Open a Pull Request** with a clear description
7. CI must pass before merge (lint + type-check)

---

## License

Proprietary — **CHAO Arquitectura S.R.L.** — All rights reserved.

_Santa Cruz de la Sierra, Bolivia_