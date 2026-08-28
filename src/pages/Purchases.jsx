import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { Plus, Eye, ArrowLeft, CreditCard, Edit2, Trash2, ShoppingCart, Wallet, FileText, AlertCircle } from 'lucide-react';
import { money, formatDate, todayStr, daysUntil } from '../utils/format';
import {
  Button, DataTable, SearchInput, EmptyState, Badge, StatCard,
  FormField, Input, Select,
} from '../components/ui';

const TABLET_LIKE = ['Tablet', 'Capsule', 'Strip'];

// Per-line purchase cost. quantity is in individual units/tablets while
// purchase_rate is per STRIP, so for tablet-like categories divide the rate by
// the strip size. Mirrors server/money.js so displayed totals match what the
// server stores as total_amount.
const lineCost = (it) => {
  const qty = Number(it.quantity) || 0;
  const rate = parseFloat(it.purchase_rate) || 0;
  const isTabletLike = TABLET_LIKE.includes(it.unit_category);
  const tps = isTabletLike ? (Number(it.tablets_per_strip) || 1) : 1;
  return qty * (rate / (tps > 0 ? tps : 1));
};
const itemsTotal = (list) => (list || []).reduce((sum, i) => sum + lineCost(i), 0);

const statusBadge = (p) => {
  const total = Number(p.total_amount) || 0;
  const paid = Number(p.amount_paid) || 0;
  if (total > 0 && paid >= total - 0.01) return <Badge tone="green">Paid</Badge>;
  if (paid > 0) return <Badge tone="yellow">Partial</Badge>;
  return <Badge tone="red">Unpaid</Badge>;
};

export default function Purchases() {
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);

  const goList = () => { setEditing(null); setView('list'); };

  if (view === 'create') {
    return <PurchaseCreate editing={editing} onDone={goList} onCancel={goList} />;
  }
  if (view === 'detail') {
    return (
      <PurchaseDetail
        id={selectedId}
        onBack={() => setView('list')}
        onEdit={(purchase) => { setEditing(purchase); setView('create'); }}
      />
    );
  }
  return (
    <PurchaseList
      onNew={() => { setEditing(null); setView('create'); }}
      onView={(id) => { setSelectedId(id); setView('detail'); }}
    />
  );
}

/* ------------------------------- LIST ------------------------------- */

