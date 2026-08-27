# AthassMediSync — Full System Audit (Phase 1)

**Date:** 2026-08-27
**Scope:** Complete read-only audit of the existing codebase before any rebuild work.
**Verdict:** The data schema and core transaction design are solid. The problems are (1) a layer of duplicated/shadowed backend routes where the *worse* copy is the one that runs, (2) a set of concrete business-logic bugs (GST, expiry, cost math, timezone), (3) a uniformly "AI-generated" glassmorphism UI, and (4) fragile infra (licensing lockout, Electron security, backups). None of this requires a from-scratch rewrite — it needs disciplined cleanup and a new design layer.

---

## 1. What the system is

A pharmacy billing & inventory desktop app for small/medium Indian medical stores.

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, no router (page switch via `activePage` state in `App.jsx`), Fuse.js search, Recharts, lucide-react |
| Backend | Express + better-sqlite3 (`server/`), synchronous transactions |
| Desktop | Electron wrapper (`electron/main.js`) running the Express server in-process |
| DB | SQLite (WAL), created at runtime at `data/pharmacy.db` — not committed |
| Subsystems | Licensing/activation, AES-256 encryption (customer phone/address at rest), WhatsApp (whatsapp-web.js + puppeteer), backups, audit log, jsPDF invoices |

**Core domain model (verified):** batch-wise inventory (FEFO by expiry), per-medicine GST, customer credit ("Udhaari"), Schedule H1 register for controlled drugs, and `tablets_per_strip` to sell loose tablets vs full strips.

**Important data-model conventions (non-obvious, confirmed in code):**
- `batches.quantity` is stored in **individual tablets/units**.
- `batches.mrp` / `selling_rate` / `purchase_rate` are **per-strip** (per pack of `tablets_per_strip`) prices. Billing divides MRP by `tablets_per_strip` to get the per-tablet price.
- Billing charges the customer **MRP**, not `selling_rate` (see Open Question Q1).

---

## 2. How this was verified

Every source file was read directly. Backend routes were traced to determine which of several duplicate definitions actually executes (Express binds the **first** registration; later duplicates are dead code). Frontend field access was cross-checked against the *active* backend response shapes. No files were modified during the audit. Runtime/build verification is set up in a Linux sandbox copy (better-sqlite3 + vite build + seeded API smoke tests) for Phase 2 onward, since the live project lives on a network drive.

---

## 3. Critical (P0) issues — correctness & lockout

These break money math, stock integrity, or can lock the user out. They are the top of the Phase 2 list.

1. **GST is added on top of MRP.** `POST /api/invoices` computes `total = subtotal + gst − discount` (index.js L946) and the UI mirrors it (`calculateGstFromTotal`). Since Indian MRP is legally tax-inclusive, this pushes bill totals **above MRP**. → Switch to GST-**inclusive**: extract tax out of the price (`taxable = price/(1+gst/100)`), never add it on.

2. **Expired batches can be sold.** Invoice creation validates existence and quantity only (L926–930); there is no expiry check anywhere in the sell path. → Block expired batches at add-time and server-side.

3. **Purchase cost inflated ~10×.** Purchases multiply a *per-strip* rate by a *total-tablet* quantity (`quantity × purchase_rate`), so both the purchase total and the stored `purchase_rate` are inflated by `tablets_per_strip`. This corrupts cost basis and every profit/margin figure downstream.

4. **Duplicate batches / negative-stock path.** Restocking an existing batch in Purchases doesn't send `batch_id`, so the backend always inserts a **new** batch row (split stock, duplicate batch numbers). Combined with per-line stock validation, duplicate same-batch lines can drive stock negative.

5. **License lockout on a valid machine.** `license.js` derives the hardware ID via a PowerShell call and, on any transient failure, falls back to a **random UUID**. Because the license binds to the original HWID, one failed call makes the app think it's on a different computer and the gate middleware returns HTTP 402 for **every** `/api/*` route — total lockout.

6. **"Today" is computed in UTC.** The active dashboard derives the current day from `new Date().toISOString()` while the DB stores local time, so between 00:00–05:30 IST the dashboard shows the wrong day's sales/cash/UPI/credit.

---

## 4. Backend audit (`server/`)

### 4a. Duplicate / shadowed routes (dead code that hides better logic)
Express uses the **first** definition; the later, usually *better*, one never runs.

| Route | Active (runs) | Dead (better) |
|---|---|---|
| `/api/dashboard` | L154 — UTC "today", hardcoded thresholds | L1284 — local date, reads settings |
| `/api/reports/sales` | L348 — no cash/UPI/credit split | L1332 — has the split |
| `/api/reports/profit` | L366 — **join fan-out inflates revenue ×item-count** | L1350 — correct separate sums |
| `/api/reports/outstanding` | L384 | L1362 |
| `/api/reports/daily-chart` | L399 — gaps on zero-sale days | L1562 — zero-filled |
| `/api/reports/h1-register` | L412 — ignores search filters | L1409 — supports filters |

