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
| Expenses & reimbursables UI | BQE, Vantagepoint | Model only | ✅ Phase 5: approval flow, receipts, BOB/USD, rebilling with markup, staff reimbursement |
| Fee proposals / estimates | Factor, Monograph | AI draft endpoint only | ✅ Phase 3 (see below) |
| Accounting sync (QuickBooks/Xero/SIN-Bolivia e-invoicing) | All | ✗ | ◐ Phase 6: SIN fiscal invoices (number, CUF, QR, Bs), Registro de Ventas + journal CSV; live SIAT transmission pending credentials |
| Change orders / additional services | Factor, Vantagepoint | ✗ | ✅ Phase 4: client approval in the portal, contract fee/phase/end date update on approval, invoice from an approved change |
| Resource scheduling (assign hours forward) | Mosaic, Synergy | ✗ | ✅ Phase 2: weekly allocations, drag-to-reassign planner |
| Fee proposal → project budget | Factor, Monograph | ✗ | ✅ Phase 3: estimate by phase × role, versioned proposals, printable PDF, budget on win |
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
2. ~~**Fee proposals:** estimate builder by phase → proposal PDF → becomes the project budget on win (closes the BD → project loop like Factor).~~ Done in Phase 3 (§8).
3. ~~**Change orders & additional services** with client approval in the portal.~~ Done in Phase 4 (§9).
4. ~~**Expenses & reimbursables** UI, billable markup, receipt upload (S3 is already wired).~~ Done in Phase 5 (§10).
5. ~~**Bolivian e-invoicing (SIN)** and accounting export; BOB-first invoices.~~ Done in Phase 6 (§11), except live transmission to the SIAT, which needs the studio's SIN credentials.
6. ~~**Portal documents:** stored `url` is an S3 key, not a link — serve presigned GET URLs for approved documents.~~ Done in Phase 7 (§12).
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

## 8. Phase 3: fee proposals

**Estimate builder** (`FeeProposal`, `lib/fees.ts`): each lead gets one proposal number (`PRO-YYYY-NNN`) with any number of versions. A version holds the four phases (SD/DD/CD/CA), each with a duration in weeks, an "included" flag and staff lines (role × hours × billing rate). Entering the built area and pressing the wand fills a starting estimate: area × design hours per m² for the project type, split 15/25/40/20 across phases and by a per-phase role mix, with durations scaled by size. Billing rates default to a rate card (principal $85/h down to admin $30/h) and are editable per line. A discount (max 50%) applies to the total and pro rata to each phase.

**Internal economics:** the same hours priced at the team's average cost rate per role (from `TeamMember.hourlyRate`) give the estimated cost and margin. The margin is flagged below 20% and is only shown to PRINCIPAL, ADMIN and ARCHITECT_SENIOR. Everyone else gets client-facing figures only; the API strips cost fields for them (first step toward roadmap item 8).

**Lifecycle:** DRAFT → SENT → ACCEPTED or DECLINED. Only drafts are editable. "Nueva versión" copies a sent, declined or superseded version into a new draft. Sending a version supersedes other sent versions, records the fee as the lead's estimated value and moves PROSPECT/QUALIFIED leads to PROPOSAL. Accepting one supersedes the other open versions and moves the lead to WON at 100%.

**Proposal PDF:** `/proposals/:id/print` is an A4 print layout: client and project, scope, fee per phase with %, subtotal, discount and total, effort by role, a week-by-week phase timeline, payment terms, exclusions and signature blocks. "Imprimir / Guardar PDF" uses the browser print dialog (no headless Chrome needed on Vercel). Drafts carry a "no válido como oferta" banner. Cost and margin are never rendered.

**Budget on win:** converting a WON lead now uses its accepted proposal. The project budget becomes the proposal fee, the contract type is carried over, and each phase budget is that phase's fee after discount. Phases are scheduled end to end from the start date, and the estimated end date is the last phase's end. Leads without an accepted proposal keep the previous 15/25/40/20 split.

**Verified:** 401 unit and integration tests (including 13 for `lib/fees` and 19 for `FeeProposalService`, plus a conversion-from-proposal test), typecheck, lint, `next build`, and a 24-step Playwright run against seeded Postgres. That run covered: create, estimate by area, live discount, save, print page with no cost leak, send → lead PROPOSAL, read-only sent version, new version, superseding, accept → WON, Escape closing only the top modal, conversion with budget/phase fees/dates matching, the architect's read-only view with 403 on writes, and mobile with no horizontal scroll. Zero console errors.


## 9. Phase 4: change orders and additional services

