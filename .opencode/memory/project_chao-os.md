# CHAO OS — Project Memory

## Identifiers
- **Name:** CHAO OS (CRM + Operating System for architecture firms)
- **Client:** CHAO Arquitectura S.R.L., Santa Cruz de la Sierra, Bolivia
- **Language:** Spanish (es-BO) | **Currency:** USD primary, BOB secondary
- **Prototype:** `CHAO-OS-App.html` (~96KB, vanilla HTML/CSS/JS) — UX reference spec
- **Spec doc:** `CHAO-OS-Handover.md`

## Tech Stack
- Frontend: Next.js 14+ (App Router), TypeScript, Tailwind CSS, Zustand + React Query
- Backend: Next.js API routes (same app), Prisma ORM
- Database: PostgreSQL (dev: Docker/local, prod: Supabase/PlanetScale)
- Cache/Sessions: Redis (Upstash or Railway Redis)
- Auth: NextAuth.js v5 (JWT + credentials)
- AI: Anthropic Claude API (claude-sonnet-4-6), SSE streaming
- PDF: Puppeteer-based (`lib/pdf/generateInvoicePdf.ts`) with HTML fallback
- Storage: AWS S3 or Cloudflare R2
- Email: Resend
- Hosting: Vercel (frontend + API), Railway (Redis)
- Monitoring: Sentry + PostHog

## Data Models (v1) — ALL COMPLETE
User, Lead, Project, Phase, Client, Invoice, InvoiceLineItem, Payment, Milestone, Task, TimeEntry, Expense, Document, Comment, Notification, AuditLog, TeamMember, ProjectMember, PasswordChange
**19 Prisma models total** — full schema in `prisma/schema.prisma`

## Design System
Dark theme admin (g85 cards, g95 app bg), white theme for client portal only
Status colors: green/yellow/red/blue
Fonts: DM Serif Display (headings), DM Mono (labels/data), Syne (UI)
Full token set in `app/globals.css` — 48 CSS custom properties

## Sprint Progress
| Sprint | Status | Files |
|--------|--------|-------|
| **Sprint 1 — Foundation** | ✅ DONE | 49 files |
| **Sprint 2 — Projects Module** | ✅ DONE | 13 files |
| **Sprint 3 — Business Development** | ✅ DONE | 16 files |
| **Sprint 4 — Finance** | ✅ DONE | 14 files |
| **Sprint 5 — Studio + Portal** | ✅ DONE | 13 files |
| **Sprint 7 — Polish + Infrastructure** | ✅ DONE | 19 files |
| **Total** | **7/7** | **147 files** |

## Sprint 6 New Files (10)
**Claude API Client:**
- `lib/claude.ts` — Claude class (chat, complete, chatStream), RATE_LIMIT/API_ERROR/TIMEOUT/INVALID_REQUEST errors, 3-retry exponential backoff, rate-limit respect, singleton getClaude(), high-level scoreLead() + generateProposalDraft()
- `lib/types/claude.ts` — ClaudeMessage, ClaudeResponse, ClaudeStreamChunk, ClaudeUsage, ClaudeModel, ClaudeTextBlock types

**AI Endpoints:**
- `app/api/leads/[id]/ai-score/route.ts` — GET (return DB scores) + POST (call scoreLead() + persist)
- `app/api/ai/draft-proposal/route.ts` — POST generate proposal memo (Spanish formal memo structure)
- `app/api/ai/draft-proposal/[id]/route.ts` — GET retrieve stored proposal
- `lib/proposal-store.ts` — Prisma-based store (ProposalDraft model), not in-memory

**AI UI Components:**
- `components/ai/ChatPanel.tsx` — slide-in (400px right), SSE streaming, typing indicator, context selector, Ctrl+Enter shortcut
- `components/ai/BudgetAlert.tsx` — alert card with colored left border (critical/warning/info), dismiss + navigate
- `components/ai/IncomeForecast.tsx` — 3 stat cards + Recharts bar + narrative + leads/projects lists
- `app/(dashboard)/ai/page.tsx` — full AI page (BudgetAlert list + IncomeForecast + ChatPanel)

## File Count: 147 total TypeScript/TSX files (Sprint 7 adds 19 net new, includes: documents, notifications, email, PWA, CI)

