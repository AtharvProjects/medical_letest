import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import {
  Search, Trash2, Printer, FileText, Send, X, UserPlus, Stethoscope,
  CheckCircle2, ShoppingCart,
} from 'lucide-react';
import { generateInvoicePDF, sendInvoiceViaWhatsApp } from '../services/pdf';
import { calculateLineTotal, splitInclusive, round2 } from '../utils/billing';
import { money, todayStr } from '../utils/format';
import Fuse from 'fuse.js';
import { Modal, Button, FormField, Input, Badge } from '../components/ui';

const TABLET_LIKE = ['Tablet', 'Capsule', 'Strip'];
const PAYMENT_MODES = ['Cash', 'UPI', 'Pending'];

const INITIAL_SESSION = {
  items: [],
  medSearch: '',
  selectedCustomer: null,
  custSearch: '',
  selectedDoctor: null,
  docSearch: '',
  paymentMode: 'Cash',
  discount: 0,
  billSaved: false,
  lastInvoice: null,
  reviewTimer: 0,
  h1Details: { patient_name: '', patient_address: '', doctor_name: '', doctor_address: '', doctor_reg_no: '', prescription_no: '' },
  isGstEnabled: true,
};

// Per-unit (per-tablet) price. Rates are stored per strip; for tablet-like
// categories we divide by tablets_per_strip. Mirrors server/money.js.
const effectiveUnitPrice = (item) => {
  const tps = item.tablets_per_strip || 10;
  return TABLET_LIKE.includes(item.unit_category) ? (item.unit_price / tps) : item.unit_price;
};

