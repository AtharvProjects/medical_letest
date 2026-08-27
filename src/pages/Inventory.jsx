import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { Plus, Edit2, Package, Trash2, Upload, Download, RefreshCw, FileSpreadsheet, Layers, AlertTriangle, PackageX, CalendarClock } from 'lucide-react';
import Fuse from 'fuse.js';
import { downloadCSV, readFileAsText, exportFilename } from '../utils/csv';
import ImportResultModal from '../components/ImportResultModal';
import {
  Button,
  Modal,
  ConfirmDialog,
  DataTable,
  SearchInput,
  EmptyState,
  Badge,
  StatCard,
  FormField,
  Input,
  Select,
} from '../components/ui';
import { todayStr, daysUntil, formatDate } from '../utils/format';

const UNIT_CATEGORIES = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Ointment', 'Drops', 'Powder', 'Inhaler', 'Gel', 'Lotion', 'Spray', 'Suppository', 'Strip', 'Bottle', 'Tube', 'Sachet', 'Other'];
const GST_RATES = [0, 5, 12, 18, 28];
const TABLET_LIKE = ['Tablet', 'Capsule', 'Strip'];

function StockCell({ stock, lowThreshold }) {
  const n = Number(stock) || 0;
  if (n <= 0) return <Badge tone="red">Out of stock</Badge>;
  if (n <= lowThreshold) return <Badge tone="yellow">{n} · low</Badge>;
  return <Badge tone="green">{n}</Badge>;
}

function ExpiryCell({ date, alertDays }) {
  if (!date) return <span className="text-muted">—</span>;
  if (date < todayStr()) return <Badge tone="red">Expired</Badge>;
  const d = daysUntil(date);
  if (d != null && d <= alertDays) return <Badge tone="yellow">{formatDate(date)} · {d}d</Badge>;
  return <Badge tone="gray">{formatDate(date)}</Badge>;
}