### Sprint 5 New Files (13)
**Team + Time API:**
- `app/api/time-entries/route.ts` — GET list + POST create (auto-recalculates utilization)
- `app/api/time-entries/[id]/route.ts` — DELETE (owner or admin, rolls back task hours)
- `app/api/team/[id]/route.ts` — GET detail + PUT update (admin/principal only)
- `app/api/studio/capacity/route.ts` — GET team-wide capacity grid with summary stats

**Portal API:**
- `app/api/portal/auth/route.ts` — POST verify signed token, return client/project access
- `app/api/portal/project/[id]/route.ts` — GET project status (token-verified, ownership-checked)

**Portal UI:**
- `app/(portal)/layout.tsx` — WHITE theme layout with CHAO header + footer
- `app/(portal)/page.tsx` — Entry redirect or welcome message
- `app/(portal)/projects/[id]/page.tsx` — Full client project dashboard (progress, phases, milestones, documents, invoices)

**Studio UI:**
- `app/(dashboard)/studio/page.tsx` — Capacity grid + summary cards
- `components/studio/TimeTrackingWidget.tsx` — Slide-in timer (start/pause/reset), manual hours, project selector

**Utilities:**
- `lib/portal-auth.ts` — `generatePortalToken()` using crypto.randomBytes

## Sprint 7 New Files (19)
**Document Uploads:**
- `lib/s3.ts` — AWS S3/R2 client, presigned upload/download URLs
- `app/api/documents/route.ts` — POST create + presigned URL, GET list
- `app/api/documents/[id]/route.ts` — GET + PATCH + DELETE
- `app/api/documents/[id]/approve/route.ts` — admin APPROVED
- `app/api/documents/[id]/reject/route.ts` — admin REJECTED
- `components/projects/DocumentUpload.tsx` — HTML5 drag-and-drop, XHR progress, 50MB limit
- `components/projects/DocumentList.tsx` — list with download (APPROVED only) + status dropdown

**In-App Notifications:**
- `app/api/notifications/route.ts` — GET list + POST create
- `app/api/notifications/[id]/read/route.ts` — mark as read
- `app/api/notifications/read-all/route.ts` — mark all read
- `components/layout/NotificationBell.tsx` — bell dropdown with unread badge
- Schema: `title`, `message`, `linkUrl` added to Notification model

**Email (Resend):**
- `lib/email.ts` — sendInvoiceEmail, sendPaymentReceivedEmail, sendLeadConvertedEmail, sendProjectUpdateEmail
- `lib/email-templates.ts` — CHAO-branded HTML layout
- Wired into: invoice status (SENT), payment received, lead converted, phase advance

**PWA:**
- `public/manifest.json`, `public/sw.js`, `public/robots.txt`, `public/sitemap.xml`
- `public/icons/icon.svg` — CHAO logo SVG placeholder
- `components/PWASetup.tsx` + `app/layout.tsx` PWA metadata

**CI:**
- `.github/workflows/ci.yml` — lint → prisma-validate → build pipeline
- `.github/ISSUE_TEMPLATE.md`, `.github/PULL_REQUEST_TEMPLATE.md`

## Seed Credentials
- Admin: `admin@chaoarquitectura.bo` / `Cha0Admin2025!`

## Key Decisions (Locked)
- NextAuth v5 (beta, edge-compatible)
- Portal: same app via `(portal)` route group with white theme
- Portal auth: signed URL token (`portalTokenHash` on Client, SHA-256) — `?token=XXX&projectId=YYY`
- Kanban: `sortOrder` field on Lead for column ordering
- Single-firm only (no multi-tenant for v1)
- Project detail: slide-in panel (no route change), Escape + backdrop to close
- Drag-and-drop: native HTML5 (no @dnd-kit — keep bundle small)
- PDF: Puppeteer with HTML template + placeholder fallback
- Invoice lifecycle: DRAFT → SENT → PENDING → OVERDUE/PAID
- Partial payments tracked separately
- P&L labor cost: average team member rate × hours (per-member hour tracking deferred)
- Time entry: always belongs to logged-in user (enforced, not from body)
- Team utilization recalculates automatically on time entry create/delete
- Document storage: S3-compatible (AWS S3 or Cloudflare R2 presigned URLs)
- Notifications: in-app bell (topbar), email via Resend (fire-and-forget)
- PWA: manifest + minimal SW (Add to Home Screen works)

## Portal Access Pattern
```
URL: /portal/projects/:id?token=XXX
```
- Token = `Client.portalToken` (randomBytes hex string)
- Token verified against DB on every request
- Project ownership checked (client can only see their own projects)
- Documents shown only if `status === 'APPROVED'`
- No NextAuth session in portal — entirely separate auth mechanism

