// ============================================================================
// Canonical money math — GST-INCLUSIVE model.
// ----------------------------------------------------------------------------
// Prices quoted to the customer (derived from MRP) already CONTAIN GST. From an
// inclusive line amount we EXTRACT the taxable base and the tax it contains, so
// the invoice total can never exceed the sum of the MRP-based line prices.
//
// IMPORTANT: This logic is mirrored on the client in `src/utils/billing.js`.
// The two files are intentionally NOT a shared import (server is CommonJS, the
// client is ESM bundled by Vite) — if you change the math here, change it there
// too so on-screen totals and saved totals stay identical to the cent.
// ============================================================================

// Round to 2 decimals (currency). Guards against NaN/undefined.
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Inclusive amount the customer pays for one line.
// unitPrice is the tax-INCLUSIVE per-unit price actually charged.
function lineGross(quantity, unitPrice, discountPercent) {
  const q = Number(quantity) || 0;
  const p = Number(unitPrice) || 0;
  const d = Number(discountPercent) || 0;
  return q * p * (1 - d / 100);
}

// Split an inclusive amount into { taxable, gst } for a given GST %.
// gstPercent <= 0 (or GST disabled) → the whole amount is the taxable base.
function splitInclusive(grossAmount, gstPercent) {
  const g = Number(grossAmount) || 0;
  const pct = Number(gstPercent) || 0;
  if (pct <= 0) return { taxable: round2(g), gst: 0 };
  const taxable = g / (1 + pct / 100);
  return { taxable: round2(taxable), gst: round2(g - taxable) };
}

// Compute whole-invoice totals from line items.
// items: [{ quantity, unitPrice, discountPercent, gstPercent }]
// opts.gstEnabled=false forces every line's GST to 0.
// opts.invoiceDiscount is a flat amount subtracted from the grand total.
// Returns rounded totals plus the per-line split (taxable/gst) for storage.
function computeInvoiceTotals(items, opts) {
  const gstEnabled = !opts || opts.gstEnabled !== false;
  const invoiceDiscount = Number(opts && opts.invoiceDiscount) || 0;

  let subtotal = 0;
  let gstAmount = 0;
  const lines = (items || []).map((it) => {
    const gross = lineGross(it.quantity, it.unitPrice, it.discountPercent);
    const pct = gstEnabled ? (Number(it.gstPercent) || 0) : 0;
    const { taxable, gst } = splitInclusive(gross, pct);
    subtotal += taxable;
    gstAmount += gst;
    return { gross: round2(gross), taxable, gst, gstPercent: pct };
  });

  subtotal = round2(subtotal);
  gstAmount = round2(gstAmount);
  const total = Math.max(0, round2(subtotal + gstAmount - invoiceDiscount));
  return { subtotal, gstAmount, discount: round2(invoiceDiscount), total, lines };
}

// Per-unit purchase cost from a per-STRIP purchase rate.
// tablet-like categories divide the strip rate across its tablets; other
// categories (syrup, etc.) are priced per unit already.
function perUnitCost(purchaseRate, unitCategory, tabletsPerStrip) {
  const rate = Number(purchaseRate) || 0;
  const tabletLike = ['Tablet', 'Capsule', 'Strip'].includes(unitCategory);
  const tps = tabletLike ? (Number(tabletsPerStrip) || 1) : 1;
  return rate / (tps > 0 ? tps : 1);
}

// Total cost of a purchase line (quantity is always in individual units/tablets).
function lineCost(quantity, purchaseRate, unitCategory, tabletsPerStrip) {
  return (Number(quantity) || 0) * perUnitCost(purchaseRate, unitCategory, tabletsPerStrip);
}

module.exports = {
  round2,
  lineGross,
  splitInclusive,
  computeInvoiceTotals,
  perUnitCost,
  lineCost,
};