export default function Inventory() {
  const [medicines, setMedicines] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [stats, setStats] = useState({ total: 0, low: 0, out: 0, expiring: 0 });
  const [lowThreshold, setLowThreshold] = useState(10);
  const [alertDays, setAlertDays] = useState(90);

  const [showForm, setShowForm] = useState(false);
  const [editMed, setEditMed] = useState(null);
  const [batchMedicine, setBatchMedicine] = useState(null);
  const [confirmDeleteMed, setConfirmDeleteMed] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const [csvMode, setCsvMode] = useState('import');

  const importRef = useRef(null);
  const updateRef = useRef(null);
  const showToast = useToast();

  // Debounce search input by 150ms for instant typing response
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 150);
    return () => clearTimeout(timer);
  }, [search]);

  // Load paginated data
  const loadData = useCallback(() => {
    setLoading(true);
    api.getMedicines({ page, limit: pageSize, search: debouncedSearch })
      .then((res) => {
        if (res && res.data) {
          setMedicines(res.data);
          setTotal(res.total || 0);
          setTotalPages(res.totalPages || 1);
        } else if (Array.isArray(res)) {
          setMedicines(res);
          setTotal(res.length);
          setTotalPages(Math.ceil(res.length / pageSize) || 1);
        }
      })
      .catch(() => showToast('Failed to load medicines', 'error'))
      .finally(() => setLoading(false));
  }, [page, pageSize, debouncedSearch, showToast]);

  // Load stats from lightweight SQLite aggregate query
  const loadStats = useCallback(() => {
    api.getMedicinesStats()
      .then((s) => {
        if (s) {
          setStats(s);
          if (s.lowThreshold) setLowThreshold(s.lowThreshold);
          if (s.alertDays) setAlertDays(s.alertDays);
        }
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    loadData();
    loadStats();
  }, [loadData, loadStats]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadStats(); }, [loadStats]);

  // Thresholds from Settings
  useEffect(() => {
    api.getSettings()
      .then((s) => {
        const low = parseInt(s?.low_stock_threshold, 10);
        const days = parseInt(s?.expiry_alert_days, 10);
        if (!isNaN(low)) setLowThreshold(low);
        if (!isNaN(days)) setAlertDays(days);
      })
      .catch(() => {});
  }, []);

  const openAdd = () => { setEditMed(null); setShowForm(true); };
  const openEdit = (m) => { setEditMed(m); setShowForm(true); };

  const handleDeleteMedicine = async () => {
    if (!confirmDeleteMed) return;
    setDeleting(true);
    try {
      await api.deleteMedicine(confirmDeleteMed.id);
      setConfirmDeleteMed(null);
      load();
      showToast('Medicine deleted');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadSample = async () => {
    try {
      const csv = await api.getMedicineSampleCSV();
      downloadCSV('sample_medicines_template.csv', csv);
      showToast('Sample template downloaded');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleExportCSV = async () => {
    try {
      showToast('Exporting medicines…');
      const csv = await api.exportMedicinesCSV();
      downloadCSV(exportFilename('medicines_inventory'), csv);
      showToast('Medicines exported successfully');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const text = await readFileAsText(file);
      const result = await api.importMedicinesCSV(text);
      setCsvMode('import');
      setCsvResult(result);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleCSVUpdate = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const text = await readFileAsText(file);
      const result = await api.updateMedicinesCSV(text);
      setCsvMode('update');
      setCsvResult(result);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const columns = [
    {
      header: 'Alias',
      render: (m) => (m.alias ? <Badge tone="blue">{m.alias}</Badge> : <span className="text-muted">—</span>),
    },
    {
      header: 'Brand Name',
      render: (m) => (
        <span style={{ fontWeight: 500 }}>
          {m.brand_name}
          {m.is_h1 === 1 && <Badge tone="red" style={{ marginLeft: 8, fontSize: 10 }}>H1</Badge>}
        </span>
      ),
    },
    { header: 'Company', render: (m) => <span className="text-secondary">{m.company_name || '—'}</span> },
    { header: 'Group', render: (m) => <span className="text-secondary">{m.drug_group || '—'}</span> },
    {
      header: 'Unit',
      render: (m) => (
        <>
          {m.unit_category}
          {TABLET_LIKE.includes(m.unit_category) && m.tablets_per_strip > 1 && (
            <Badge tone="gray" style={{ marginLeft: 6, fontSize: 10 }}>1×{m.tablets_per_strip}</Badge>
          )}
        </>
      ),
    },
    { header: 'GST', render: (m) => `${m.gst_percent}%` },
    { header: 'Stock', align: 'right', render: (m) => <StockCell stock={m.total_stock} lowThreshold={lowThreshold} /> },
    { header: 'Nearest Expiry', render: (m) => <ExpiryCell date={m.nearest_expiry} alertDays={alertDays} /> },
    {
      header: '',
      align: 'right',
      width: 190,
      render: (m) => (
        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" icon={Layers} onClick={() => setBatchMedicine(m)}>Batches</Button>
          <Button variant="ghost" size="sm" icon={Edit2} onClick={() => openEdit(m)} title="Edit medicine" />
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmDeleteMed(m)} title="Delete medicine" />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, alias, company…" width={300} />
        </div>
        <div className="toolbar-right">
          <Button variant="ghost" icon={FileSpreadsheet} onClick={handleDownloadSample} title="Download sample CSV template with all stock & rate fields">Sample Template</Button>
          <Button variant="secondary" icon={Download} onClick={handleExportCSV}>Export CSV</Button>
          <Button variant="secondary" icon={Upload} onClick={() => importRef.current?.click()}>Import CSV</Button>
          <Button variant="secondary" icon={RefreshCw} onClick={() => updateRef.current?.click()}>Update CSV</Button>
          <Button variant="primary" icon={Plus} onClick={openAdd}>Add Medicine</Button>
          <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
          <input ref={updateRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpdate} />
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Total Medicines" value={stats.total} accent="blue" icon={Package} />
        <StatCard label="Low Stock" value={stats.low} accent="amber" icon={AlertTriangle} />
        <StatCard label="Out of Stock" value={stats.out} accent="red" icon={PackageX} />
        <StatCard label={`Expiring ≤ ${alertDays}d`} value={stats.expiring} accent="purple" icon={CalendarClock} />
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <DataTable
          loading={loading}
          columns={columns}
          rows={medicines}
          pagination={{
            page,
            pageSize,
            total,
            totalPages,
            onPageChange: setPage,
            onPageSizeChange: (s) => { setPageSize(s); setPage(1); },
          }}
          empty={
            <EmptyState
              icon={Package}
              title="No medicines found"
              message={search ? 'No medicines match your search.' : 'Add your first medicine to start tracking stock.'}
              action={!search && <Button icon={Plus} onClick={openAdd}>Add Medicine</Button>}
            />
          }
        />
      </div>

      {uploading && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            background: 'var(--bg-card, #ffffff)',
            borderRadius: 14,
            padding: '24px 32px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            minWidth: 320,
          }}>
            <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Processing Medicines CSV</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Updating stock, rates, and batch details…</div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <MedicineModal
          medicine={editMed}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); load(); showToast('Medicine saved'); }}
        />
      )}

      {batchMedicine && (
        <BatchPanel medicine={batchMedicine} lowThreshold={lowThreshold} alertDays={alertDays} onClose={() => setBatchMedicine(null)} onUpdate={load} />
      )}

      {csvResult && (
        <ImportResultModal
          result={csvResult}
          entity="medicines"
          mode={csvMode}
          onClose={() => { setCsvResult(null); }}
        />
      )}

      {confirmDeleteMed && (
        <ConfirmDialog
          title="Delete medicine?"
          message={`This permanently deletes "${confirmDeleteMed.brand_name}" and all of its batches. This cannot be undone.`}
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDeleteMedicine}
          onClose={() => setConfirmDeleteMed(null)}
        />
      )}
    </div>
  );
}

