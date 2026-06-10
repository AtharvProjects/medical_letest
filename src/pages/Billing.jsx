import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { Search, Plus, Trash2, Printer, FileText, Send, X, UserPlus, Stethoscope, RefreshCw } from 'lucide-react';
import { generateInvoicePDF, sendInvoiceViaWhatsApp } from '../services/pdf';
import { calculateLineTotal, calculateGstFromTotal } from '../utils/billing';
import Fuse from 'fuse.js';

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

export default function Billing() {
    const [medicines, setMedicines] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [settings, setSettings] = useState({});
    
    // Multi-session state
    // Multi-session state with persistence
    const [sessions, setSessions] = useState(() => {
        const saved = localStorage.getItem('billing_sessions');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Ensure we have exactly 7 sessions and they have the correct structure
                if (Array.isArray(parsed) && parsed.length === 7) {
                    return parsed.map(s => ({ ...INITIAL_SESSION, ...s }));
                }
            } catch (e) { console.error('Failed to load billing sessions', e); }
        }
        return Array(7).fill(null).map(() => ({ ...INITIAL_SESSION }));
    });

    const [activeIdx, setActiveIdx] = useState(() => {
        const saved = localStorage.getItem('active_billing_idx');
        if (saved) {
            const idx = parseInt(saved);
            if (!isNaN(idx) && idx >= 0 && idx < 7) return idx;
        }
        return 0;
    });
    
    // Global UI state (not session-specific)
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
    const searchRef = useRef();
    const showToast = useToast();

    // Derived session state for easier access
    const current = sessions[activeIdx];
    const { 
        items, medSearch, selectedCustomer, custSearch, selectedDoctor, 
        docSearch, paymentMode, discount, billSaved, lastInvoice, 
        reviewTimer, h1Details, isGstEnabled 
    } = current;

    // Helper to update current session
    const updateActive = (updates) => {
        setSessions(prev => {
            const next = [...prev];
            const currentObj = next[activeIdx];
            next[activeIdx] = { 
                ...currentObj, 
                ...(typeof updates === 'function' ? updates(currentObj) : updates) 
            };
            return next;
        });
    };

    // Shims for existing setters
    const setItems = (val) => updateActive(s => ({ items: typeof val === 'function' ? val(s.items) : val }));
    const setMedSearch = (val) => updateActive({ medSearch: val });
    const setSelectedCustomer = (val) => updateActive({ selectedCustomer: val });
    const setCustSearch = (val) => updateActive({ custSearch: val });
    const setSelectedDoctor = (val) => updateActive({ selectedDoctor: val });
    const setDocSearch = (val) => updateActive({ docSearch: val });
    const setPaymentMode = (val) => updateActive({ paymentMode: val });
    const setDiscount = (val) => updateActive({ discount: val });
    const setBillSaved = (val) => updateActive({ billSaved: val });
    const setLastInvoice = (val) => updateActive({ lastInvoice: val });
    const setReviewTimer = (val) => updateActive(s => ({ reviewTimer: typeof val === 'function' ? val(s.reviewTimer) : val }));
    const setSessionReviewTimer = (idx, val) => {
        setSessions(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], reviewTimer: typeof val === 'function' ? val(next[idx].reviewTimer) : val };
            return next;
        });
    };
    const setIsGstEnabled = (val) => updateActive({ isGstEnabled: val });

  useEffect(() => {
    api.getMedicines().then(setMedicines);
    api.getCustomers().then(setCustomers);
    api.getDoctors().then(setDoctors);
    api.getSettings().then(setSettings).catch(err => console.error('Failed to load settings', err));
  }, []);

  // Save to persistence
  useEffect(() => {
    localStorage.setItem('billing_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('active_billing_idx', activeIdx.toString());
  }, [activeIdx]);

  // Timer logic for auto-focus and countdown
  useEffect(() => {
    if (billSaved && newBillBtnRef.current) {
        newBillBtnRef.current.focus();
    }
  }, [billSaved]);

  const medFuse = useMemo(() => new Fuse(medicines, {
    keys: ['alias', 'brand_name', 'generic_name', 'company_name'],
    threshold: 0.2, // Slightly stricter to prefer exact alias matches
    distance: 100
  }), [medicines]);

  const custFuse = useMemo(() => new Fuse(customers, {
    keys: ['name', 'phone'],
    threshold: 0.3
  }), [customers]);

  useEffect(() => {
    if (!medSearch.trim()) { setSuggestions([]); return; }
    const results = medFuse.search(medSearch);
    const filtered = results.map(r => r.item).slice(0, 10);
    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  }, [medSearch, medFuse]);

  const filteredCustomers = useMemo(() => {
    if (!custSearch.trim()) return customers;
    return custFuse.search(custSearch).map(r => r.item);
  }, [custSearch, customers, custFuse]);

  const filteredDoctors = docSearch ? doctors.filter(d => d.name.toLowerCase().includes(docSearch.toLowerCase())) : doctors;

    const getEffectivePrice = (item) => {
      const tps = item.tablets_per_strip || 10;
      const isTabletLike = ['Tablet','Capsule','Strip'].includes(item.unit_category);
      return isTabletLike ? (item.unit_price / tps) : item.unit_price;
    };

    const getSessionTotals = (session) => {
      const sub = session.items.reduce((sum, item) => sum + calculateLineTotal(item.quantity, getEffectivePrice(item), item.discount_percent), 0);
      const gst = session.isGstEnabled 
        ? session.items.reduce((sum, item) => {
            const lineTotal = calculateLineTotal(item.quantity, getEffectivePrice(item), item.discount_percent);
            return sum + calculateGstFromTotal(lineTotal, item.gst_percent);
          }, 0)
        : 0;
      const total = Math.max(0, Math.round((sub + gst - session.discount) * 100) / 100);
      return { subtotal: sub, gstAmount: gst, totalAmount: total, itemCount: session.items.length };
    };

    const { subtotal, gstAmount, totalAmount, itemCount } = getSessionTotals(current);

  const addMedicine = async (med) => {
    try {
      // Fetch full medicine details to get batches
      const fullMed = await api.getMedicine(med.id);
      const batches = (fullMed.batches || []).filter(b => b.quantity > 0);

      if (batches.length === 0) {
        showToast(`Out of stock: ${med.brand_name}`, 'error');
        return;
      }

      // FIFO: Auto-select batch with nearest expiry
      const batch = batches[0];
      const tabletsPerStrip = fullMed.tablets_per_strip || med.tablets_per_strip || 10;

      setItems(prev => {
        // Check if this batch is already in the list
        const existingIdx = prev.findIndex(i => i.id === med.id && i.batch_id === batch.id);
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

        // Add new item
        return [...prev, {
          id: med.id,
          brand_name: med.brand_name,
          company_name: med.company_name,
          batch_id: batch.id,
          batch_number: batch.batch_number,
          expiry_date: batch.expiry_date,
          quantity: 1,
          unit_price: batch.mrp,
          mrp: batch.mrp,
          max_qty: batch.quantity,
          discount_percent: 0,
          gst_percent: med.gst_percent || 12,
          is_h1: med.is_h1,
          tablets_per_strip: tabletsPerStrip,
          unit_category: fullMed.unit_category || med.unit_category || 'Tablet',
        }];
      });

      if (med.is_h1) {
        setH1Details(prev => ({
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
      if (searchRef.current) searchRef.current.focus();

    } catch (err) {
      console.error(err);
      showToast('Failed to load batch info', 'error');
    }
  };

  const updateItem = (index, field, value) => {
    setItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
    });
  };

  const removeItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const resetBilling = () => {
    updateActive({ 
      ...INITIAL_SESSION,
      items: [], // ensure new array reference
      h1Details: { ...INITIAL_SESSION.h1Details } 
    });
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeout(() => {
      if (searchRef.current) searchRef.current.focus();
    }, 100);
  };

  const handleSave = async () => {
    if (items.length === 0 || billSaved) return;
    if (items.some(i => !i.quantity || i.quantity <= 0)) {
      showToast('All items must have a valid quantity greater than 0', 'error');
      return;
    }
    if (items.some(i => i.quantity > i.max_qty)) {
      showToast('Some items exceed available stock limits. Please fix quantities before saving.', 'error');
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
        items: items.map(item => {
          const tps = item.tablets_per_strip || 10;
          const isTabletLike = ['Tablet','Capsule','Strip'].includes(item.unit_category);
          const effectivePrice = isTabletLike ? (item.unit_price / tps) : item.unit_price;
          return {
            medicine_id: item.id,
            batch_id: item.batch_id,
            quantity: item.quantity,
            unit_price: effectivePrice,  // Always per-unit (per-tablet) price
            discount_percent: item.discount_percent,
            gst_percent: item.gst_percent,
            tablets_per_strip: tps,
          };
        }),
        h1_details: items.some(i => i.is_h1) ? h1Details : null
      };

      if (items.some(i => i.is_h1)) {
        const d = h1Details;
        if (!d.patient_name?.trim() || !d.doctor_name?.trim() || !d.doctor_reg_no?.trim() || !d.prescription_no?.trim()) {
          setShowH1Modal(true);
          showToast('Schedule H1 details are mandatory for this bill', 'error');
          return;
        }
      }

      if (paymentMode === 'Pending' && !selectedCustomer) {
        showToast('Please select or add a customer for Pending/Credit payment', 'error');
        // Auto-focus customer search
        const custInput = document.querySelector('input[placeholder="Search customer..."]');
        if (custInput) custInput.focus();
        return;
      }

      const savedInvoice = await api.createInvoice(invoiceData);
      const sessionSavedAt = activeIdx; // Remember which counter we're saving
      
      setSessions(prev => {
        const next = [...prev];
        next[sessionSavedAt] = { ...next[sessionSavedAt], lastInvoice: savedInvoice, billSaved: true, reviewTimer: 20 };
        return next;
      });
      
      showToast('Invoice saved successfully');
      
      // Dispatch event to refresh header stats
      window.dispatchEvent(new Event('invoice-saved'));
      
      // Start 20s review timer for THIS session
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setSessionReviewTimer(sessionSavedAt, prev => {
          if (prev <= 1) {
            // No need to clear interval here as it might be used by another session? 
            // Actually, better to have a timer per session if we want accuracy, 
            // but one interval updating all is also fine.
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to save invoice', 'error');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if a modal is open
      if (showNewCust || showNewDoc || showH1Modal) return;

      // F2 to focus search
      if (e.key === 'F2') {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
        return;
      }

      // Alt + S or Ctrl + S to Save Bill
      if ((e.altKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (items.length > 0 && !billSaved && !saving) {
          handleSave();
        }
        return;
      }

      // Alt + 1-7 for switching counters
      if (e.altKey && e.key >= '1' && e.key <= '7') {
        const idx = parseInt(e.key) - 1;
        setActiveIdx(idx);
        setTimeout(() => { if (searchRef.current) searchRef.current.focus(); }, 50);
        return;
      }

      if (e.key === 'Enter') {
        const activeElement = document.activeElement;
        
        if (billSaved) {
          // If bill is saved, Enter resets for new bill
          e.preventDefault();
          resetBilling();
        } else if (items.length > 0 && !saving) {
          // If in medicine search and there is text, let the input's own onKeyDown handle adding medicine
          if (activeElement === searchRef.current && medSearch.trim()) {
            return;
          }
          
          // Trigger save on Enter
          e.preventDefault();
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [billSaved, items, saving, medSearch, showNewCust, showNewDoc]);

  const handlePrint = () => {
    if (!lastInvoice) return;
    try {
      generateInvoicePDF(lastInvoice, settings || {}, 'print');
    } catch (err) {
      console.error(err);
      showToast('Failed to generate print preview', 'error');
    }
  };

  const handlePDF = () => {
    if (!lastInvoice) return;
    try {
      generateInvoicePDF(lastInvoice, settings || {}, 'download');
    } catch (err) {
      console.error(err);
      showToast('Failed to generate PDF', 'error');
    }
  };

  const handleWhatsApp = async () => {
    if (!lastInvoice) return;
    const phone = lastInvoice.customer_phone || selectedCustomer?.phone || '';
    if (!phone) {
      showToast('No customer phone number available', 'warning');
      return;
    }

    setSendingWhatsApp(true);
    try {
      await sendInvoiceViaWhatsApp(lastInvoice, settings);
      showToast('Invoice sent via WhatsApp successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to send WhatsApp message. Ensure WhatsApp is connected in Settings.', 'error');
    } finally {
      setSendingWhatsApp(false);
    }
  };


    return (
      <div className="billing-layout-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
        {/* Counter Tabs */}
        <div className="flex gap-2 pb-2" style={{ borderBottom: '1px solid var(--border-glass)', overflowX: 'auto', flexShrink: 0 }}>
          {sessions.map((session, i) => {
            const isActive = i === activeIdx;
            const { totalAmount, itemCount } = getSessionTotals(session);
            const isEmpty = itemCount === 0;

            return (
              <button
                key={i}
                onClick={() => {
                  setActiveIdx(i);
                  setTimeout(() => { if (searchRef.current) searchRef.current.focus(); }, 100);
                }}
                className={`glass-card ${isActive ? 'active-counter' : ''}`}
                style={{
                  flex: 1,
                  minWidth: 100,
                  padding: '8px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  cursor: 'pointer',
                  border: isActive ? '2px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                  background: isActive ? 'rgba(0, 122, 255, 0.08)' : 'var(--bg-glass)',
                  transform: isActive ? 'scale(1.02)' : 'scale(1)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: isActive ? '0 4px 12px rgba(0, 122, 255, 0.1)' : 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? 'var(--accent-blue)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Counter {i + 1} <span style={{ opacity: 0.4, fontSize: 9, marginLeft: 4 }}>[Alt+{i+1}]</span>
                  </span>
                  {itemCount > 0 && <span className="badge badge-blue" style={{ fontSize: 9, padding: '2px 6px' }}>{itemCount}</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: isEmpty ? 'var(--text-muted)' : 'var(--text-primary)', opacity: isEmpty ? 0.3 : 1 }}>
                  ₹{totalAmount.toFixed(0)}
                </div>
              </button>
            );
          })}
        </div>

        <div className="billing-layout" style={{ flex: 1, minHeight: 0 }}>
        <div className="billing-left-col" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'visible' }}>
            {billSaved && (
              <div className="glass-card mb-4" style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'slideDown 0.3s ease-out' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <RefreshCw size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#166534', fontSize: 16 }}>Bill Generated Successfully!</div>
                    <div style={{ fontSize: 13, color: '#166534', opacity: 0.8 }}>Invoice #{lastInvoice?.invoice_number} | Available for {reviewTimer}s</div>
                  </div>
                </div>
                <button className="btn btn-success" onClick={resetBilling} style={{ height: 36, padding: '0 16px' }}>
                  New Bill (Enter)
                </button>
              </div>
            )}
            <div className="glass-card mb-3" style={{ position: 'relative', zIndex: 100, flexShrink: 0, padding: '12px 20px' }}>
              <div className="search-box" style={{ maxWidth: '100%' }}>
                <Search />
                <input 
                  ref={searchRef} 
                  className="form-input" 
                  placeholder={billSaved ? "Bill Saved - Press Enter for New Bill" : "Type medicine name to add..."} 
                  value={medSearch} 
                  onChange={e => setMedSearch(e.target.value)} 
                  onKeyDown={e => {
                    if (e.key === 'Enter' && suggestions.length > 0) {
                      addMedicine(suggestions[0]);
                    }
                  }}
                  onFocus={() => !billSaved && medSearch && setShowSuggestions(true)} 
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} 
                  disabled={billSaved}
                  autoFocus 
                />
              {showSuggestions && (
                <div className="autocomplete-dropdown">
                  {suggestions.map(m => (
                    <div key={m.id} className="autocomplete-item" onMouseDown={() => addMedicine(m)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 500 }}>{m.brand_name}</div>
                        {m.alias && <span className="badge badge-blue" style={{ fontSize: 10 }}>{m.alias}</span>}
                      </div>
                      <div className="item-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{m.company_name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>|</span>
                        <span style={{ 
                          fontWeight: 700, 
                          color: m.total_stock <= 10 ? 'var(--accent-rose)' : 'var(--accent-green)',
                          background: m.total_stock <= 10 ? 'rgba(255, 59, 48, 0.1)' : 'rgba(52, 199, 89, 0.1)',
                          padding: '0 6px',
                          borderRadius: 4
                        }}>
                          Stock: {m.total_stock}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>|</span>
                        <span>GST: {m.gst_percent}%</span>
                        {['Tablet','Capsule','Strip'].includes(m.unit_category) && m.tablets_per_strip > 1 && (
                          <span className="badge badge-blue" style={{ fontSize: 10, marginLeft: 'auto' }}>1×{m.tablets_per_strip} strip</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: 10 }}>
          <div className="glass-card" style={{ padding: '12px' }}>
            {items.length === 0 ? <div className="empty-state" style={{ height: 120 }}><p>Search and add medicines above</p></div> : (
              <table className="data-table">
                <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th style={{ width: 60 }}>Strip</th><th style={{ width: 70 }}>Qty</th><th>Stock</th><th>Rate</th><th>Per Tab</th><th style={{ width: 60 }}>Disc%</th><th>GST%</th><th className="text-right">Total</th><th></th></tr></thead>
                <tbody>
                  {items.map((item, idx) => {
                    const tps = item.tablets_per_strip || 10;
                    const isTabletLike = ['Tablet','Capsule','Strip'].includes(item.unit_category);
                    const perTabPrice = isTabletLike ? (item.unit_price / tps) : item.unit_price;
                    const strips = isTabletLike ? Math.floor(item.quantity / tps) : 0;
                    const extraTabs = isTabletLike ? (item.quantity % tps) : 0;
                    const stripLabel = isTabletLike
                      ? (strips > 0 && extraTabs > 0
                          ? `${strips} strip${strips > 1 ? 's' : ''} + ${extraTabs} tab${extraTabs > 1 ? 's' : ''}`
                          : strips > 0
                          ? `${strips} strip${strips > 1 ? 's' : ''}`
                          : `${extraTabs} tab${extraTabs !== 1 ? 's' : ''}`)
                      : '';
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600, fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {item.brand_name}
                            {item.is_h1 === 1 && <span className="badge badge-red" style={{ fontSize: 9, padding: '1px 4px' }}>H1</span>}
                          </div>
                          <span className="text-muted" style={{ fontSize: 10 }}>{item.company_name}</span>
                        </td>
                        <td style={{ fontSize: 11 }}>{item.batch_number}</td>
                        <td style={{ fontSize: 11 }}>{item.expiry_date}</td>
                        <td style={{ fontSize: 11 }}>
                          {isTabletLike ? (
                            <span className="badge badge-blue" style={{ fontSize: 10 }}>1×{tps}</span>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          <input
                            type="number"
                            className={`form-input ${item.quantity > item.max_qty || item.quantity <= 0 ? 'input-error' : ''}`}
                            style={{ width: 55, padding: '2px 4px', textAlign: 'center', fontSize: 12 }}
                            value={item.quantity}
                            onChange={e => {
                              const val = e.target.value;
                              updateItem(idx, 'quantity', val === '' ? '' : parseInt(val));
                            }}
                            min={1}
                            max={item.max_qty}
                            disabled={billSaved}
                            title={isTabletLike ? `Enter number of tablets (1 strip = ${tps} tabs)` : 'Quantity'}
                          />
                          {isTabletLike && item.quantity > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--accent-primary)', marginTop: 2, whiteSpace: 'nowrap' }}>{stripLabel}</div>
                          )}
                          {item.quantity > item.max_qty && (
                            <div style={{ fontSize: 10, color: 'var(--accent-rose)', marginTop: 4, whiteSpace: 'normal', lineHeight: 1.2, width: 80 }}>
                              Max {item.max_qty} in stock
                            </div>
                          )}
                          {item.quantity <= 0 && (
                            <div style={{ fontSize: 10, color: 'var(--accent-rose)', marginTop: 4, whiteSpace: 'normal', lineHeight: 1.2, width: 80 }}>
                              Min 1 required
                            </div>
                          )}
                        </td>
                        <td>
                          <div className={`badge ${item.max_qty <= 10 ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 11, padding: '4px 8px' }}>
                            {item.max_qty}
                          </div>
                        </td>
                        <td style={{ fontSize: 12 }}>₹{item.unit_price.toFixed(2)}{isTabletLike && <span className="text-muted" style={{ fontSize: 9 }}>/s</span>}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {isTabletLike ? `₹${perTabPrice.toFixed(2)}` : '—'}
                        </td>
                        <td><input type="number" className="form-input" style={{ width: 50, padding: '2px 4px', textAlign: 'center', fontSize: 12 }} value={item.discount_percent} onChange={e => updateItem(idx, 'discount_percent', Number(e.target.value) || 0)} min={0} max={100} disabled={billSaved} /></td>
                        <td style={{ fontSize: 11 }}>{item.gst_percent}%</td>
                        <td className="text-right" style={{ fontWeight: 700, fontSize: 13 }}>₹{(item.quantity * perTabPrice * (1 - item.discount_percent / 100)).toFixed(2)}</td>
                        <td><button className="btn btn-danger btn-sm" onClick={() => removeItem(idx)} style={{ padding: '2px 4px' }} disabled={billSaved}><Trash2 size={12}/></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          </div>
        </div>
          <div className="billing-summary" style={{ gap: 10 }}>
              <div className="glass-card" style={{ position: 'relative', zIndex: 20, padding: '12px 16px' }}>
                <div className="flex justify-between items-center mb-3"><span className="card-title" style={{ margin: 0 }}>Customer</span><button className="btn btn-secondary btn-sm" onClick={() => setShowNewCust(true)} disabled={billSaved} style={{ padding: '4px 8px' }}><UserPlus size={12}/></button></div>
                <div style={{ position: 'relative' }}>
                  <input className="form-input" placeholder="Search customer..." value={selectedCustomer ? selectedCustomer.name : custSearch} onChange={e => { setCustSearch(e.target.value); setSelectedCustomer(null); setShowCustDropdown(true); }} onFocus={() => !billSaved && setShowCustDropdown(true)} onBlur={() => setTimeout(() => setShowCustDropdown(false), 200)} disabled={billSaved} />
                  {selectedCustomer && !billSaved && <button style={{ position: 'absolute', right: 8, top: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => { setSelectedCustomer(null); setCustSearch(''); }}><X size={16}/></button>}
                  {showCustDropdown && !selectedCustomer && !billSaved && (
                    <div className="autocomplete-dropdown">
                      {filteredCustomers.slice(0, 8).map(c => <div key={c.id} className="autocomplete-item" onMouseDown={() => { setSelectedCustomer(c); setCustSearch(''); setShowCustDropdown(false); }}>{c.name} {c.phone && <span className="text-muted"> - {c.phone}</span>}{c.credit_balance > 0 && <span className="badge badge-red" style={{ marginLeft: 6 }}>₹{c.credit_balance}</span>}</div>)}
                    </div>
                  )}
                </div>
              </div>
              <div className="glass-card" style={{ position: 'relative', zIndex: 15, padding: '12px 16px' }}>
                <div className="flex justify-between items-center mb-3"><span className="card-title" style={{ margin: 0 }}>Doctor</span><button className="btn btn-secondary btn-sm" onClick={() => setShowNewDoc(true)} disabled={billSaved} style={{ padding: '4px 8px' }}><Stethoscope size={12}/></button></div>
                <div style={{ position: 'relative' }}>
                  <input className="form-input" placeholder="Search doctor..." value={selectedDoctor ? selectedDoctor.name : docSearch} onChange={e => { setDocSearch(e.target.value); setSelectedDoctor(null); setShowDocDropdown(true); }} onFocus={() => !billSaved && setShowDocDropdown(true)} onBlur={() => setTimeout(() => setShowDocDropdown(false), 200)} disabled={billSaved} />
                  {selectedDoctor && !billSaved && <button style={{ position: 'absolute', right: 8, top: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => { setSelectedDoctor(null); setDocSearch(''); }}><X size={16}/></button>}
                  {showDocDropdown && !selectedDoctor && !billSaved && (
                    <div className="autocomplete-dropdown">
                      {filteredDoctors.slice(0, 8).map(d => <div key={d.id} className="autocomplete-item" onMouseDown={() => { setSelectedDoctor(d); setDocSearch(''); setShowDocDropdown(false); }}>Dr. {d.name} <span className="text-muted">{d.hospital && ` - ${d.hospital}`}</span></div>)}
                    </div>
                  )}
                </div>
              </div>
            <div className="glass-card" style={{ padding: '12px 16px' }}>
              <div className="card-title" style={{ marginBottom: 6 }}>Payment Mode</div>
              <div className="flex gap-2">{['Cash', 'UPI', 'Pending'].map(mode => <button key={mode} className={`btn ${paymentMode === mode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => !billSaved && setPaymentMode(mode)} disabled={billSaved} style={{ flex: 1, padding: '6px 4px', fontSize: 12 }}>{mode}</button>)}</div>
            </div>

            <div className="glass-card" style={{ flex: 1, padding: '12px 16px' }}>
              <div className="flex justify-between items-center mb-2">
                <div className="card-title" style={{ margin: 0 }}>Bill Summary</div>
                <button 
                  className={`btn btn-sm ${isGstEnabled ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => !billSaved && setIsGstEnabled(!isGstEnabled)}
                  disabled={billSaved}
                  style={{ fontSize: 10, padding: '2px 6px' }}
                >
                  {isGstEnabled ? 'GST' : 'No GST'}
                </button>
              </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }}>
                <div className="flex justify-between"><span className="text-secondary">Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-secondary">GST</span><span>₹{gstAmount.toFixed(2)}</span></div>
                <div className="flex justify-between items-center"><span className="text-secondary">Discount</span><input type="number" className="form-input" style={{ width: 80, padding: '3px 8px', textAlign: 'right' }} value={discount} onChange={e => setDiscount(Number(e.target.value) || 0)} min={0} disabled={billSaved} /></div>

              <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 8, marginTop: 4 }}><div className="flex justify-between" style={{ fontSize: 18, fontWeight: 700 }}><span>Total</span><span>₹{totalAmount.toFixed(2)}</span></div></div>
            </div>
        </div>
          <div className="flex gap-2" style={{ marginTop: 'auto' }}>
            {billSaved ? (
              <button 
                ref={newBillBtnRef}
                className="btn btn-primary" 
                onClick={resetBilling} 
                style={{ flex: 1, height: 40, fontSize: 15, fontWeight: 600, border: '2px solid #22c55e' }}
              >
                {reviewTimer > 0 ? `New Bill (${reviewTimer}s)` : 'New Bill (Enter)'}
              </button>
            ) : (
              <button 
                className="btn btn-success" 
                onClick={handleSave} 
                disabled={saving || items.length === 0} 
                style={{ flex: 1, height: 40, fontSize: 15, fontWeight: 600 }}
              >
                {saving ? 'Saving...' : 'Save Bill (Enter)'}
              </button>
            )}
          </div>

        {lastInvoice && (
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={handlePrint} style={{ flex: 1 }}><Printer size={14} fill="currentColor" fillOpacity={0.2}/> Print</button>
            <button className="btn btn-secondary btn-sm" onClick={handlePDF} style={{ flex: 1 }}><FileText size={14} fill="currentColor" fillOpacity={0.2}/> PDF</button>
            <button className="btn btn-success btn-sm" onClick={handleWhatsApp} style={{ flex: 1 }} disabled={sendingWhatsApp}>
              {sendingWhatsApp ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} fill="currentColor" fillOpacity={0.2} />}
              WhatsApp
            </button>

          </div>
        )}
      </div>
      {showNewCust && <QuickCustomerModal onClose={() => setShowNewCust(false)} onSave={(c) => { setCustomers(prev => [...prev, c]); setSelectedCustomer(c); setShowNewCust(false); showToast('Customer added'); }} />}
      {showNewDoc && <QuickDoctorModal onClose={() => setShowNewDoc(false)} onSave={(d) => { setDoctors(prev => [...prev, d]); setSelectedDoctor(d); setShowNewDoc(false); showToast('Doctor added'); }} />}
      {showH1Modal && <H1DetailsModal details={h1Details} setDetails={setH1Details} onClose={() => setShowH1Modal(false)} />}
    </div>
  </div>
  );
}

function H1DetailsModal({ details, setDetails, onClose }) {
  const set = (k, v) => setDetails(prev => ({ ...prev, [k]: v }));
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Schedule H1 Drug Details</h2>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="modal-body">
          <p className="text-muted mb-4" style={{ fontSize: 13 }}>These details are mandatory under Indian Drugs & Cosmetics Rules for Schedule H1 medicines.</p>
          
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Patient Name *</label>
              <input className="form-input" value={details.patient_name} onChange={e => set('patient_name', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Patient Address *</label>
            <input className="form-input" value={details.patient_address} onChange={e => set('patient_address', e.target.value)} />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Doctor Name *</label>
              <input className="form-input" value={details.doctor_name} onChange={e => set('doctor_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Doctor Reg. No *</label>
              <input className="form-input" value={details.doctor_reg_no} onChange={e => set('doctor_reg_no', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Doctor Address *</label>
            <input className="form-input" value={details.doctor_address} onChange={e => set('doctor_address', e.target.value)} />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Prescription No / ID *</label>
              <input className="form-input" value={details.prescription_no} onChange={e => set('prescription_no', e.target.value)} />
            </div>
          </div>

          <div className="alert alert-yellow" style={{ marginTop: 15, fontSize: 12 }}>
            <strong>Note:</strong> Records must be maintained for 3 years for government inspection.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary w-full" onClick={onClose}>Confirm Details</button>
        </div>
      </div>
    </div>
  );
}

function QuickCustomerModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);
  const showToast = useToast();
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showToast('Name required', 'error');
    setSaving(true);
    try { const c = await api.createCustomer(form); onSave(c); } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>New Customer</h2><button className="modal-close" onClick={onClose}><X size={18}/></button></div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">

          
            <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
            <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Address</label><input className="form-input" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
          </div>
          <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Add'}</button></div>
        </form>
      </div>
    </div>
  );
}

function QuickDoctorModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', hospital: '', phone: '', specialization: '' });
  const [saving, setSaving] = useState(false);
  const showToast = useToast();
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showToast('Name required', 'error');
    setSaving(true);
    try { const d = await api.createDoctor(form); onSave(d); } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>New Doctor</h2><button className="modal-close" onClick={onClose}><X size={18}/></button></div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
            <div className="form-group"><label className="form-label">Hospital</label><input className="form-input" value={form.hospital} onChange={e => setForm(p => ({ ...p, hospital: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Specialization</label><input className="form-input" value={form.specialization} onChange={e => setForm(p => ({ ...p, specialization: e.target.value }))} /></div>
          </div>
          <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Add'}</button></div>
        </form>
      </div>
    </div>
  );
}