→ **Resolution:** keep one correct implementation per metric, delete the shadow. (Note: `Reports.jsx` actually calls `/reports/sales-summary`, which is fine — the dead `/reports/sales` is not user-facing.)

### 4b. Business-logic bugs
- **`/api/reports/profit` fan-out:** joins `invoice_items` then `SUM(total_amount)`, multiplying each invoice's total by its item count. Revenue is wildly overstated.
- **`/api/reports/low-stock` uses INNER JOIN batches** → medicines with **zero** batches (the most critical to reorder) are excluded. Should LEFT JOIN.
- **Dashboard ignores Settings:** hardcodes low-stock `<= 30` and expiry `+90 days` instead of `low_stock_threshold` / `expiry_alert_days`.
- **`reconcile-balances` wipes legitimate credit:** it only sums `payment_mode = 'pending'`, but credit is created for `'udhaari'` and any partial payment too, so reconciliation zeroes real balances.
- **Bill-level discount applied after GST**, while GST is computed on pre-discount totals — order-of-operations inconsistency (folds into the GST-inclusive rework).
- **Purchase edit desyncs the supplier ledger:** `PUT /api/purchases/:id` overwrites `amount_paid` without inserting/adjusting a `supplier_payments` row (unlike create), so outstanding/paid reports drift.

