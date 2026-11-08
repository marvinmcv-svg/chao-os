# CHAO OS — Product, UX & Competitive Audit (Nov 2026)

Scope: full review of the Next.js app (8 modules, 45 API routes), hands-on testing in a real browser against a seeded Postgres database, and a competitive scan of architecture-practice platforms. This document records what was found, what was changed in this pass, and what is still open.

---

## 1. Where CHAO OS is strong

- **Architecture-native data model.** Projects → SD/DD/CD/CA phases with fee per phase, milestones, lead → project conversion, client portal tokens. This matches how studios actually bill, unlike generic CRMs (HubSpot, Pipedrive) the original brief drew on.
- **Solid backend foundation.** Service layer (`services/*`), typed domain errors, `withApiHandler` envelope, audit log on every mutation, an N+1 fix in capacity, and 327 passing tests.
- **Security instincts are good.** Portal tokens are stored as SHA-256 hashes, ownership is enforced inside the query, login does not leak user existence, and APIs return 401 JSON (not HTML redirects).
- **Local fit.** Spanish UI, USD/BOB with exchange rate, America/La_Paz time — none of the global Titans serve Bolivia well.
- **Editorial visual identity.** DM Serif Display + DM Mono + Syne on a dark, black-and-white base reads like an architecture studio, not a SaaS template.

## 2. What was broken (verified in the browser, now fixed)

| # | Area | Problem | Impact |
|---|------|---------|--------|
| 1 | Design system | `tailwind.config.ts` set `green/red/yellow/blue` to single hex values, **wiping the whole Tailwind scale**. Every `text-green-400`, `bg-red-900/20`, `bg-yellow-400` in the app generated no CSS. | All progress bars, alerts and status colours invisible; stray borders rendered near-white. |
| 2 | Projects | `/api/projects` returns `{ projects, total… }`; page read `data` as an array → `filter is not a function`. | **Projects page crashed.** Same bug emptied project pickers in time-tracking and new-invoice. |
| 3 | Client portal | Middleware sent every unauthenticated request to `/login`, including `/portal/*` and `/api/portal/*`. | **No client could ever open the portal.** |
| 4 | Finance | Page rendered hard-coded mock invoices/P&L from a different business (TechCorp, MediaLab…). Detail panel then 404'd on fake IDs. | Finance module showed fiction. |
| 5 | Finance | "Mark paid" required payments that could not be recorded anywhere in the UI; the error was swallowed. | Invoices could never be paid. |
| 6 | Finance API | Cash-flow dropped past-due invoices and ignored `SENT`; P&L ignored `SENT`/`OVERDUE` revenue and costed every hour at a flat rate. | Wrong numbers. |
| 7 | Invoices | `milestoneLabel` accepted by the API and silently dropped (no column). | Billing milestone lost. |
| 8 | BD | Stage buttons in the lead modal never called the API; "Convert to project" guard was inverted so it could never run; moving to Lost kept the old probability. | Core pipeline flow non-functional; weighted pipeline inflated. |
| 9 | BD | Seed score keys (`margin`, `clientHistory`…) differ from AI keys (`financialScore`…) → Go/No-Go bars with no labels. | Unreadable scoring. |
| 10 | New project | Required typing raw database IDs for client and PM; sent `yyyy-mm-dd` to an API expecting ISO datetimes; rendered an error object (React crash). | Impossible to create a project. |
| 11 | AI | Alerts and forecast returned 500 without `ANTHROPIC_API_KEY`; chat drawer auto-opened and covered the page; chat had no access to studio data and pointed users at non-existent routes. | AI page unusable. |
| 12 | Utilisation | Dashboard read a stored `utilizationPercent` while Studio computed from timesheets → 76% vs 0% for the same team. | Contradictory KPIs. |
| 13 | Portal | Stray Chinese text ("项目经理"); all milestones labelled "Approved"; phase `spentUSD` (internal cost) sent to the client. | Trust and data-leak issues. |
| 14 | Documents | Detail panel passed the PM as "current user" and hard-coded role `ARCHITECT`. | Wrong approve/delete permissions. |
| 15 | Platform | `withApiHandler` swallowed Next.js control-flow errors; middleware redirected `/sw.js` to `/login`. | Noisy builds; PWA install broken. |
| 16 | Layout | Fixed 240px sidebar with no mobile mode; double page padding; placeholders ("Sprint 2", "Sprint 6") shipped as tabs/pages. | Unusable on phones; unfinished feel. |