function MedicineModal({ medicine, onClose, onSave }) {
  const [form, setForm] = useState(
    medicine || {
      alias: '', brand_name: '', generic_name: '', company_name: '', drug_group: '',
      unit_category: 'Tablet', hsn_code: '', gst_percent: 12, schedule: '', is_h1: 0, tablets_per_strip: 10,
    }
  );
  const [saving, setSaving] = useState(false);
  const showToast = useToast();
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.brand_name.trim()) return showToast('Brand name is required', 'error');
    setSaving(true);
    try {
      if (medicine?.id) await api.updateMedicine(medicine.id, form);
      else await api.createMedicine(form);
      onSave();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={medicine ? 'Edit Medicine' : 'Add Medicine'}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>Save</Button>
        </>
      }
    >
      <div className="form-row">
        <FormField label="Alias (short code)">
          <Input value={form.alias} onChange={(e) => set('alias', e.target.value)} placeholder="e.g. A1, B2" />
        </FormField>
        <FormField label="Brand Name" required>
          <Input value={form.brand_name} onChange={(e) => set('brand_name', e.target.value)} autoFocus />
        </FormField>
      </div>
      <div className="form-row">
        <FormField label="Generic Name">
          <Input value={form.generic_name} onChange={(e) => set('generic_name', e.target.value)} />
        </FormField>
        <FormField label="Company">
          <Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
        </FormField>
      </div>
      <div className="form-row">
        <FormField label="Drug Group">
          <Input value={form.drug_group} onChange={(e) => set('drug_group', e.target.value)} />
        </FormField>
        <FormField label="Unit Category">
          <Select value={form.unit_category} onChange={(e) => set('unit_category', e.target.value)}>
            {UNIT_CATEGORIES.map((u) => <option key={u}>{u}</option>)}
          </Select>
        </FormField>
      </div>
      <div className="form-row">
        <FormField label="GST %">
          <Select value={form.gst_percent} onChange={(e) => set('gst_percent', Number(e.target.value))}>
            {GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}
          </Select>
        </FormField>
        <FormField label="HSN Code">
          <Input value={form.hsn_code} onChange={(e) => set('hsn_code', e.target.value)} />
        </FormField>
        <FormField label="Schedule">
          <Input value={form.schedule} onChange={(e) => set('schedule', e.target.value)} placeholder="e.g. H, H1, X" />
        </FormField>
      </div>

      {TABLET_LIKE.includes(form.unit_category) && (
        <FormField label="Strip Packing" hint="Tablets per strip — the per-tablet price shown in billing is derived from this.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>1 ×</span>
            <Input
              type="number"
              style={{ width: 110 }}
              value={form.tablets_per_strip || 10}
              onChange={(e) => set('tablets_per_strip', parseInt(e.target.value) || 1)}
              min={1}
              max={100}
              placeholder="10"
            />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>tablets = 1 strip</span>
          </div>
        </FormField>
      )}

      <label className="flex items-center gap-2 cursor-pointer" style={{ marginTop: 4 }}>
        <input type="checkbox" checked={form.is_h1 === 1} onChange={(e) => set('is_h1', e.target.checked ? 1 : 0)} />
        <span className="form-label" style={{ marginBottom: 0 }}>Schedule H1 drug (requires H1 register details)</span>
      </label>
    </Modal>
  );
}