## Key Decisions Pending (Phase 0 Blockers)
| Blocker | Status |
|---|---|
| PDF: Puppeteer vs react-pdf | ⚠️ Puppeteer chosen — install Chrome for full PDF support |
| Dev DB: Docker PostgreSQL vs SQLite risk | TBD |

## Smoke Test + Debug Session (May 2, 2026)
**128 TypeScript/TSX files across 6 sprints** — full smoke test ran with 6 parallel agents.

### Bugs Found & Fixed
| # | Module | Bug | Fix |
|---|--------|-----|-----|
| 1 | Auth | Prisma client never generated (`prisma generate` never run) | Run `npm run db:generate` after `npm install` |
| 2 | Auth | Portal token stored plaintext | Now SHA-256 hash (`portalTokenHash` field) |
| 3 | Auth | Portal auth ignored `portalAccessEnabled` | Now checked in both portal routes |
| 4 | Projects | `NewProjectModal` default enum values wrong (`FIXED_PRICE`/`NATIONAL`) | Fixed to `RESIDENTIAL`/`FIXED_FEE` |
| 5 | Projects | `ProjectDetailPanel` stale state on close | Added `useEffect` on `[projectId]` to reset state |
| 6 | Projects | Null safety on relation fields (`avatarInitials`) | Added `?.` + `?? ''` |
| 7 | Projects | No AbortController for in-flight fetch | Added `AbortController` + cleanup |
| 8 | Projects | No error state on fetch failure | Added `error` state + error UI |
| 9 | BD | `aiAnalysis` field missing from Prisma schema | Added `aiAnalysis String?` to Lead |
| 10 | BD | `GoNoGoScore` renders `null` as text | Fixed null check to `overallScore == null` |
| 11 | BD | Stage route overwrote AI `GO` recommendation on WON | Removed forced `aiRecommendation='GO'` |
| 12 | BD | Client contacts clicked → silent no-op | Added friendly note in contacts tab |
| 13 | BD | `ContactsTable` doubled contacts in leads+clients | Deduplication by email added |
| 14 | Finance | `InvoiceDetailPanel` wrong prop type (`invoice=` vs `invoiceId=`) | Fixed to `invoiceId={selectedInvoice?.id}` |
| 15 | Finance | `NewInvoiceModal` missing `open`/`onSuccess` props | Added both props |
| 16 | Finance | Manual PAID transition without payments | Added payment verification |
| 17 | Finance | P&L labor cost used SUM of rates × hours (wrong) | Changed to AVG rate × hours |
| 18 | Finance | `NewInvoiceModal` schema missing `clientId` | API now derives from project if not provided |
| 19 | Finance | PDF generator had no runtime validation | Added descriptive guard |
| 20 | Studio | `TimeTrackingWidget` double-timer bug | Added `clearInterval` before new interval |
| 21 | AI | Chat SSE `reader` ReferenceError in `cancel()` | Moved `reader` to outer scope |
| 22 | AI | `proposal-store.ts` in-memory (serverless-fatal) | Replaced with Prisma `ProposalDraft` model |
| 23 | AI | `income-forecast` null ref on unassigned leads | Added `?.name ?? 'No asignado'` |
| 24 | AI | `income-forecast` null ref on projects without client | Added `?.name ?? 'N/A'` |
| 25 | Prisma | `Lead.convertedToProject` relation misdefined | Fixed FK + back-relation |
| 26 | Prisma | `npx prisma generate` failed (4 P1012 errors) | Now passes ✅ |

### Setup Required to Run
```bash
cd "C:\Users\KB\Documents\Open code\Chao RCM"
npm install
npm run db:generate   # generates Prisma client from schema
npm run db:push       # creates/migrates DB tables
npm run db:seed       # seeds admin + team + sample data
npm run dev           # starts dev server on :3000
```
**Env vars needed:** `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `DATABASE_URL`, `ANTHROPIC_API_KEY`
See `.env.example` for full list.

## What's Left (v1)
- Sprint 7 complete — all planned work done ✅
- Client detail modal (BD contacts tab) — contacts shown for reference only, no full CRUD yet
- Kanban concurrent drag race condition (no optimistic locking) — deferred to v2
- Real PNG icons for PWA (replace `public/icons/icon.svg` with 192×192 and 512×512 PNGs)
- CI deploy step — currently placeholder, configure DEPLOY_URL + Vercel/Railway action to enable

## Last Updated
May 2, 2026