## 3. Competitive landscape

| Platform | Positioning | Signature strengths | What CHAO OS takes from it |
|---|---|---|---|
| **Deltek Vantagepoint** | ERP for mid/large A&E | CRM + projects + resource planning + financials in one; utilisation views | Single source of truth for utilisation; integrated CRM → project flow |
| **Monograph** | Practice ops for small/mid architecture firms | **MoneyGantt** — schedule and fee on one timeline; phase budgets; client portal | Fee timeline with phases + earned value (built) |
| **BQE CORE / ArchiOffice** | Time, billing, accounting for A&E | Time by phase, progress reports vs. budget, invoicing from timesheets | Phase-aware time entries; progress billing (built) |
| **Factor** (acquired by Total Synergy, 2025) | Fee planning for A&E | Budgets by phase (SD/DD/CD/CA), fixed-fee + hourly, AIA-style progress billing, approvals | Bill by % of phase fee (built) |
| **Synergy** | AEC PM, ANZ/UK | Bottom-up revenue forecast weighted by likelihood; drag-and-drop resourcing Gantt | Weighted pipeline + backlog + cash-flow forecast (built/improved) |
| **Mosaic** | AI resource planning for A&E | Person × week **workload heatmap**, AI hiring/workload forecasts | Workload heatmap (built) |
| HubSpot / Pipedrive | Generic CRM | Pipeline UX, ⌘K speed | Kanban polish, command palette (built) |

### Gap matrix (after this pass)

| Capability | Titans | CHAO OS before | CHAO OS now |
|---|---|---|---|
| Phase fee timeline (MoneyGantt-style) | Monograph, Synergy | Placeholder tab | ✅ Timeline + earned value + CPI |
| Workload heatmap | Mosaic, Vantagepoint | Table only | ✅ 6 weeks actual + 4 weeks planned |
| Progress billing by phase % | Factor, BQE | ✗ | ✅ |
| Payments / partial payments | All | ✗ (no UI) | ✅ |
| Earned value / CPI | Vantagepoint, BQE | ✗ | ✅ Per project |
| Client portal | Monograph | Broken | ✅ Working, dark, localised, links managed from Clients |
| Weighted pipeline + forecast | Synergy, Vantagepoint | Partial | ✅ Rules-based, Claude-enhanced |
| Global search / ⌘K | Modern SaaS | ✗ | ✅ Projects, leads, invoices, clients, actions |
| Mobile | All | ✗ | ✅ Responsive shell |
| Time-off / holidays in capacity | Vantagepoint, Mosaic | ✗ | ✅ Phase 2: Bolivian calendar, studio closures, absence approvals |
| Expenses & reimbursables UI | BQE, Vantagepoint | Model only | ✗ |
| Fee proposals / estimates | Factor, Monograph | AI draft endpoint only | ✗ (no UI) |
| Accounting sync (QuickBooks/Xero/SIN-Bolivia e-invoicing) | All | ✗ | ✗ |
| Change orders / additional services | Factor, Vantagepoint | ✗ | ✗ |
| Resource scheduling (assign hours forward) | Mosaic, Synergy | ✗ | ✅ Phase 2: weekly allocations, drag-to-reassign planner |
| Task board / RFIs / submittals | Monograph, Procore-adjacent | Model only | ✗ |

## 4. Design system changes

- One token set: neutral, very slightly warm `g05…g95` scale shared by Tailwind and CSS variables, with a warm "trace paper" accent (`#d6c7a1`) for focus, active nav and highlights.
- Stock Tailwind status scales restored; status colours are reserved for state and always paired with a label.
- Chart palette validated for the dark card surface (lightness band, chroma, CVD ΔE ≥ 8, ≥ 3:1 contrast): blue `#3987e5`, orange `#d95926`. Sequential single-hue ramp for the heatmap; over-capacity uses red as a status, never as a series colour.
- New primitives: `PageHeader`, `StatCard`, `Panel`, `Drawer`, `EmptyState`, `Skeleton`, `ErrorBanner`, `Segmented`, `Textarea`; `lib/labels.ts` centralises every Spanish label (no more raw `PAID` / `IN_PROGRESS` on screen).
- Shell: grouped sidebar (Operación / Negocio / Sistema), mobile drawer, ⌘K palette, deep links (`/projects?id=…`, `/bd?lead=…`, `/finance?invoice=…`, `?new=1`).
- Loading skeletons, empty states with actions, and recoverable error banners on every page; reduced-motion respected.