**Model** (`ChangeOrder`): each project numbers its own changes `OC-<project code>-NN`. A change is either a *change order* (modifies contracted scope; can be a credit) or an *additional service* (outside the contract; always a charge). It carries a title, scope description, reason, the affected phase (defaulting to the project's current phase), a fee in USD, internal hours and a schedule impact in days (negative shortens the schedule).

**Lifecycle:** DRAFT → SENT → APPROVED or REJECTED. Drafts can be edited or deleted. A sent change can be withdrawn back to draft, or voided. Decided changes are immutable. PRINCIPAL, ADMIN, ARCHITECT_SENIOR and the project's own PM manage change orders. Everyone else gets a read-only view, and the API returns 403 on writes.

**Client approval in the portal:** sent changes appear at the top of the client portal under "Pendiente de tu aprobación", with scope, reason, phase, fee and schedule impact. The client approves or rejects by typing their full name (recorded as the signature), with an optional comment. The token travels in the POST body, not the URL, and the endpoint is rate-limited per IP (429). Ownership is enforced through the token's client, then the project, then the change order. Drafts and voided changes are never sent to the portal, and requests for them return 404. Decided changes and a contract summary (original fee, approved changes, current fee) appear below the phases. If the client signs on paper instead, staff can record the decision ("registrada por el estudio") with the signer's name.

**Effect on the contract:** approval raises (or lowers) `Project.totalBudgetUSD` and the affected phase's fee, and moves the estimated end date, all in one transaction. The decision is a conditional update on `status = SENT`, so a portal click and a staff-recorded approval can never both apply. The loser gets a 422 and nothing is written twice. A credit that would push the fee below zero is refused at send time. The PM, the author and the principals get a `CHANGE_ORDER_DECIDED` notification that deep-links to the project.

**Billing:** an approved, positive change can be turned into a draft invoice in one click. It gets one line item `OC-… — title`, links back to the change order, and can only be invoiced once (a double click discards the duplicate draft). The project drawer shows original contract, approved changes and pending exposure.

**Also fixed:** the portal project endpoint now goes through `PortalService`, so phase `spentUSD` (internal cost) no longer reaches the client, and portal error messages are in Spanish. Escape inside a modal opened from a drawer used to close the drawer too. Drawers and modals now share one overlay stack, so Escape closes only the topmost layer.

**Verified:** 428 unit and integration tests (including 26 for `ChangeOrderService` and new portal tests for change-order visibility, field sanitisation and bad tokens), typecheck, lint, `next build`, and a 17-step Playwright run against seeded Postgres. That run covered: create, edit, send, credit plus void, minting a portal link, anonymous mobile portal with no horizontal scroll and the voided change hidden, no `spentUSD`/`hours`/author in the portal payload, bad token 401, client approval with a typed name, fee/DD-phase/end-date update, a second decision refused with 422, staff summary and notification, invoice from the change, a staff-recorded paper approval, and the architect's read-only view with 403. Zero console errors.

## 10. Phase 5: expenses and reimbursables

**Model** (`Expense`, extended in place so existing rows survive `db push`): category (travel, printing, renders, consultants, permits, models, survey, meals, other), vendor, optional phase, the amount as paid in USD or bolivianos with the exchange rate (default 6.96) and the USD conversion, date, two flags and a status. The flags are *billable* (rebilled to the client at cost × (1 + markup%)) and *paid by staff* (someone fronted it out of pocket). Older rows default to `APPROVED`, so historical P&L does not change.

**Approval:** anyone on the team records an expense from the project drawer (Proyectos → proyecto → Gastos y reembolsables). A team member's expense is `SUBMITTED`, and the PM gets an `EXPENSE_SUBMITTED` notification. Expenses entered by principals, admins or the PM are approved on entry. The PM, principals and admins approve, or reject with a required reason. Nobody but a principal or admin can approve their own expense. The submitter gets `EXPENSE_DECIDED` and can correct a rejected expense, which resubmits it. Decisions are conditional updates on `status = SUBMITTED`, so two reviewers can't both decide (the loser gets 422). Only `APPROVED`/`REIMBURSED` expenses count as project cost in P&L.

**Reimbursement:** Finanzas → Gastos y reembolsos has queues for *Por aprobar*, *Por reembolsar* (with the total owed per person), *Mis gastos* and *Todos*. Principals and admins mark out-of-pocket expenses as reimbursed. PMs see their own expenses and their projects'. Everyone else sees only their own.

**Rebilling:** "Facturar $X" in the drawer creates one draft invoice with a line per approved, billable, unbilled expense (cost + markup, vendor in the description). Each expense is claimed with `invoiceId = null` as a condition. If anything was billed concurrently, the draft is deleted and the claim released. Billed or reimbursed expenses are locked. Deleting the draft invoice releases its expenses (`onDelete: SetNull`).

**Receipts:** PDF, JPG, PNG, WEBP or HEIC, up to 4 MB, uploaded through the API (multipart). They go to S3 under `projects/<id>/receipts/` when S3 is configured (production has the variables), and to Postgres (`ExpenseReceipt`) otherwise, so preview deployments work too. Viewing goes through `/api/expenses/:id/receipt`, which redirects to a 5-minute presigned URL or streams the bytes. The storage key is never sent to the browser.

**Verified:** 460 unit and integration tests (including 32 for `ExpenseService`), typecheck, lint, `next build`, and a 21-step Playwright run against seeded Postgres. That run covered: an architect recording a Bs 348 out-of-pocket, billable expense with a receipt (stored as $50 → $55 billed); the receipt opening inline; self-approval and billing refused with 403; oversize and wrong-type receipts refused; the PM approving and rejecting in the drawer; Escape closing only the modal; drawer totals; the rejection notification and resubmission; the cross-project Finance queue; an admin reimbursement; a PM's reimbursement refused; billing at $187 with markup; a second billing refused with 422 and the billed expense locked; deleting the draft releasing the expenses; P&L counting only approved costs; and mobile with no horizontal scroll. Zero console errors.

**Next:** item 7 (derive `totalSpentUSD` from timesheets × cost rate + approved expenses) now has its expense half in place.

## 11. Phase 6: Bolivian fiscal invoicing (SIN) and accounting export

**Scope and limits.** CHAO OS now prepares everything a computerised online fiscal invoice needs, short of transmitting it to the SIN. Transmission is signed XML over the SIAT SOAP services and needs the studio's delegated token, CUIS/CUFD codes and a digital signature, none of which exist yet. Until then, invoices are issued *fuera de línea* (tipo de emisión 2), shown as **Emitida · pendiente SIN**, and printed with a "PENDIENTE DE VALIDACIÓN SIN" watermark. This holds even if `SIAT_*` variables are set, because nothing is sent. Settings → Integraciones shows the SIAT as not connected.

**Studio fiscal data** (`StudioFiscalSettings`, Configuración → Datos fiscales): NIT, razón social, municipio, address and phone, CAEB activity code, SIN product code, sucursal and punto de venta, modality, environment (pilot/production), the Ley 453 legend, the default Bs/USD rate (6.96) and the chart of accounts for the journal. Issuing is blocked, with a list of what's missing, until the NIT, CAEB and product code are filled in. Only principals and admins can edit.

**Client billing data:** each client has a billing name, a document type (NIT, CI, CEX, passport or other), a number and a complement, edited in Clientes → client → Datos de facturación. NIT and CI must be digits, and a NIT has no complement. A client without a NIT/CI can't be invoiced, and the error links to Clientes.

**Issuing** (Finanzas → factura → *Emitir factura fiscal*; principals and admins only). In one transaction, it takes the next number from an atomic counter, converts each line to bolivianos (rounded per line; the total is the sum of the lines), snapshots the buyer's name and NIT/CI and the legend, and computes the **CUF**. The CUF is NIT(13) + local timestamp with milliseconds (17) + sucursal(4) + modalidad + tipo emisión + tipo factura + documento sector(2) + número(10) + punto de venta(4), plus SIN's módulo 11 check digit, converted to base 16, plus the CUFD control code (empty without a CUFD). A lost race rolls back the counter, so no number is ever burnt. A draft becomes *Enviada* (the client is emailed).

After issue, the amount, currency and rate are frozen and the invoice can't be deleted; only notes and the due date can change. Annulling takes a SIN reason code (1–4) and is refused while payments exist. An annulled invoice accepts no payments, and its number is never reused. The SIN's deadline for annulments isn't enforced: confirm it with your accountant.

**BOB first:** new invoices default to bolivianos at the studio rate, and the amount is entered in Bs (USD stays the internal base for analytics). The invoice drawer and Finance list show Bs first, with USD below. Payments are entered in Bs, and paying the full Bs balance settles the exact USD balance, so rounding never leaves a stray cent.

**Printing** (`/invoices/:id/print`, browser print to PDF, which works on Vercel unlike the old Puppeteer placeholder). It follows the SIN graphic representation: issuer block, NIT, invoice number and CUF, buyer data, a detail table in Bs with the SIN product code, subtotal/discount/total/gift card/amount to pay/credit base, the amount in words ("Son: … 00/100 Bolivianos"), the legends, and a verification QR for `siat.impuestos.gob.bo` (or `pilotosiat` in the pilot environment). Invoices not issued to the SIN print as a "Nota de cobro" marked "sin valor fiscal".

**Taxes and exports** (Finanzas → *Impuestos y contabilidad*): a month picker in Bolivian time, monthly sales, IVA débito fiscal at 13% (Formulario 200), IT at 3% (Formulario 400), and how many invoices are pending SIN validation or were sent without a fiscal invoice. There are two CSV exports:
- **Registro de Ventas**: the 24-column RCV layout. Valid invoices are `V` with base and débito fiscal; annulled ones are `A` with zeros.
- **Libro diario**: issue (Dr receivables / Cr revenue 87% + IVA 13%; Dr IT expense / Cr IT payable 3%), collection (Dr banks / Cr receivables at the invoice rate) and an annulment reversal. Totals balance.

Have an accountant review both layouts before filing.

**Deploy safety:** the new invoice columns use plain indexes rather than unique constraints. Uniqueness comes from the atomic counter. This keeps `prisma db push` in the Vercel build free of data-loss prompts, which would otherwise fail the deploy.

**Verified:** 499 unit and integration tests (including 24 for `lib/siat`, covering módulo 11, the CUF layout, Bolivian time, amounts in words up to millions with *veintiún*/*un* apocope, taxes and the QR URL, and 15 for `FiscalService`, covering issue, races, annulment, the RCV and a balanced journal), typecheck, lint, `next build`, and a 15-step Playwright run against seeded Postgres with zero console errors. The run covered: completing the studio's fiscal data; client NIT validation; a new invoice in Bs (Bs 69,600 → $10,000); issuing invoice N° 1 with a CUF, the buyer snapshot and draft → sent; the print page with legal text, amount in words, QR and watermark; the issued invoice refusing edits and deletion; issuing refused for a client without NIT; invoice N° 2 annulled with a SIN reason and its payment refused; a payment in Bs settling exactly; monthly IVA and IT; the RCV CSV with V/A rows; a balanced journal; an architect refused with 403 and shown read-only settings; and mobile with no horizontal scroll.

**To go live with the SIN:** register the system with the SIN (*sistema propio*), obtain the delegated token, CUIS and digital signature, and implement CUFD retrieval plus XML signing and submission. The CUF and the QR are already in place.

## 12. Phase 7: secure document downloads in the client portal

**The bug:** the portal sent each approved document's `url` straight to the browser, but `url` is the S3 object key (`projects/<id>/documents/…`), not a link. Every download in the portal was broken, and the bucket layout leaked to the client.

**Fix:** the portal payload no longer includes the storage key. It carries only id, filename, type, size, date and phase, and only for `APPROVED` documents. Each link points to `GET /api/portal/project/:id/documents/:docId?token=…`. That endpoint follows the ownership chain token → client → project → approved document in a single query, and redirects (302, `no-store`, `no-referrer`) to a **5-minute presigned S3 URL**:
- PDFs and images open inline; CAD and other files download as attachments.
- Filenames with accents survive (an ASCII fallback plus RFC 5987 UTF-8).

Failures redirect back to the portal (`?doc=…#documentos`) with a message in Spanish instead of raw JSON. That covers a document that's pending, rejected, another client's or deleted (all reported as "not available", without revealing which documents exist), a revoked link, missing storage and the rate limit (30 per minute per IP; the portal limiter now takes a per-endpoint cap).

**Portal UI:** documents are grouped by phase (EP/DD/DC/AO, then general), each with its type, size and date. A note explains that links are personal and expire.

**Staff side:** each approved document shows "El cliente lo descargó N veces · última …" (`portalDownloadCount` and `portalLastDownloadAt`, counted only after a link is signed). Statuses read *Por aprobar / Visible al cliente / Rechazado* instead of raw enum values. Download errors are shown instead of being swallowed, and the new tab opens before the request so popup blockers don't interfere.

**Storage not configured:** presigning and the staff upload and download now throw `STORAGE_UNAVAILABLE`, which maps to HTTP 503 with a clear message instead of a 500 (preview deployments have no S3).

**Verified:** 508 unit and integration tests (6 new portal tests, plus 3 `lib/s3` tests that sign with dummy keys and check the exact key, the 300-second expiry, the inline/attachment disposition and the UTF-8 filename), typecheck, lint, `next build`, and a 13-step Playwright run with zero console errors. Because signing a URL is a local computation, the run used one server with dummy S3 keys and one with no S3. It covered: minting a portal link; no storage key in the payload; only approved documents listed, grouped and sized on mobile without horizontal scroll; a PDF giving a 302 to an inline 5-minute URL for the exact key; a CAD file as an attachment; pending, rejected and cross-client documents and a mismatched project going back with "notfound"; a bad token giving "auth"; no S3 giving "storage"; the banner in the portal; staff seeing the download counts and new labels; a staff upload without S3 returning 503; and the rate limit. The redirect target wasn't fetched (the keys are fake), so a real download against the production bucket still has to be tried.