### 4c. Infra / lifecycle
- **`initWhatsApp(app)` called twice** (L87 and inside `app.listen` L1677). It only registers routes (doesn't start a client), so the effect is duplicate *dead* route registration — benign but should be removed.
- **Auto-backup on every server boot** with **no retention/pruning** → `data/backups` grows unbounded (worse in dev with frequent restarts).
- **WhatsApp client leak:** reconnect/logout paths reassign `client` without `destroy()`, orphaning Chromium processes and leaving stale event handlers mutating shared status; a logout-then-connect race can spawn two clients.
- **No real restore path:** "restore" is a manual file-copy instruction that ignores the WAL `-wal`/`-shm` sidecars → stale/corrupt data risk.
- **Audit log has no real user attribution** (`userName` always `'System'`).

---

## 5. Frontend audit (`src/`)

**Billing (`Billing.jsx`) — highest-priority workflow.** Solid keyboard-first design (7 counters, F2 search, Enter-to-save, Alt+1–7). Issues: GST-on-top math; no expiry guard when adding a medicine; `medicines/customers/doctors` fetched once on mount so stock is stale after a sale until reload; sessions persisted to `localStorage` can carry stale prices/stock across days; payment modes are `Cash/UPI/Pending` (UI "Pending" = credit, backend expects `pending`/`udhaari`); heavy inline glass styling.

**Purchases (`Purchases.jsx`).** The 10× cost bug and duplicate-batch bug (§3). Edit loses original payment mode/notes and desyncs the ledger. All errors use `alert()`.

**Inventory (`Inventory.jsx`).** GST 0% is silently saved as 12% (`parseInt || 12` on the client and `gst_percent || 12` on the server). CSV import uses a naive split with no quote handling. Uses `window.confirm`. Over-posts server-computed fields (`total_stock`, `nearest_expiry`) on edit.

**Bills (`Bills.jsx`).** "Clear filter" is broken (stale-closure `setTimeout(fetchInvoices)` re-sends the old range). No default limit → the entire invoice history loads on every visit. Credit bills render green (only literal `'Pending'` is flagged red). `.toFixed` on possibly-null values.

**Non-Moving (`NonMovingMedicines.jsx`).** Discount modal allows `selling_rate` above MRP or below purchase cost (no guard); divide-by-zero when MRP is 0.

**Dashboard (`Dashboard.jsx`).** All figures come from the buggy active `/api/dashboard` (UTC day, hardcoded thresholds, zero-day chart gaps, "Monthly Profit" is really cash-flow = sales − purchases, not COGS-based gross profit). Fetches once, never refreshes after a sale.

**Reports (`Reports.jsx`).** Sales tab endpoint is fine, but the chart groups by `created_at.split('T')[0]` while timestamps are space-separated (`YYYY-MM-DD HH:MM:SS`), so every invoice becomes its own bucket. `payment_mode.toLowerCase()` crashes the tab on a null mode. Default date range is off-by-one in IST (UTC serialization). `renderChart()` runs twice per render.

**Customers / Doctors / Suppliers.** Fetch-per-keystroke with no debounce/cancellation → out-of-order races can show stale results. Suppliers has backend support for recording payments and viewing history but **no UI** for it. `.toFixed` on nulls.

**Settings (`Settings.jsx`).** The whole-object `PUT /settings` re-writes `whatsapp_*` keys from stale defaults, which can **clobber** config owned by `WhatsAppSetup`. `shop_email` isn't a defaulted key. Network server URL lives only in `localStorage` (needs an app restart).

**Activation (`Activation.jsx`).** The single heaviest glassmorphism offender — fully inlined `backdrop-filter: blur(20px)`, translucent white, gradients, SF Pro, circular icon badge. Full rebuild.

**Components.** `pdf.js`: the "MRP" column actually prints `unit_price`; the default `action='save'` has no code branch (no-op); CGST/SGST hardcoded as a 50/50 split. `WhatsAppSetup.jsx`: toasts only render in one status branch (invisible elsewhere). `ErrorBoundary.jsx`: clean; "Try Again" only clears the flag (can loop on a deterministic error).

**Seed script (`scripts/seed-demo-data.js`).** Writes dates as `MM/YYYY` instead of ISO `YYYY-MM-DD` (breaks every expiry query and PDF date), uses `payment_mode='Credit'` instead of `pending/udhaari` (reconcile would zero it), and never decrements batch stock. Needs a rewrite that matches the real schema and business rules.

---

## 6. Design system audit

The entire app shares one stylesheet (`globals.css`) and a small set of classes (`glass-card`, `btn*`, `form-input`, `data-table`, `badge*`, `modal*`, `toast*`) plus CSS variables. The look is Orchids-generated "Apple glassmorphism": translucent `rgba` surfaces, `backdrop-filter: blur(20–40px)`, radii of 12–32px, pastel Blue/Lavender/Mint/Peach/Rose accents, hover-lift transforms, pill nav. Per the confirmed direction, this becomes **one cohesive professional enterprise theme**: light neutral background, solid white/subtly-tinted surfaces, dark readable text, a single professional blue primary, green=success / amber=warning / red=destructive, purple only where meaningful (UPI); tables over cards; tight spacing; no glass/blur/neon.

**Key leverage:** because every page consumes the shared classes and tokens, rebuilding `globals.css` (tokens + base components) de-glasses most of the app in one move. Residual inline `rgba`/`blur` styles get cleaned per-module in Phases 3–5.

---

## 7. Open questions for you (do not block foundation)

- **Q1 — MRP vs selling price:** Billing currently charges **MRP** and ignores `selling_rate`; the Non-Moving "discount" edits `selling_rate`, which therefore has no effect on bills. Should bills charge `selling_rate` (allowing discounts to matter), keep charging MRP, or charge `min(selling_rate, MRP)`? *(Recommendation: charge `selling_rate`, defaulting it to MRP, so discounts work and MRP stays the ceiling.)*
- **Q2 — Purchase entry unit:** enter quantity as tablets or as strips? *(Recommendation: enter strips + free tablets, store tablets — matches how stock is counted and fixes the cost bug cleanly.)*
- **Q3 — GST split:** always CGST/SGST 50/50 (intra-state), or support IGST for inter-state customers? *(Recommendation: 50/50 for now, revisit if you sell across states.)*

---

## 8. Foundation plan (Phase 2 — before the module-by-module redesign)

1. **Verification harness** — sandbox copy that builds the frontend (`vite build`) and runs the seeded API for smoke tests, so every change is checked and regressions are caught.
2. **Backend cleanup** — delete shadowed routes (keep the correct copy), fix profit fan-out, low-stock LEFT JOIN, dashboard timezone + settings thresholds, reconcile-balances credit logic, remove double `initWhatsApp`, add backup retention.
3. **GST-inclusive money model** — one shared money utility used by both server and client; extract tax from price; total never exceeds MRP; consistent discount ordering.
4. **Expiry & stock guards** — refuse expired batches on sell; prevent negative stock from duplicate lines.
5. **Professional design system** — rebuild `globals.css` tokens + base components (buttons, inputs, tables, badges, modals, toasts, empty/loading/error states).
6. **App shell** — Sidebar, Header, layout, toast host re-skinned to the new system.
7. **Architecture tidy** — shared UI components, centralized validation/constants, remove dead code, without over-engineering.
8. **Foundation checkpoint** — present this audit + the rebuilt foundation (design system, shell, corrected backend, GST model, green build) for your review **before** redesigning each module (Phases 3–6: Inventory, Purchases, Billing, Credit, then Customers/Doctors/Suppliers/Dashboard/Reports/Settings, then polish + full verification).

Licensing and WhatsApp UX are in scope to modernize. **`server/encryption.js` is left untouched** (graded coursework); only its integration is bug-fixed if needed.