## 5. Recommended roadmap

1. ~~**Capacity realism:** time-off and holidays (Bolivian calendar), forward resource allocation per project/phase, drag-to-reassign on the heatmap.~~ Done in Phase 2 (§7).
2. **Fee proposals:** estimate builder by phase → proposal PDF → becomes the project budget on win (closes the BD → project loop like Factor).
3. **Change orders & additional services** with client approval in the portal.
4. **Expenses & reimbursables** UI, billable markup, receipt upload (S3 is already wired).
5. **Bolivian e-invoicing (SIN)** and accounting export; BOB-first invoices.
6. **Portal documents:** stored `url` is an S3 key, not a link — serve presigned GET URLs for approved documents.
7. **Data quality:** project `totalSpentUSD` should be derived from timesheets × cost rate + expenses rather than entered, so earned value and CPI are live.
8. **Roles:** enforce role-based visibility of fees and margins (architects should not see firm-wide P&L).

## 6. How this was verified

- `npm run typecheck`, `npm run lint`, `npm run test:run` (327 tests, incl. new portal middleware regression tests), `next build`.
- Playwright end-to-end run against a seeded Postgres: login → ⌘K → project drawer → edit phase progress → fee timeline → create project (with client/PM pickers) → invoice by phase % → issue → record payment → paid → P&L/cash-flow → create lead → heuristic score (no API key) → advance → win → convert to project → log hours → generate portal link → open portal **anonymously** → bad-token rejection → settings → mobile viewport (no horizontal scroll). 16/16 passed, zero console errors.

## 7. Phase 2: capacity realism

**Calendar** (`lib/calendar.ts`): Bolivian national holidays, both fixed and Easter-based (Carnaval lunes/martes, Viernes Santo, Corpus Christi). A fixed holiday that falls on a Sunday is observed on Monday (DS 1210). The departmental holiday defaults to Santa Cruz (24 Sep); set `STUDIO_DEPARTMENT=LPZ|CBA` to change it. Studio closures live in `StudioHoliday`. Week maths uses UTC day keys; "today" is taken in America/La_Paz.

**Absences** (`TimeOff`): full-day spans with a request → approve flow. Anyone can request their own. PRINCIPAL/ADMIN can register absences for anyone (auto-approved) and approve or reject requests. Overlapping requests are refused. Approvers and requesters are notified. Only approved absences reduce capacity.

**Capacity everywhere:** `StudioService.getCapacity` now measures utilisation against *available* hours (contract hours minus holidays and approved absences). Pace compares logged hours with the hours expected up to today on working days only, so a holiday Monday no longer makes the team look behind. The same figures feed the Studio overview, dashboard KPIs, dashboard alerts and AI alerts.

**Forward allocation** (`Allocation`): hours per person × project (× phase) × week. The Studio → Planificación tab shows 8 weeks per person, with load bars, holiday and absence markers, team totals, and unscheduled task demand. Allocation chips can be dragged to another person or week; dropping onto the same project merges the hours. Clicking a cell opens an editor (add with "repeat N weeks", edit, reassign, remove), which is also the keyboard and touch path. PRINCIPAL, ADMIN and ARCHITECT_SENIOR can edit; everyone else gets a read-only view. The workload heatmap's future weeks now show allocations rather than task due dates.

**Verified:** 368 unit tests (including 18 calendar and 20 capacity-service tests), typecheck, lint, `next build`, and a 26-step Playwright run against seeded Postgres. That run covered drag-to-reassign, merge, repeat, drawer reassign, BIM read-only and 403s, request → approve → capacity drop and notification, studio closure, duplicate and overlap rejection, heatmap, dashboard pace, and mobile with no horizontal scroll. Zero console errors.