function BatchPanel({ medicine, lowThreshold, alertDays, onClose, onUpdate }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editBatch, setEditBatch] = useState(null);
  const [confirmDeleteBatch, setConfirmDeleteBatch] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const showToast = useToast();

  const loadBatches = useCallback(() => {
    setLoading(true);
    api.getBatches({ medicine_id: medicine.id })
      .then(setBatches)
      .catch(() => showToast('Failed to load batches', 'error'))
      .finally(() => setLoading(false));
  }, [medicine.id, showToast]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const handleDeleteBatch = async () => {
    if (!confirmDeleteBatch) return;
    setDeleting(true);
    try {
      await api.deleteBatch(confirmDeleteBatch.id);
      setConfirmDeleteBatch(null);
      loadBatches();
      onUpdate();
      showToast('Batch deleted');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { header: 'Batch #', render: (b) => <span style={{ fontWeight: 500 }}>{b.batch_number}</span> },
    { header: 'MFG', render: (b) => formatDate(b.mfg_date) },
    { header: 'Expiry', render: (b) => <ExpiryCell date={b.expiry_date} alertDays={alertDays} /> },
    { header: 'Purchase', align: 'right', render: (b) => `₹${b.purchase_rate}` },
    { header: 'Selling', align: 'right', render: (b) => `₹${b.selling_rate}` },
    { header: 'MRP', align: 'right', render: (b) => `₹${b.mrp}` },
    { header: 'Qty', align: 'right', render: (b) => <StockCell stock={b.quantity} lowThreshold={lowThreshold} /> },
    {
      header: '',
      align: 'right',
      width: 90,
      render: (b) => (
        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" icon={Edit2} onClick={() => { setEditBatch(b); setShowForm(true); }} title="Edit batch" />
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmDeleteBatch(b)} title="Delete batch" />
        </div>
      ),
    },
  ];

  return (
    <Modal title={`Batches — ${medicine.brand_name}`} wide onClose={onClose}>
      <div className="flex justify-between items-center mb-3">
        <span className="text-secondary text-sm">
          {batches.length} batch{batches.length === 1 ? '' : 'es'} · rates are per strip, quantity is in individual units
        </span>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => { setEditBatch(null); setShowForm(true); }}>Add Batch</Button>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <DataTable
          loading={loading}
          columns={columns}
          rows={batches}
          empty={<EmptyState icon={Layers} title="No batches yet" message="Add a batch to start tracking stock, pricing and expiry." height={140} />}
        />
      </div>

      {showForm && (
        <BatchForm
          batch={editBatch}
          medicineId={medicine.id}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); loadBatches(); onUpdate(); showToast('Batch saved'); }}
        />
      )}

      {confirmDeleteBatch && (
        <ConfirmDialog
          title="Delete batch?"
          message={`Delete batch "${confirmDeleteBatch.batch_number}"? Its remaining stock will be removed.`}
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDeleteBatch}
          onClose={() => setConfirmDeleteBatch(null)}
        />
      )}
    </Modal>
  );
}

// Batch pricing/expiry validation — hard errors block save, soft warnings inform.
function useBatchValidation(form) {
  const today = todayStr();
  const pr = parseFloat(form.purchase_rate);
  const sr = parseFloat(form.selling_rate);
  const mrp = parseFloat(form.mrp);
  const qty = parseInt(form.quantity);

  const errors = [];
  const warnings = [];

  if (!isNaN(sr) && !isNaN(pr) && sr < pr) errors.push(`Selling Rate (₹${sr}) cannot be less than Purchase Rate (₹${pr})`);
  if (!isNaN(mrp) && !isNaN(sr) && sr > mrp) errors.push(`Selling Rate (₹${sr}) cannot exceed MRP (₹${mrp})`);
  if (!isNaN(mrp) && !isNaN(pr) && pr > mrp) errors.push(`Purchase Rate (₹${pr}) cannot exceed MRP (₹${mrp})`);
  if (form.expiry_date && form.expiry_date <= today) errors.push('Expiry date must be a future date');
  if (form.mfg_date && form.expiry_date && form.mfg_date >= form.expiry_date) errors.push('MFG date must be before Expiry date');
  if (!isNaN(qty) && qty <= 0) errors.push('Quantity must be greater than 0');

  if (!isNaN(sr) && !isNaN(pr) && sr > 0 && pr > 0) {
    const margin = ((sr - pr) / pr) * 100;
    if (margin < 5) warnings.push(`Very low profit margin: ${margin.toFixed(1)}%`);
    if (margin > 60) warnings.push(`Unusually high margin: ${margin.toFixed(1)}% — double-check the rates`);
  }
  if (form.expiry_date) {
    const d = daysUntil(form.expiry_date);
    if (d != null && d > 0 && d < 90) warnings.push(`This batch expires in ${d} days — consider ordering less`);
  }

  const margin = (!isNaN(sr) && !isNaN(pr) && pr > 0) ? ((sr - pr) / pr) * 100 : null;
  const mrpDiscount = (!isNaN(sr) && !isNaN(mrp) && mrp > 0) ? ((mrp - sr) / mrp) * 100 : null;

  return {
    errors,
    warnings,
    margin: margin != null ? margin.toFixed(1) : null,
    mrpDiscount: mrpDiscount != null ? mrpDiscount.toFixed(1) : null,
    hasError: errors.length > 0,
  };
}