export default function Billing() {
  const [customers, setCustomers] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [settings, setSettings] = useState({});

  // Multi-counter state, persisted so an interrupted sale survives a reload.
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('billing_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 7) {
          return parsed.map((s) => ({ ...INITIAL_SESSION, ...s }));
        }
      } catch (e) { console.error('Failed to load billing sessions', e); }
    }
    return Array(7).fill(null).map(() => ({ ...INITIAL_SESSION }));
  });

  const [activeIdx, setActiveIdx] = useState(() => {
    const saved = localStorage.getItem('active_billing_idx');
    if (saved) {
      const idx = parseInt(saved, 10);
      if (!isNaN(idx) && idx >= 0 && idx < 7) return idx;
    }
    return 0;
  });

  // Global UI state (not per-counter).
  const [saving, setSaving] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [showNewCust, setShowNewCust] = useState(false);
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [showH1Modal, setShowH1Modal] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [showDocDropdown, setShowDocDropdown] = useState(false);

  const timerRef = useRef(null);
  const newBillBtnRef = useRef(null);
  const searchRef = useRef(null);
  const custInputRef = useRef(null);
  const showToast = useToast();

  const current = sessions[activeIdx];
  const {
    items, medSearch, selectedCustomer, custSearch, selectedDoctor,
    docSearch, paymentMode, discount, billSaved, lastInvoice,
    reviewTimer, h1Details, isGstEnabled,
  } = current;

  // Update the active counter (accepts an object or an updater function).
  const updateActive = (updates) => {
    setSessions((prev) => {
      const next = [...prev];
      const obj = next[activeIdx];
      next[activeIdx] = { ...obj, ...(typeof updates === 'function' ? updates(obj) : updates) };
      return next;
    });
  };

  // Field-level shims so the rest of the component reads like plain setState.
  const setItems = (val) => updateActive((s) => ({ items: typeof val === 'function' ? val(s.items) : val }));
  const setMedSearch = (val) => updateActive({ medSearch: val });
  const setSelectedCustomer = (val) => updateActive({ selectedCustomer: val });
  const setCustSearch = (val) => updateActive({ custSearch: val });
  const setSelectedDoctor = (val) => updateActive({ selectedDoctor: val });
  const setDocSearch = (val) => updateActive({ docSearch: val });
  const setPaymentMode = (val) => updateActive({ paymentMode: val });
  const setDiscount = (val) => updateActive({ discount: val });
  const setIsGstEnabled = (val) => updateActive({ isGstEnabled: val });
  // Was missing before — caused a ReferenceError when adding a Schedule-H1 medicine.
  const setH1Details = (val) => updateActive((s) => ({ h1Details: typeof val === 'function' ? val(s.h1Details) : val }));
  const setSessionReviewTimer = (idx, val) => {
    setSessions((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], reviewTimer: typeof val === 'function' ? val(next[idx].reviewTimer) : val };
      return next;
    });
  };

  useEffect(() => {
    api.getCustomers().then(setCustomers).catch(() => {});
    api.getDoctors().then(setDoctors).catch(() => {});
    api.getSettings().then(setSettings).catch((err) => console.error('Failed to load settings', err));
  }, []);

  useEffect(() => { localStorage.setItem('billing_sessions', JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { localStorage.setItem('active_billing_idx', String(activeIdx)); }, [activeIdx]);

  // Focus the "New Bill" button once a bill is saved, so Enter starts the next one.
  useEffect(() => {
    if (billSaved && newBillBtnRef.current) newBillBtnRef.current.focus();
  }, [billSaved]);

  // Clear the review-timer interval on unmount.
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const custFuse = useMemo(() => new Fuse(customers, { keys: ['name', 'phone'], threshold: 0.3 }), [customers]);

  useEffect(() => {
    const query = medSearch.trim();
    if (!query) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // High-performance indexed SQLite search for instant responsiveness
    const timer = setTimeout(() => {
      api.getMedicines({ search: query, limit: 10, active_only: 'true' })
        .then((res) => {
          const list = res?.data || (Array.isArray(res) ? res.slice(0, 10) : []);
          setSuggestions(list);
          setShowSuggestions(list.length > 0);
        })
        .catch(() => {});
    }, 60);

    return () => clearTimeout(timer);
  }, [medSearch]);

  const filteredCustomers = useMemo(() => {
    if (!custSearch.trim()) return customers;
    return custFuse.search(custSearch).map((r) => r.item);
  }, [custSearch, customers, custFuse]);

  const filteredDoctors = docSearch
    ? doctors.filter((d) => d.name.toLowerCase().includes(docSearch.toLowerCase()))
    : doctors;

  // GST-INCLUSIVE totals: each line's gross already contains tax, so we extract
  // the taxable base and contained GST per line and never add tax on top.
  const getSessionTotals = (session) => {
    let sub = 0;
    let gst = 0;
    for (const item of session.items) {
      const gross = calculateLineTotal(item.quantity, effectiveUnitPrice(item), item.discount_percent);
      const pct = session.isGstEnabled ? item.gst_percent : 0;
      const split = splitInclusive(gross, pct);
      sub += split.taxable;
      gst += split.gst;
    }
    sub = round2(sub);
    gst = round2(gst);
    const total = Math.max(0, round2(sub + gst - session.discount));
    return { subtotal: sub, gstAmount: gst, totalAmount: total, itemCount: session.items.length };
  };

  const { subtotal, gstAmount, totalAmount } = getSessionTotals(current);

  const addMedicine = async (med) => {
    try {
      const fullMed = await api.getMedicine(med.id);
      const today = todayStr();
      const inStock = (fullMed.batches || []).filter((b) => b.quantity > 0);
      // Never offer expired stock for sale — mirrors the server-side sell guard.
      const batches = inStock.filter((b) => !b.expiry_date || b.expiry_date >= today);

      if (batches.length === 0) {
        showToast(
          inStock.length === 0 ? `Out of stock: ${med.brand_name}` : `Only expired stock available: ${med.brand_name}`,
          'error'
        );
        return;
      }

      // FEFO: batches arrive ordered by expiry; first non-expired one is nearest.
      const batch = batches[0];
      const tps = fullMed.tablets_per_strip || med.tablets_per_strip || 10;

      setItems((prev) => {
        const existingIdx = prev.findIndex((i) => i.id === med.id && i.batch_id === batch.id);
        if (existingIdx >= 0) {
          const existing = prev[existingIdx];
          if (existing.quantity >= existing.max_qty) {
            showToast('Max stock limit reached for this batch', 'warning');
            return prev;
          }
          const newItems = [...prev];
          newItems[existingIdx] = { ...existing, quantity: existing.quantity + 1 };
          return newItems;
        }
        return [...prev, {
          id: med.id,
          brand_name: med.brand_name,
          company_name: med.company_name,
          batch_id: batch.id,
          batch_number: batch.batch_number,
          expiry_date: batch.expiry_date,
          quantity: 1,
          // Q1: bill at the SELLING price (per strip), falling back to MRP when
          // no selling rate is set. MRP kept separately for the savings display.
          unit_price: batch.selling_rate || batch.mrp,
          mrp: batch.mrp,
          max_qty: batch.quantity,
          discount_percent: 0,
          gst_percent: med.gst_percent || 12,
          is_h1: med.is_h1,
          tablets_per_strip: tps,
          unit_category: fullMed.unit_category || med.unit_category || 'Tablet',
        }];
      });

      if (med.is_h1) {
        setH1Details((prev) => ({
          ...prev,
          patient_name: selectedCustomer?.name || prev.patient_name || '',
          patient_address: selectedCustomer?.address || prev.patient_address || '',
          doctor_name: selectedDoctor?.name || prev.doctor_name || '',
          doctor_address: selectedDoctor?.address || prev.doctor_address || '',
        }));
        setShowH1Modal(true);
      }

      setMedSearch('');
      setSuggestions([]);
      setShowSuggestions(false);
      if (searchRef.current) searchRef.current.focus();
    } catch (err) {
      console.error(err);
      showToast('Failed to load batch info', 'error');
    }
  };

  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
    });
  };

  const removeItem = (index) => setItems((prev) => prev.filter((_, i) => i !== index));

  const resetBilling = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    updateActive({ ...INITIAL_SESSION, items: [], h1Details: { ...INITIAL_SESSION.h1Details } });
    setTimeout(() => { if (searchRef.current) searchRef.current.focus(); }, 100);
  };

  const handleSave = async () => {
    if (items.length === 0 || billSaved) return;

    // ---- Pre-flight validation (before we flip into the saving state) ----
    if (items.some((i) => !i.quantity || i.quantity <= 0)) {
      showToast('All items must have a valid quantity greater than 0', 'error');
      return;
    }
    if (items.some((i) => i.quantity > i.max_qty)) {
      showToast('Some items exceed available stock. Please fix quantities before saving.', 'error');
      return;
    }
    if (items.some((i) => i.is_h1)) {
      const d = h1Details;
      if (!d.patient_name?.trim() || !d.doctor_name?.trim() || !d.doctor_reg_no?.trim() || !d.prescription_no?.trim()) {
        setShowH1Modal(true);
        showToast('Schedule H1 details are mandatory for this bill', 'error');
        return;
      }
    }
    if (paymentMode === 'Pending' && !selectedCustomer) {
      showToast('Please select or add a customer for Pending / Credit payment', 'error');
      if (custInputRef.current) custInputRef.current.focus();
      return;
    }

    setSaving(true);
    try {
      const invoiceData = {
        customer_id: selectedCustomer?.id || null,
        doctor_id: selectedDoctor?.id || null,
        payment_mode: paymentMode,
        is_gst_enabled: isGstEnabled,
        discount_amount: discount,
        items: items.map((item) => ({
          medicine_id: item.id,
          batch_id: item.batch_id,
          quantity: item.quantity,
          unit_price: effectiveUnitPrice(item), // always per-unit (per-tablet)
          discount_percent: item.discount_percent,
          gst_percent: item.gst_percent,
          tablets_per_strip: item.tablets_per_strip || 10,
        })),
        h1_details: items.some((i) => i.is_h1) ? h1Details : null,
      };

      const savedInvoice = await api.createInvoice(invoiceData);
      const savedAt = activeIdx;

      setSessions((prev) => {
        const next = [...prev];
        next[savedAt] = { ...next[savedAt], lastInvoice: savedInvoice, billSaved: true, reviewTimer: 20 };
        return next;
      });

      showToast('Invoice saved successfully');
      window.dispatchEvent(new Event('invoice-saved')); // refresh header stats

      // Automatically dispatch invoice PDF to customer WhatsApp
      const custPhone = savedInvoice.customer_phone || selectedCustomer?.phone;
      const isAutoSendEnabled = settings?.whatsapp_auto_send !== 'false';
      if (custPhone && isAutoSendEnabled) {
        sendInvoiceViaWhatsApp(savedInvoice, settings || {})
          .then(() => {
            showToast(`Invoice PDF automatically sent to WhatsApp (+${custPhone})!`, 'success');
          })
          .catch((waErr) => {
            console.log('[Billing] Auto WhatsApp send status:', waErr.message);
          });
      }

      // 20s review countdown for the counter we just saved.
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setSessionReviewTimer(savedAt, (prev) => (prev <= 1 ? 0 : prev - 1));
      }, 1000);
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to save invoice', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ---- Keyboard shortcuts: F2 search · Alt/Ctrl+S save · Alt+1-7 counters · Enter ----
  // The listener registers once; it reads the freshest state/handlers through a ref
  // so a keyboard save never acts on a stale customer / payment mode / discount.
  const kbdRef = useRef({});
  kbdRef.current = {
    billSaved, itemsLen: items.length, saving, medSearchTrim: medSearch.trim(),
    modalOpen: showNewCust || showNewDoc || showH1Modal, handleSave, resetBilling,
  };
  useEffect(() => {
    const handleKeyDown = (e) => {
      const s = kbdRef.current;
      if (s.modalOpen) return; // let modals own the keyboard

      if (e.key === 'F2') {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
        return;
      }
      if ((e.altKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (s.itemsLen > 0 && !s.billSaved && !s.saving) s.handleSave();
        return;
      }
      if (e.altKey && e.key >= '1' && e.key <= '7') {
        setActiveIdx(parseInt(e.key, 10) - 1);
        setTimeout(() => { if (searchRef.current) searchRef.current.focus(); }, 50);
        return;
      }
      if (e.key === 'Enter') {
        if (s.billSaved) {
          e.preventDefault();
          s.resetBilling();
        } else if (s.itemsLen > 0 && !s.saving) {
          // If typing in the medicine search, let its own handler add the top hit.
          if (document.activeElement === searchRef.current && s.medSearchTrim) return;
          e.preventDefault();
          s.handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handlePrint = () => {
    if (!lastInvoice) return;
    try { generateInvoicePDF(lastInvoice, settings || {}, 'print'); }
    catch (err) { console.error(err); showToast('Failed to generate print preview', 'error'); }
  };
  const handlePDF = () => {
    if (!lastInvoice) return;
    try { generateInvoicePDF(lastInvoice, settings || {}, 'download'); }
    catch (err) { console.error(err); showToast('Failed to generate PDF', 'error'); }
  };
  const handleWhatsApp = async () => {
    if (!lastInvoice) return;
    const phone = lastInvoice.customer_phone || selectedCustomer?.phone || '';
    if (!phone) { showToast('No customer phone number available for WhatsApp', 'warning'); return; }
    setSendingWhatsApp(true);
    try {
      await sendInvoiceViaWhatsApp(lastInvoice, settings);
      showToast('Invoice sent via WhatsApp successfully!', 'success');
    } catch (err) {
      console.error(err);
      const msg = err.message || 'Could not send WhatsApp message.';
      showToast(`${msg} — Please ensure WhatsApp is connected in Settings.`, 'error');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      {/* ---------------- Counter tabs ---------------- */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0, paddingBottom: 2 }}>
        {sessions.map((session, i) => {
          const isActive = i === activeIdx;
          const { totalAmount: tabTotal, itemCount } = getSessionTotals(session);
          return (
            <button
              key={i}
              onClick={() => { setActiveIdx(i); setTimeout(() => searchRef.current?.focus(), 100); }}
              style={{
                flex: '1 0 108px', minWidth: 108, padding: '8px 12px', borderRadius: 'var(--radius-lg)',
                border: isActive ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                background: isActive ? 'var(--primary-bg)' : 'var(--bg-secondary)',
                cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3,
                transition: 'border-color .15s, background .15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}>
                  Counter {i + 1}
                  <span style={{ opacity: 0.55, fontSize: 9, marginLeft: 4, fontWeight: 500 }}>Alt+{i + 1}</span>
                </span>
                {itemCount > 0 && <Badge tone="blue" style={{ fontSize: 9, padding: '1px 6px' }}>{itemCount}</Badge>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: itemCount ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                ₹{tabTotal.toFixed(0)}
              </div>
            </button>
          );
        })}
      </div>

      {/* ---------------- Main billing grid ---------------- */}
      <div className="billing-layout" style={{ flex: 1, minHeight: 0 }}>
        {/* LEFT: search + cart */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {billSaved && (
            <div
              className="glass-card"
              style={{
                background: 'var(--success-bg)', border: '1px solid #bbf7d0', padding: '12px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 12, animation: 'slideDown 0.25s ease-out', flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <CheckCircle2 size={26} color="var(--success)" />
                <div>
                  <div style={{ fontWeight: 700, color: '#166534', fontSize: 15 }}>Bill generated successfully</div>
                  <div style={{ fontSize: 12.5, color: '#166534', opacity: 0.85 }}>
                    Invoice #{lastInvoice?.invoice_number} · available to review for {reviewTimer}s
                  </div>
                </div>
              </div>
              <Button variant="success" onClick={resetBilling}>New Bill (Enter)</Button>
            </div>
          )}

          {/* Medicine search */}
          <div className="glass-card" style={{ position: 'relative', zIndex: 100, flexShrink: 0, padding: 12, marginBottom: 12 }}>
            <div className="search-box">
              <Search />
              <input
                ref={searchRef}
                className="form-input"
                placeholder={billSaved ? 'Bill saved — press Enter for a new bill' : 'Type a medicine name or alias to add…'}
                value={medSearch}
                onChange={(e) => setMedSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && suggestions.length > 0) addMedicine(suggestions[0]); }}
                onFocus={() => !billSaved && medSearch && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                disabled={billSaved}
                autoFocus
              />
              {showSuggestions && (
                <div className="autocomplete-dropdown">
                  {suggestions.map((m) => {
                    const lowStock = (m.total_stock ?? 0) <= 10;
                    return (
                      <div key={m.id} className="autocomplete-item" onMouseDown={() => addMedicine(m)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>{m.brand_name}</span>
                          {m.alias && <Badge tone="blue" style={{ fontSize: 10 }}>{m.alias}</Badge>}
                          {m.is_h1 === 1 && <Badge tone="red" style={{ fontSize: 9 }}>H1</Badge>}
                        </div>
                        <div className="item-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>{m.company_name}</span>
                          <Badge tone={lowStock ? 'red' : 'green'} style={{ fontSize: 10 }}>Stock: {m.total_stock ?? 0}</Badge>
                          <span>GST {m.gst_percent}%</span>
                          {TABLET_LIKE.includes(m.unit_category) && m.tablets_per_strip > 1 && (
                            <Badge tone="gray" style={{ fontSize: 10, marginLeft: 'auto' }}>1×{m.tablets_per_strip}</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Cart */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <div className="glass-card" style={{ padding: items.length === 0 ? 16 : 4, overflow: 'hidden' }}>
              {items.length === 0 ? (
                <div className="empty-state" style={{ height: 220 }}>
                  <ShoppingCart size={40} style={{ opacity: 0.35, marginBottom: 10 }} />
                  <p style={{ fontWeight: 600 }}>No items yet</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Search a medicine above (or press F2) to start the bill.</p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ width: 64 }}>Pack</th>
                      <th style={{ width: 92 }}>Qty</th>
                      <th className="text-right" style={{ width: 120 }}>Rate</th>
                      <th style={{ width: 62 }}>Disc%</th>
                      <th style={{ width: 56 }}>GST</th>
                      <th className="text-right" style={{ width: 96 }}>Total</th>
                      <th style={{ width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const tps = item.tablets_per_strip || 10;
                      const isTabletLike = TABLET_LIKE.includes(item.unit_category);
                      const perUnit = isTabletLike ? item.unit_price / tps : item.unit_price;
                      const lineTotal = item.quantity > 0 ? item.quantity * perUnit * (1 - (item.discount_percent || 0) / 100) : 0;
                      const strips = isTabletLike ? Math.floor(item.quantity / tps) : 0;
                      const extraTabs = isTabletLike ? item.quantity % tps : 0;
                      const stripLabel = !isTabletLike || !item.quantity ? ''
                        : strips > 0 && extraTabs > 0 ? `${strips} strip${strips > 1 ? 's' : ''} + ${extraTabs} tab${extraTabs > 1 ? 's' : ''}`
                        : strips > 0 ? `${strips} strip${strips > 1 ? 's' : ''}`
                        : `${extraTabs} tab${extraTabs !== 1 ? 's' : ''}`;
                      const overStock = item.quantity > item.max_qty;
                      const savePct = item.mrp && item.unit_price < item.mrp ? Math.round(((item.mrp - item.unit_price) / item.mrp) * 100) : 0;
                      return (
                        <tr key={idx}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12.5 }}>
                              {item.brand_name}
                              {item.is_h1 === 1 && <Badge tone="red" style={{ fontSize: 9 }}>H1</Badge>}
                            </div>
                            <div className="text-muted" style={{ fontSize: 10.5 }}>
                              {item.company_name ? `${item.company_name} · ` : ''}Batch {item.batch_number}
                              {item.expiry_date ? ` · Exp ${item.expiry_date}` : ''}
                            </div>
                          </td>
                          <td>
                            {isTabletLike ? <Badge tone="gray" style={{ fontSize: 10 }}>1×{tps}</Badge> : <span className="text-muted">—</span>}
                          </td>
                          <td>
                            <Input
                              type="number"
                              min={1}
                              max={item.max_qty}
                              value={item.quantity}
                              error={overStock || item.quantity <= 0}
                              disabled={billSaved}
                              onChange={(e) => updateItem(idx, 'quantity', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                              style={{ width: 64, padding: '3px 6px', textAlign: 'center', fontSize: 12.5 }}
                              title={isTabletLike ? `Number of tablets (1 strip = ${tps})` : 'Quantity'}
                            />
                            {isTabletLike && item.quantity > 0 && (
                              <div style={{ fontSize: 10, color: 'var(--primary)', marginTop: 2, whiteSpace: 'nowrap' }}>{stripLabel}</div>
                            )}
                            <div style={{ fontSize: 10, marginTop: 2, color: overStock ? 'var(--danger)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {item.quantity <= 0 ? 'Min 1 required' : overStock ? `Only ${item.max_qty} in stock` : `Max ${item.max_qty}`}
                            </div>
                          </td>
                          <td className="text-right">
                            <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                              ₹{item.unit_price.toFixed(2)}{isTabletLike && <span className="text-muted" style={{ fontSize: 9 }}>/strip</span>}
                            </div>
                            {savePct > 0 && (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                <s>₹{item.mrp.toFixed(2)}</s> <span style={{ color: 'var(--success)' }}>−{savePct}%</span>
                              </div>
                            )}
                            {isTabletLike && (
                              <div className="text-muted" style={{ fontSize: 10 }}>₹{perUnit.toFixed(2)}/unit</div>
                            )}
                          </td>
                          <td>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={item.discount_percent}
                              disabled={billSaved}
                              onChange={(e) => updateItem(idx, 'discount_percent', Number(e.target.value) || 0)}
                              style={{ width: 54, padding: '3px 6px', textAlign: 'center', fontSize: 12.5 }}
                            />
                          </td>
                          <td style={{ fontSize: 12 }}>{item.gst_percent}%</td>
                          <td className="text-right" style={{ fontWeight: 700, fontSize: 13 }}>{money(lineTotal)}</td>
                          <td className="text-right">
                            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => removeItem(idx)} disabled={billSaved} title="Remove item" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: summary column */}
        <div className="billing-summary" style={{ gap: 10 }}>
          {/* Customer */}
          <div className="glass-card" style={{ position: 'relative', zIndex: 20, padding: '12px 14px' }}>
            <div className="flex justify-between items-center mb-2">
              <span className="card-title" style={{ margin: 0 }}>Customer</span>
              <Button variant="secondary" size="sm" icon={UserPlus} onClick={() => setShowNewCust(true)} disabled={billSaved} title="New customer" />
            </div>
            <div style={{ position: 'relative' }}>
              <input
                ref={custInputRef}
                className="form-input"
                placeholder="Search customer…"
                value={selectedCustomer ? selectedCustomer.name : custSearch}
                onChange={(e) => { setCustSearch(e.target.value); setSelectedCustomer(null); setShowCustDropdown(true); }}
                onFocus={() => !billSaved && setShowCustDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustDropdown(false), 200)}
                disabled={billSaved}
              />
              {selectedCustomer && !billSaved && (
                <button
                  type="button"
                  style={{ position: 'absolute', right: 8, top: 9, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  onClick={() => { setSelectedCustomer(null); setCustSearch(''); }}
                >
                  <X size={16} />
                </button>
              )}
              {showCustDropdown && !selectedCustomer && !billSaved && (
                <div className="autocomplete-dropdown">
                  {filteredCustomers.slice(0, 8).map((c) => (
                    <div key={c.id} className="autocomplete-item" onMouseDown={() => { setSelectedCustomer(c); setCustSearch(''); setShowCustDropdown(false); }}>
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                      {c.phone && <span className="text-muted"> · {c.phone}</span>}
                      {c.credit_balance > 0 && <Badge tone="red" style={{ marginLeft: 6 }}>{money(c.credit_balance)} due</Badge>}
                    </div>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <div className="autocomplete-item text-muted" style={{ cursor: 'default' }}>No customers found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Doctor */}
          <div className="glass-card" style={{ position: 'relative', zIndex: 15, padding: '12px 14px' }}>
            <div className="flex justify-between items-center mb-2">
              <span className="card-title" style={{ margin: 0 }}>Doctor</span>
              <Button variant="secondary" size="sm" icon={Stethoscope} onClick={() => setShowNewDoc(true)} disabled={billSaved} title="New doctor" />
            </div>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                placeholder="Search doctor…"
                value={selectedDoctor ? selectedDoctor.name : docSearch}
                onChange={(e) => { setDocSearch(e.target.value); setSelectedDoctor(null); setShowDocDropdown(true); }}
                onFocus={() => !billSaved && setShowDocDropdown(true)}
                onBlur={() => setTimeout(() => setShowDocDropdown(false), 200)}
                disabled={billSaved}
              />
              {selectedDoctor && !billSaved && (
                <button
                  type="button"
                  style={{ position: 'absolute', right: 8, top: 9, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  onClick={() => { setSelectedDoctor(null); setDocSearch(''); }}
                >
                  <X size={16} />
                </button>
              )}
              {showDocDropdown && !selectedDoctor && !billSaved && (
                <div className="autocomplete-dropdown">
                  {filteredDoctors.slice(0, 8).map((d) => (
                    <div key={d.id} className="autocomplete-item" onMouseDown={() => { setSelectedDoctor(d); setDocSearch(''); setShowDocDropdown(false); }}>
                      <span style={{ fontWeight: 500 }}>Dr. {d.name}</span>
                      {d.hospital && <span className="text-muted"> · {d.hospital}</span>}
                    </div>
                  ))}
                  {filteredDoctors.length === 0 && (
                    <div className="autocomplete-item text-muted" style={{ cursor: 'default' }}>No doctors found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Payment mode */}
          <div className="glass-card" style={{ padding: '12px 14px' }}>
            <div className="card-title" style={{ marginBottom: 8 }}>Payment Mode</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {PAYMENT_MODES.map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={paymentMode === mode ? 'primary' : 'secondary'}
                  onClick={() => !billSaved && setPaymentMode(mode)}
                  disabled={billSaved}
                  style={{ flex: 1 }}
                >
                  {mode}
                </Button>
              ))}
            </div>
          </div>

          {/* Bill summary */}
          <div className="glass-card" style={{ padding: '12px 14px' }}>
            <div className="flex justify-between items-center mb-2">
              <span className="card-title" style={{ margin: 0 }}>Bill Summary</span>
              <Button
                size="sm"
                variant={isGstEnabled ? 'primary' : 'secondary'}
                onClick={() => !billSaved && setIsGstEnabled(!isGstEnabled)}
                disabled={billSaved}
                style={{ fontSize: 11, padding: '2px 10px' }}
              >
                {isGstEnabled ? 'GST On' : 'GST Off'}
              </Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }}>
              <div className="flex justify-between"><span className="text-secondary">Taxable</span><span>{money(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-secondary">GST (incl.)</span><span>{money(gstAmount)}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-secondary">Discount</span>
                <Input
                  type="number"
                  min={0}
                  value={discount}
                  disabled={billSaved}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  style={{ width: 90, padding: '4px 8px', textAlign: 'right' }}
                />
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 }}>
                <div className="flex justify-between" style={{ fontSize: 18, fontWeight: 800 }}>
                  <span>Total</span><span>{money(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Save / New bill */}
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            {billSaved ? (
              <Button ref={newBillBtnRef} variant="success" onClick={resetBilling} style={{ flex: 1, height: 42, fontSize: 15 }}>
                {reviewTimer > 0 ? `New Bill (${reviewTimer}s)` : 'New Bill (Enter)'}
              </Button>
            ) : (
              <Button variant="success" onClick={handleSave} loading={saving} disabled={items.length === 0} style={{ flex: 1, height: 42, fontSize: 15 }}>
                {saving ? 'Saving…' : 'Save Bill (Enter)'}
              </Button>
            )}
          </div>

          {/* Post-save actions */}
          {lastInvoice && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" size="sm" icon={Printer} onClick={handlePrint} style={{ flex: 1 }}>Print</Button>
              <Button variant="secondary" size="sm" icon={FileText} onClick={handlePDF} style={{ flex: 1 }}>PDF</Button>
              <Button variant="success" size="sm" icon={Send} onClick={handleWhatsApp} loading={sendingWhatsApp} style={{ flex: 1 }}>WhatsApp</Button>
            </div>
          )}
        </div>
      </div>

      {showNewCust && (
        <QuickCustomerModal
          onClose={() => setShowNewCust(false)}
          onSave={(c) => { setCustomers((prev) => [...prev, c]); setSelectedCustomer(c); setShowNewCust(false); showToast('Customer added'); }}
        />
      )}
      {showNewDoc && (
        <QuickDoctorModal
          onClose={() => setShowNewDoc(false)}
          onSave={(d) => { setDoctors((prev) => [...prev, d]); setSelectedDoctor(d); setShowNewDoc(false); showToast('Doctor added'); }}
        />
      )}
      {showH1Modal && <H1DetailsModal details={h1Details} setDetails={setH1Details} onClose={() => setShowH1Modal(false)} />}
    </div>
  );
}

// -------------------------------------------------------------------------
// Schedule H1 register details (mandatory under the Drugs & Cosmetics Rules).
// -------------------------------------------------------------------------
function H1DetailsModal({ details, setDetails, onClose }) {
  const showToast = useToast();
  const set = (k, v) => setDetails((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!details.patient_name?.trim() || !details.doctor_name?.trim() || !details.doctor_reg_no?.trim() || !details.prescription_no?.trim()) {
      showToast('Please fill patient name, doctor name, doctor reg. no and prescription no.', 'error');
      return;
    }
    onClose();
  };

  return (
    <Modal
      title="Schedule H1 Drug Details"
      onClose={onClose}
      size={520}
      onSubmit={handleSubmit}
      footer={<Button type="submit" variant="primary" style={{ width: '100%' }}>Confirm Details</Button>}
    >
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
        These details are mandatory under the Indian Drugs &amp; Cosmetics Rules for Schedule H1 medicines.
      </p>
      <FormField label="Patient Name" required>
        <Input value={details.patient_name} onChange={(e) => set('patient_name', e.target.value)} autoFocus />
      </FormField>
      <FormField label="Patient Address">
        <Input value={details.patient_address} onChange={(e) => set('patient_address', e.target.value)} />
      </FormField>
      <div className="form-row">
        <FormField label="Doctor Name" required>
          <Input value={details.doctor_name} onChange={(e) => set('doctor_name', e.target.value)} />
        </FormField>
        <FormField label="Doctor Reg. No" required>
          <Input value={details.doctor_reg_no} onChange={(e) => set('doctor_reg_no', e.target.value)} />
        </FormField>
      </div>
      <FormField label="Doctor Address">
        <Input value={details.doctor_address} onChange={(e) => set('doctor_address', e.target.value)} />
      </FormField>
      <FormField label="Prescription No / ID" required>
        <Input value={details.prescription_no} onChange={(e) => set('prescription_no', e.target.value)} />
      </FormField>
      <div className="alert alert-yellow" style={{ marginTop: 6, fontSize: 12 }}>
        <strong>Note:</strong> These records must be maintained for 3 years for government inspection.
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------------------
// Quick-add customer / doctor (inline during billing).
// -------------------------------------------------------------------------
function QuickCustomerModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);
  const showToast = useToast();
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showToast('Name is required', 'error');
    setSaving(true);
    try { onSave(await api.createCustomer(form)); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      title="New Customer"
      onClose={onClose}
      size={420}
      onSubmit={handleSubmit}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={saving}>Add</Button>
      </>}
    >
      <FormField label="Name" required>
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
      </FormField>
      <FormField label="Phone">
        <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
      </FormField>
      <FormField label="Address">
        <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
      </FormField>
    </Modal>
  );
}

function QuickDoctorModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', hospital: '', phone: '', specialization: '' });
  const [saving, setSaving] = useState(false);
  const showToast = useToast();
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showToast('Name is required', 'error');
    setSaving(true);
    try { onSave(await api.createDoctor(form)); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      title="New Doctor"
      onClose={onClose}
      size={420}
      onSubmit={handleSubmit}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={saving}>Add</Button>
      </>}
    >
      <FormField label="Name" required>
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
      </FormField>
      <FormField label="Hospital">
        <Input value={form.hospital} onChange={(e) => set('hospital', e.target.value)} />
      </FormField>
      <FormField label="Phone">
        <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
      </FormField>
      <FormField label="Specialization">
        <Input value={form.specialization} onChange={(e) => set('specialization', e.target.value)} />
      </FormField>
    </Modal>
  );
}