function PurchaseList({ onNew, onView }) {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const showToast = useToast();

  useEffect(() => {
    setLoading(true);
    api.get('/purchases')
      .then(setPurchases)
      .catch(() => showToast('Failed to load purchases', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const stats = useMemo(() => {
    let value = 0, outstanding = 0, unpaid = 0;
    for (const p of purchases) {
      const total = Number(p.total_amount) || 0;
      const paid = Number(p.amount_paid) || 0;
      value += total;
      const bal = total - paid;
      if (bal > 0.01) { outstanding += bal; unpaid++; }
    }
    return { count: purchases.length, value, outstanding, unpaid };
  }, [purchases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter(
      (p) =>
        (p.supplier_name || '').toLowerCase().includes(q) ||
        (p.invoice_number || '').toLowerCase().includes(q)
    );
  }, [purchases, search]);

  const columns = [
    { header: 'Date', render: (p) => formatDate(p.purchase_date) },
    { header: 'Supplier', render: (p) => <span style={{ fontWeight: 500 }}>{p.supplier_name || '—'}</span> },
    { header: 'Invoice #', render: (p) => p.invoice_number || <span className="text-muted">—</span> },
    { header: 'Total', align: 'right', render: (p) => money(p.total_amount) },
    { header: 'Paid', align: 'right', render: (p) => <span style={{ color: 'var(--success)' }}>{money(p.amount_paid)}</span> },
    {
      header: 'Balance',
      align: 'right',
      render: (p) => {
        const bal = (Number(p.total_amount) || 0) - (Number(p.amount_paid) || 0);
        return <span style={{ color: bal > 0.01 ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: bal > 0.01 ? 600 : 400 }}>{money(bal)}</span>;
      },
    },
    { header: 'Status', align: 'center', render: (p) => statusBadge(p) },
    { header: '', align: 'right', width: 100, render: (p) => <Button size="sm" variant="secondary" icon={Eye} onClick={() => onView(p.id)}>View</Button> },
  ];

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <SearchInput value={search} onChange={setSearch} placeholder="Search supplier or invoice…" width={280} />
        </div>
        <div className="toolbar-right">
          <Button variant="primary" icon={Plus} onClick={onNew}>New Purchase</Button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Total Purchases" value={stats.count} accent="blue" icon={ShoppingCart} />
        <StatCard label="Total Value" value={money(stats.value)} accent="purple" icon={FileText} />
        <StatCard label="Outstanding Payable" value={money(stats.outstanding)} accent="red" icon={Wallet} />
        <StatCard label="Unpaid / Partial" value={stats.unpaid} accent="amber" icon={AlertCircle} />
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <DataTable
          loading={loading}
          columns={columns}
          rows={filtered}
          empty={
            <EmptyState
              icon={ShoppingCart}
              title="No purchases found"
              message={search ? 'No purchases match your search.' : 'Record your first stock purchase to get started.'}
              action={!search && <Button icon={Plus} onClick={onNew}>New Purchase</Button>}
            />
          }
        />
      </div>
    </div>
  );
}

/* ------------------------------ DETAIL ------------------------------ */

function PurchaseDetail({ id, onBack, onEdit }) {
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const showToast = useToast();

  useEffect(() => {
    setLoading(true);
    api.get(`/purchases/${id}`)
      .then(setPurchase)
      .catch(() => showToast('Failed to load purchase', 'error'))
      .finally(() => setLoading(false));
  }, [id, showToast]);

  const columns = [
    { header: 'Medicine', render: (it) => <span style={{ fontWeight: 500 }}>{it.brand_name}</span> },
    { header: 'Batch', render: (it) => it.batch_number },
    { header: 'Expiry', render: (it) => formatDate(it.expiry_date) },
    { header: 'Qty', align: 'right', render: (it) => it.quantity },
    { header: 'Rate', align: 'right', render: (it) => money(it.purchase_rate) },
    { header: 'MRP', align: 'right', render: (it) => money(it.mrp) },
    { header: 'Total', align: 'right', render: (it) => money(lineCost(it)) },
  ];

  const total = Number(purchase?.total_amount) || 0;
  const paid = Number(purchase?.amount_paid) || 0;

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <Button variant="secondary" icon={ArrowLeft} onClick={onBack}>Back</Button>
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            Purchase #{id} {purchase && statusBadge(purchase)}
          </h2>
        </div>
        <div className="toolbar-right">
          {purchase && <Button variant="primary" icon={Edit2} onClick={() => onEdit(purchase)}>Edit Purchase</Button>}
        </div>
      </div>

      {loading || !purchase ? (
        <div className="glass-card"><DataTable loading columns={columns} rows={[]} /></div>
      ) : (
        <>
          <div className="glass-card mb-4">
            <div className="two-col">
              <Detail label="Supplier" value={purchase.supplier_name} />
              <Detail label="Invoice No" value={purchase.invoice_number || '—'} />
              <Detail label="Date" value={formatDate(purchase.purchase_date)} />
              <Detail label="Total Amount" value={money(total)} strong accent="var(--primary)" />
              <Detail label="Amount Paid" value={money(paid)} strong accent="var(--success)" />
              <Detail label="Remaining Balance" value={money(total - paid)} strong accent={total - paid > 0.01 ? 'var(--danger)' : 'var(--text-secondary)'} />
            </div>
          </div>

          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <DataTable
              columns={columns}
              rows={purchase.items || []}
              empty={<EmptyState title="No items" message="This purchase has no line items." height={140} />}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Detail({ label, value, strong, accent }) {
  return (
    <div>
      <div className="text-muted text-xs" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontWeight: strong ? 700 : 500, fontSize: strong ? 18 : 14, color: accent || 'var(--text-primary)', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

/* ------------------------------ CREATE ------------------------------ */

const EMPTY_ITEM = {
  medicine_id: '', medicine_name: '', batch_number: '', expiry_date: '', mfg_date: '',
  quantity: '', pack_count: '', purchase_rate: '', selling_rate: '', mrp: '',
  unit_category: '', tablets_per_strip: 10, gst_percent: 12,
};

function useItemValidation(item) {
  return useMemo(() => {
    const today = todayStr();
    const sell = parseFloat(item.selling_rate);
    const purch = parseFloat(item.purchase_rate);
    const mrp = parseFloat(item.mrp);
    const errors = {};

    if (!isNaN(sell) && !isNaN(purch) && sell < purch) errors.selling_rate = `Cannot be below purchase rate (${money(purch)})`;
    else if (!isNaN(sell) && !isNaN(mrp) && sell > mrp) errors.selling_rate = `Cannot exceed MRP (${money(mrp)})`;
    if (!isNaN(purch) && !isNaN(mrp) && purch > mrp) errors.purchase_rate = `Cannot exceed MRP (${money(mrp)})`;
    if (item.expiry_date && item.expiry_date <= today) errors.expiry_date = 'Must be a future date — expired stock cannot be purchased';
    if (item.mfg_date && item.expiry_date && item.mfg_date >= item.expiry_date) errors.mfg_date = 'MFG must be before expiry';

    const margin = (!isNaN(sell) && !isNaN(purch) && purch > 0) ? ((sell - purch) / purch) * 100 : null;
    const mrpDiscount = (!isNaN(sell) && !isNaN(mrp) && mrp > 0) ? ((mrp - sell) / mrp) * 100 : null;

    const warnings = [];
    const dte = item.expiry_date && !errors.expiry_date ? daysUntil(item.expiry_date) : null;
    if (dte != null && dte > 0 && dte < 90) warnings.push(`This batch expires in ${dte} days`);
    if (margin != null && !isNaN(sell) && sell > 0 && margin < 5) warnings.push(`Very low profit margin: ${margin.toFixed(1)}%`);

    return { errors, warnings, margin, mrpDiscount, hasError: Object.keys(errors).length > 0 };
  }, [item]);
}

function PurchaseCreate({ editing, onDone, onCancel }) {
  const showToast = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    id: editing?.id,
    supplier_id: editing?.supplier_id || '',
    invoice_number: editing?.invoice_number || '',
    purchase_date: (editing?.purchase_date || todayStr()).slice(0, 10),
    notes: editing?.notes || '',
    amount_paid: editing?.amount_paid ?? '',
    payment_mode: 'Cash',
    payment_notes: '',
  });

  const [items, setItems] = useState(
    editing?.items
      ? editing.items.map((it) => ({
          id: `${it.batch_id || it.medicine_id}-${Math.random()}`,
          medicine_id: it.medicine_id,
          medicine_name: it.brand_name,
          batch_id: it.batch_id,
          batch_number: it.batch_number,
          expiry_date: (it.expiry_date || '').slice(0, 10),
          mfg_date: (it.mfg_date || '').slice(0, 10),
          quantity: it.quantity,
          purchase_rate: it.purchase_rate,
          selling_rate: it.selling_rate,
          mrp: it.mrp,
          unit_category: it.unit_category || 'Tablet',
          tablets_per_strip: it.tablets_per_strip || 10,
          pack_count: '',
        }))
      : []
  );

  const [currentItem, setCurrentItem] = useState(EMPTY_ITEM);
  const [searchMed, setSearchMed] = useState('');
  const [medResults, setMedResults] = useState([]);
  const [searchingMed, setSearchingMed] = useState(false);
  const blurTimer = useRef(null);
  const searchTimer = useRef(null);

  const v = useItemValidation(currentItem);

  useEffect(() => {
    api.get('/suppliers')
      .then(setSuppliers)
      .catch(() => showToast('Failed to load suppliers', 'error'));
  }, [showToast]);

  const setItem = (patch) => setCurrentItem((p) => ({ ...p, ...patch }));

  const handleSearchMed = (query) => {
    setSearchMed(query);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setMedResults([]);
      setSearchingMed(false);
      return;
    }

    setSearchingMed(true);
    // Instant responsive debounce using high-performance SQLite indexed search
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.getMedicines({ search: trimmed, limit: 12, active_only: 'true' });
        const list = res?.data || (Array.isArray(res) ? res : []);
        setMedResults(list);
      } catch (err) {
        console.error('Medicine search error:', err);
      } finally {
        setSearchingMed(false);
      }
    }, 60);
  };

  const selectMedicine = async (med) => {
    const base = {
      medicine_id: med.id,
      medicine_name: med.brand_name,
      gst_percent: med.gst_percent ?? 12,
      unit_category: med.unit_category || 'Tablet',
      tablets_per_strip: med.tablets_per_strip || 10,
      pack_count: '',
    };

    setSearchMed(med.brand_name);
    setMedResults([]);

    try {
      // Pre-fill latest known batch rates if available
      const fullMed = await api.getMedicine(med.id);
      const latestBatch = fullMed?.batches && fullMed.batches.length > 0
        ? fullMed.batches[fullMed.batches.length - 1]
        : null;

      if (latestBatch) {
        setCurrentItem({
          ...EMPTY_ITEM,
          ...base,
          batch_number: '',
          purchase_rate: latestBatch.purchase_rate || '',
          selling_rate: latestBatch.selling_rate || '',
          mrp: latestBatch.mrp || '',
        });
      } else {
        setCurrentItem({ ...EMPTY_ITEM, ...base });
      }
    } catch {
      setCurrentItem({ ...EMPTY_ITEM, ...base });
    }
  };

  const addItem = () => {
    if (!currentItem.medicine_id || !currentItem.batch_number || !currentItem.quantity || !currentItem.expiry_date) {
      return showToast('Fill Medicine, Batch No, Expiry and Quantity', 'error');
    }
    const qty = parseInt(currentItem.quantity);
    if (isNaN(qty) || qty <= 0) return showToast('Quantity must be a positive number', 'error');
    if (v.hasError) return showToast(Object.values(v.errors)[0], 'error');

    setItems((prev) => [...prev, { ...currentItem, id: Date.now() }]);
    setCurrentItem(EMPTY_ITEM);
    setSearchMed('');
  };

  const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));
  const editItem = (item) => { setCurrentItem({ ...item }); setSearchMed(item.medicine_name); removeItem(item.id); };

  const total = itemsTotal(items);
  const amtPaid = parseFloat(formData.amount_paid) || 0;
  const amtPaidExceedsTotal = amtPaid > total && total > 0;

  const handleSubmit = async () => {
    if (!formData.supplier_id) return showToast('Please select a supplier', 'error');
    if (items.length === 0) return showToast('Add at least one item', 'error');
    if (items.some((i) => !i.medicine_id)) return showToast('An item is missing its medicine — remove and re-add it', 'error');
    if (amtPaid < 0) return showToast('Amount paid cannot be negative', 'error');
    if (amtPaidExceedsTotal) return showToast(`Amount paying (${money(amtPaid)}) cannot exceed total (${money(total)})`, 'error');

    const payload = {
      ...formData,
      amount_paid: amtPaid,
      items: items.map((i) => ({
        medicine_id: i.medicine_id,
        batch_id: i.batch_id,
        batch_number: i.batch_number,
        expiry_date: i.expiry_date,
        mfg_date: i.mfg_date,
        quantity: parseInt(i.quantity),
        purchase_rate: parseFloat(i.purchase_rate),
        selling_rate: parseFloat(i.selling_rate),
        mrp: parseFloat(i.mrp),
      })),
    };

    setSaving(true);
    try {
      if (formData.id) await api.put(`/purchases/${formData.id}`, payload);
      else await api.post('/purchases', payload);
      showToast(formData.id ? 'Purchase updated' : 'Purchase saved');
      onDone();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const isTabletLike = TABLET_LIKE.includes(currentItem.unit_category);
  const tps = currentItem.tablets_per_strip || 10;

  const itemColumns = [
    { header: 'Item', render: (it) => <span style={{ fontWeight: 500 }}>{it.medicine_name}</span> },
    { header: 'Batch', render: (it) => it.batch_number },
    {
      header: 'Qty',
      align: 'right',
      render: (it) => {
        const isTab = TABLET_LIKE.includes(it.unit_category);
        if (!isTab) return it.quantity;
        const strips = Math.floor(it.quantity / it.tablets_per_strip);
        const tabs = it.quantity % it.tablets_per_strip;
        return `${strips > 0 ? strips + 's ' : ''}${tabs > 0 ? tabs + 't' : ''}`.trim() || it.quantity;
      },
    },
    { header: 'Total', align: 'right', render: (it) => money(lineCost(it)) },
    {
      header: '',
      align: 'right',
      width: 80,
      render: (it) => (
        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" icon={Edit2} onClick={() => editItem(it)} title="Edit item" />
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => removeItem(it.id)} title="Remove item" />
        </div>
      ),
    },
  ];

  return (
    <div style={{ paddingBottom: 24 }}>
      <div className="toolbar">
        <div className="toolbar-left">
          <Button variant="secondary" icon={ArrowLeft} onClick={onCancel}>Back</Button>
          <h2 className="section-title" style={{ marginBottom: 0 }}>{formData.id ? `Edit Purchase #${formData.id}` : 'New Purchase Entry'}</h2>
        </div>
        <div className="toolbar-right">
          <Button variant="primary" loading={saving} disabled={amtPaidExceedsTotal} onClick={handleSubmit}>
            {formData.id ? 'Save Changes' : 'Save Purchase'}
          </Button>
        </div>
      </div>

      <div className="glass-card mb-4">
        <div className="form-row">
          <FormField label="Supplier" required>
            <Select value={formData.supplier_id} onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}>
              <option value="">Select Supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Invoice Number">
            <Input value={formData.invoice_number} onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })} />
          </FormField>
          <FormField label="Purchase Date">
            <Input type="date" value={formData.purchase_date} max={todayStr()} onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })} />
          </FormField>
        </div>
      </div>

      <div className="two-col mb-4">
        {/* Add item */}
        <div className="glass-card">
          <h3 className="section-title" style={{ fontSize: 14, marginBottom: 14 }}>Add Item</h3>

          <FormField label="Medicine Search" required>
            <div style={{ position: 'relative' }}>
              <Input
                placeholder="Type medicine name…"
                value={searchMed}
                onChange={(e) => handleSearchMed(e.target.value)}
                onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
                onBlur={() => { blurTimer.current = setTimeout(() => setMedResults([]), 150); }}
              />
              {medResults.length > 0 && (
                <div className="autocomplete-dropdown">
                  {medResults.map((m) => (
                    <div key={m.id} className="autocomplete-item" onMouseDown={() => selectMedicine(m)}>
                      <div style={{ fontWeight: 500 }}>
                        {m.brand_name} <span className="text-muted" style={{ fontWeight: 400 }}>· {m.company_name || 'Generic'}</span>
                      </div>
                      <div className="item-subtitle" style={{ color: 'var(--text-muted)' }}>
                        {m.generic_name ? `${m.generic_name} · ` : ''}Current Stock: {m.total_stock || 0} {m.unit_category || 'units'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FormField>

          <div className="form-row">
            <FormField label="Batch No" required>
              <Input value={currentItem.batch_number} onChange={(e) => setItem({ batch_number: e.target.value })} />
            </FormField>
            <FormField label="MFG Date" error={v.errors.mfg_date}>
              <Input type="date" value={currentItem.mfg_date} max={todayStr()} error={!!v.errors.mfg_date} onChange={(e) => setItem({ mfg_date: e.target.value })} />
            </FormField>
            <FormField label="Expiry Date" required error={v.errors.expiry_date}>
              <Input type="date" value={currentItem.expiry_date} min={todayStr()} error={!!v.errors.expiry_date} onChange={(e) => setItem({ expiry_date: e.target.value })} />
            </FormField>
          </div>

          <div className="form-row">
            {isTabletLike && (
              <FormField label={`Pack / Strips (1×${tps})`}>
                <Input
                  type="number" min="1" placeholder="e.g. 5"
                  value={currentItem.pack_count}
                  onChange={(e) => {
                    const pack = parseInt(e.target.value) || '';
                    setItem({ pack_count: pack, quantity: pack ? pack * tps : '' });
                  }}
                />
              </FormField>
            )}
            <FormField label={`Quantity${isTabletLike ? ' (total tabs)' : ''}`} required>
              <Input
                type="number" min="1"
                value={currentItem.quantity}
                onChange={(e) => {
                  const qty = parseInt(e.target.value) || '';
                  setItem({ quantity: qty, pack_count: isTabletLike && qty > 0 ? (qty / tps).toFixed(1).replace(/\.0$/, '') : '' });
                }}
              />
            </FormField>
            <FormField label={`Purchase Rate${isTabletLike ? ' /strip' : ''}`} error={v.errors.purchase_rate}>
              <Input type="number" step="0.01" min="0" error={!!v.errors.purchase_rate} value={currentItem.purchase_rate} onChange={(e) => setItem({ purchase_rate: e.target.value })} />
            </FormField>
          </div>

          <div className="form-row">
            <FormField label="MRP (₹/strip)">
              <Input type="number" step="0.01" min="0" value={currentItem.mrp} onChange={(e) => setItem({ mrp: e.target.value })} />
            </FormField>
            <FormField
              label={`Selling Rate${v.margin != null ? ` · ${v.margin.toFixed(1)}% margin` : ''}${v.mrpDiscount != null && !v.errors.selling_rate ? ` · ${v.mrpDiscount.toFixed(1)}% off` : ''}`}
              error={v.errors.selling_rate}
            >
              <Input type="number" step="0.01" min="0" error={!!v.errors.selling_rate} value={currentItem.selling_rate} onChange={(e) => setItem({ selling_rate: e.target.value })} />
            </FormField>
          </div>

          {v.warnings.length > 0 && !v.hasError && (
            <div className="alert alert-yellow mb-2">
              {v.warnings.map((w, i) => <div key={i} style={{ fontWeight: 500 }}>⚠️ {w}</div>)}
            </div>
          )}

          <Button variant="secondary" className="w-full" icon={Plus} disabled={v.hasError} onClick={addItem}>
            {v.hasError ? 'Fix errors to add' : 'Add to List'}
          </Button>
        </div>

        {/* Items list */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
            Items ({items.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <DataTable
              columns={itemColumns}
              rows={items}
              empty={<EmptyState icon={ShoppingCart} title="No items yet" message="Search a medicine and add it to this purchase." height={160} />}
            />
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', textAlign: 'right', fontWeight: 700 }}>
            Total: {money(total)}
          </div>
        </div>
      </div>

      {/* Payment */}
      <div className="glass-card mb-4">
        <div style={{ paddingBottom: 12, marginBottom: 16, borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={16} style={{ color: 'var(--primary)' }} /> Payment Details (Optional)
        </div>
        <div className="form-row">
          <FormField label="Total Amount">
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{money(total)}</div>
          </FormField>
          <FormField label="Payment Mode">
            <Select value={formData.payment_mode} onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}>
              <option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option>
            </Select>
          </FormField>
          <FormField label="Amount Paying Now" error={amtPaidExceedsTotal ? `Cannot exceed total (${money(total)})` : undefined}>
            <Input type="number" step="0.01" min="0" placeholder="0.00" error={amtPaidExceedsTotal} value={formData.amount_paid} onChange={(e) => setFormData({ ...formData, amount_paid: e.target.value })} />
          </FormField>
          <FormField label="Remaining Balance">
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{money(total - amtPaid)}</div>
          </FormField>
        </div>
        <div className="form-row">
          <FormField label="Note / Reference (optional)" style={{ flex: 2 }}>
            <Input placeholder="Transaction ID, cheque no, etc." value={formData.payment_notes} onChange={(e) => setFormData({ ...formData, payment_notes: e.target.value })} />
          </FormField>
          <FormField label="Payment Date">
            <Input type="date" value={formData.purchase_date} readOnly style={{ background: 'var(--bg-subtle)', cursor: 'default' }} />
          </FormField>
        </div>
      </div>

      <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" loading={saving} disabled={amtPaidExceedsTotal} onClick={handleSubmit} style={{ padding: '10px 36px' }}>
          {formData.id ? 'Save Changes' : 'Save Purchase & Payment'}
        </Button>
      </div>
    </div>
  );
}