function BatchForm({ batch, medicineId, onClose, onSave }) {
  const [form, setForm] = useState(
    batch || { batch_number: '', mfg_date: '', expiry_date: '', purchase_rate: '', selling_rate: '', mrp: '', quantity: '' }
  );
  const [saving, setSaving] = useState(false);
  const showToast = useToast();
  const v = useBatchValidation(form);
  const set = (k, val) => setForm((p) => ({ ...p, [k]: val }));

  const errHas = (needle) => v.errors.some((e) => e.includes(needle));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.batch_number || !form.expiry_date) return showToast('Batch # and expiry are required', 'error');
    if (v.hasError) return showToast(v.errors[0], 'error');
    setSaving(true);
    try {
      if (batch?.id) await api.updateBatch(batch.id, form);
      else await api.createBatch({ ...form, medicine_id: medicineId });
      onSave();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{batch ? 'Edit Batch' : 'New Batch'}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <FormField label="Batch Number" required>
            <Input value={form.batch_number} onChange={(e) => set('batch_number', e.target.value)} />
          </FormField>
          <FormField label="MFG Date">
            <Input type="date" value={form.mfg_date} max={todayStr()} onChange={(e) => set('mfg_date', e.target.value)} />
          </FormField>
          <FormField
            label="Expiry Date"
            required
            error={form.mfg_date && form.expiry_date && form.mfg_date >= form.expiry_date ? 'MFG must be before expiry' : undefined}
          >
            <Input type="date" value={form.expiry_date} min={todayStr()} onChange={(e) => set('expiry_date', e.target.value)} />
          </FormField>
        </div>
        <div className="form-row">
          <FormField label="Purchase Rate (₹/strip)">
            <Input type="number" step="0.01" min="0" error={errHas('Purchase Rate')} value={form.purchase_rate} onChange={(e) => set('purchase_rate', e.target.value)} />
          </FormField>
          <FormField
            label={`Selling Rate (₹/strip)${v.margin != null ? ` · ${v.margin}% margin` : ''}`}
          >
            <Input type="number" step="0.01" min="0" error={errHas('Selling Rate')} value={form.selling_rate} onChange={(e) => set('selling_rate', e.target.value)} />
          </FormField>
          <FormField label={`MRP (₹/strip)${v.mrpDiscount != null ? ` · ${v.mrpDiscount}% off` : ''}`}>
            <Input type="number" step="0.01" min="0" error={errHas('MRP')} value={form.mrp} onChange={(e) => set('mrp', e.target.value)} />
          </FormField>
          <FormField label="Quantity (units)">
            <Input type="number" min="1" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </FormField>
        </div>

        {v.errors.length > 0 && (
          <div className="alert alert-red mb-2">
            {v.errors.map((err, i) => <div key={i} style={{ fontWeight: 500 }}>⛔ {err}</div>)}
          </div>
        )}
        {v.warnings.length > 0 && !v.hasError && (
          <div className="alert alert-yellow mb-2">
            {v.warnings.map((w, i) => <div key={i} style={{ fontWeight: 500 }}>⚠️ {w}</div>)}
          </div>
        )}

        <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" loading={saving} disabled={v.hasError}>
            {v.hasError ? 'Fix errors to save' : 'Save Batch'}
          </Button>
        </div>
      </form>
    </div>
  );
}
