# AthassMediSync — Foundation Checkpoint

**Date:** 2026-08-27
**Where we are:** Phase 1 (Audit) and Phase 2 (Foundation) are complete. This is the agreed checkpoint **before** the module-by-module redesign (Phases 3–6). Please review, run the smoke test, and answer the two open questions so I can proceed.

Full technical audit: `REBUILD_AUDIT.md` (same folder).

---

## 1. What the audit found (short version)

The database schema and core transaction design are genuinely solid — this never needed a rewrite. The real problems were four layers on top of it:

1. **Duplicated/shadowed backend routes** where Express runs the *first* (usually worse) copy and the better one is dead code.
2. **Concrete money/logic bugs** — GST added on top of MRP, expired stock sellable, purchase cost inflated ~10×, "profit" that was really cash-flow, a negative-stock path, UTC "today" on the dashboard.
3. **A uniformly "AI-generated" glassmorphism UI** (blur, pastel, oversized cards, pill nav).
4. **Fragile infra** — license lockout on a valid machine, unbounded backups, WhatsApp client leaks.

---

## 2. What I fixed in the foundation

### Backend correctness (non-money)
- Dashboard "today" now uses **local time**, not UTC; low-stock and expiry thresholds now read from **Settings** instead of being hardcoded.
- Low-stock report switched to **LEFT JOIN** so medicines with zero batches (the most urgent to reorder) actually appear.
- 7-day dashboard chart is **zero-filled** (no gaps on no-sale days).
- Removed **6 shadowed duplicate routes** (kept the correct implementation of each).
- `reconcile-balances` no longer **wipes** legitimate udhaari/partial credit (it was resetting everything to only 'pending').
- Removed a duplicate `initWhatsApp` registration; added **backup retention** (keeps the last 20 auto-backups, skips a fresh one if a recent backup exists).

### Money & stock integrity — the big one (now GST-INCLUSIVE)
- **GST is extracted from the MRP, not added on top.** Indian MRP is legally tax-inclusive, so a bill total can now **never exceed the sum of MRPs**. Bill summary shows *Taxable*, *GST (incl.)*, *Discount*, *Total*.
- **Expired batches can no longer be sold** — blocked both when adding to a bill and again server-side at save.
- **Negative stock is prevented** — two bill lines drawing from the same batch are now validated against the batch's *combined* remaining quantity.
- **Purchase cost ~10× bug fixed** — a per-strip rate was being multiplied by a tablet quantity. Cost is now per-strip-rate ÷ tablets-per-strip, everywhere it's shown or stored.
- **Real gross profit everywhere** — the dashboard "Monthly Profit" card and the Profit/Profitability reports now compute *net revenue − actual per-unit cost of goods sold*, with no invoice "fan-out" over-counting. (Previously "profit" was just sales − purchases, so a big restock month looked like a loss.)
- **Verified:** an independent reviewer hand-traced all five money files; **all 12 money/stock invariants pass** and the on-screen totals reconcile with the saved totals **to the cent**. One edge bug (a 0-price line) was found and fixed during that review.

### Design system + app shell
- `globals.css` rebuilt into **one flat, professional light theme**; the glass/blur tokens are neutralized to solid surfaces (all class and variable names preserved, so nothing broke).
- Sidebar, header, toasts, and loading screen re-skinned to the new system.
- **Still to do (per-module, Phases 3–5):** three pages carry residual *inline* glass styling — Activation, Dashboard, Reports — which get cleaned when each of those modules is rebuilt.

---

## 3. Two honesty notes

1. **I can't run a live build on this machine.** The Linux sandbox this environment uses for building/running is disabled here (a virtualization flag), and the project lives on a network drive. So instead of a runtime smoke test, I verified **statically** — reading every consumer of the changed logic and having an independent reviewer hand-trace the arithmetic. That's rigorous, but a real click-through can still surface environment-specific issues, which is why the smoke test below matters.
2. **The deep code refactor is intentionally deferred, not skipped.** Extracting a shared component library (Modal, DataTable, FormField, ConfirmDialog…) and centralizing validation is real value — but doing it as one big blind cross-file change, with no way to catch a broken import here, is exactly the regression risk your brief warns against. I'll extract these components **as each module is rebuilt** (billing/inventory/purchases first), against a screen I can prove works, then generalize. Foundation-level tidy (dead routes, shared money util, shared COGS SQL, neutralized tokens) is already done. (Minor: `react-router-dom` is an unused dependency — flagged for removal in that pass.)

---

## 4. Please run this 5–10 minute smoke test

Your data is demo/seed and safe to reset. Start the app the usual way (`npm run dev` for the browser build at `localhost:5173`, or `npm run electron:dev` for the desktop app). If numbers look off from an earlier state, re-seed with `npm run seed`.

**Billing (highest priority)**
- [ ] Search a medicine, add it, change quantity — the line total and the *Taxable / GST / Total* update instantly.
- [ ] The **Total is ≤ the sum of MRPs** (GST is inside the price, not added on top).
- [ ] Try adding a medicine whose only stock is expired — it should be **refused** ("Only expired stock available").
- [ ] Save a **Cash** bill, a **UPI** bill, and a **Pending/Udhaari** bill. Each saves once (no duplicate on a double-press).

**Stock & credit**
- [ ] After a sale, the medicine's stock **decreased** by the quantity sold.
- [ ] After an udhaari bill, the customer's **outstanding balance increased** by the unpaid amount.

**Purchases**
- [ ] Enter a purchase (supplier + a tablet medicine, e.g. 5 strips) and save — stock **increases**, and the purchase **total is realistic** (roughly strips × per-strip rate), not ~10× inflated.

**Dashboard & reports**
- [ ] Dashboard shows **today's** sales/bills/cash/UPI/credit correctly (not yesterday's), and "Monthly Profit" is a believable margin, not sales − purchases.
- [ ] Reports → Profitability over a date range: **Sales, Purchase Cost, Gross Profit** are consistent (profit = sales − cost) and cost isn't inflated.

Tell me anything that looks wrong and I'll fix it before moving on.

---

## 5. Open questions (your call — they shape Phase 3)

**Q1 — What price should a bill charge?** Today bills charge **MRP** and ignore `selling_rate` (so the Non-Moving "discount" that edits `selling_rate` has no effect on bills).
*My recommendation:* charge **`selling_rate`, defaulting it to MRP** — that way discounts actually work and MRP stays the ceiling.

**Q3 — How should GST be split on the invoice?** Currently CGST/SGST **50/50** (intra-state).
*My recommendation:* keep **50/50** for now; add IGST only if you sell to other states.

*(Q2 — the purchase entry unit — is already resolved from the code: you enter strips + loose tablets, stock is stored in tablets.)*

---

## 6. What happens after your go-ahead

Phase 3 (core workflows) then Phase 4 (supporting modules), each rebuilt on the new design system with its shared components extracted as I go:

**Phase 3:** Inventory → Purchases → **Billing** (highest-priority UX polish) → Customer credit
**Phase 4:** Customers, Doctors, Suppliers, Dashboard, Reports, Settings
**Phase 5:** UI consistency, empty/loading/error states, keyboard UX, responsiveness
**Phase 6:** Full workflow verification

Encryption (`server/encryption.js`) stays untouched, as agreed.
