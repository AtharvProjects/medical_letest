import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { Search, Plus, Edit2, Package, X, Trash2, Upload } from 'lucide-react';
import Fuse from 'fuse.js';

export default function Inventory() {
  const [medicines, setMedicines] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editMed, setEditMed] = useState(null);
  const [showBatch, setShowBatch] = useState(null);
  const [batchModal, setBatchModal] = useState(null);
  const showToast = useToast();

  const load = useCallback(() => {
    setLoading(true);
    api.getMedicines().then(setMedicines).catch(() => showToast('Failed to load', 'error')).finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const fuse = useMemo(() => new Fuse(medicines, {
    keys: ['alias', 'brand_name', 'generic_name', 'company_name', 'drug_group'],
    threshold: 0.3,
  }), [medicines]);

  const filteredMedicines = useMemo(() => {
    if (!search.trim()) return medicines;
    return fuse.search(search).map(r => r.item);
  }, [search, medicines, fuse]);

  const handleDeleteMedicine = async (id) => {
    if (!window.confirm('Are you sure you want to delete this medicine? This will also delete all its batches.')) return;
    try {
      await api.deleteMedicine(id);
      load();
      showToast('Medicine deleted');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rows = text.split('\n').filter(r => r.trim());
        const headers = rows[0].split(',').map(h => h.trim().toLowerCase().replace(/ /g, '_'));
        
        const meds = rows.slice(1).map(row => {
          const values = row.split(',').map(v => v.trim());
          const obj = {};
          headers.forEach((h, i) => obj[h] = values[i]);
          return {
            brand_name: obj.brand_name || obj.name,
            alias: obj.alias || '',
            generic_name: obj.generic_name || '',
            company_name: obj.company_name || obj.company || '',
            drug_group: obj.drug_group || obj.group || '',
            unit_category: obj.unit_category || obj.unit || 'Tablet',
            gst_percent: parseInt(obj.gst_percent || obj.gst) || 12,
            hsn_code: obj.hsn_code || '',
            tablets_per_strip: parseInt(obj.tablets_per_strip || obj.strip_qty) || 10,
            is_h1: obj.is_h1 === '1' || obj.is_h1 === 'true' ? 1 : 0
          };
        }).filter(m => m.brand_name);

        if (meds.length === 0) throw new Error('No valid medicines found in CSV');

        await api.post('/medicines/bulk', { medicines: meds });
        showToast(`Imported ${meds.length} medicines successfully`);
        load();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search />
            <input className="form-input" placeholder="Search medicines..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="toolbar-right flex gap-2">
          <label className="btn btn-secondary cursor-pointer">
            <Upload size={15}/> Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
          </label>
          <button className="btn btn-primary" onClick={() => { setEditMed(null); setShowAdd(true); }}><Plus size={15}/> Add Medicine</button>
        </div>
      </div>

      <div className="glass-card">
        {loading ? <p className="text-muted text-center">Loading...</p> : filteredMedicines.length === 0 ? (
          <div className="empty-state"><Package size={40}/><p>No medicines found. Add your first medicine.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Alias</th>
                <th>Brand Name</th>
                <th>Company</th>
                <th>Group</th>
                <th>Unit</th>
                <th>GST%</th>
                <th className="text-right">Stock</th>
                <th>Nearest Expiry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMedicines.map(m => {
                const lowStock = m.total_stock <= 10;
                const nearExpiry = m.nearest_expiry && new Date(m.nearest_expiry) < new Date(Date.now() + 90*24*60*60*1000);
                return (
                  <tr key={m.id}>
                    <td><span className="badge badge-blue">{m.alias || '-'}</span></td>
                    <td style={{ fontWeight: 500 }}>
                      {m.brand_name}
                      {m.is_h1 === 1 && <span className="badge badge-red" style={{ marginLeft: 8, fontSize: 10 }}>H1</span>}
                    </td>
                    <td className="text-secondary">{m.company_name}</td>
                    <td className="text-secondary">{m.drug_group}</td>
                    <td>
                      {m.unit_category}
                      {['Tablet','Capsule','Strip'].includes(m.unit_category) && m.tablets_per_strip > 1 && (
                        <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 10 }}>1×{m.tablets_per_strip}</span>
                      )}
                    </td>
                    <td>{m.gst_percent}%</td>
                    <td className="text-right">
                      <span className={`badge ${lowStock ? 'badge-red' : 'badge-green'}`}>{m.total_stock}</span>
                    </td>
                    <td>
                      {m.nearest_expiry ? <span className={`badge ${nearExpiry ? 'badge-yellow' : 'badge-blue'}`}>{m.nearest_expiry}</span> : '-'}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditMed(m); setShowAdd(true); }}><Edit2 size={13}/></button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteMedicine(m.id)}><Trash2 size={13}/></button>
                        <button className="btn btn-primary btn-sm" onClick={() => { setShowBatch(m); setBatchModal({ medicine_id: m.id }); }}>Batches</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <MedicineModal medicine={editMed} onClose={() => setShowAdd(false)} onSave={() => { setShowAdd(false); load(); showToast('Medicine saved'); }} />}
      {showBatch && <BatchPanel medicine={showBatch} onClose={() => setShowBatch(null)} onUpdate={load} />}
    </div>
  );
}

function MedicineModal({ medicine, onClose, onSave }) {
  const [form, setForm] = useState(medicine || { alias: '', brand_name: '', generic_name: '', company_name: '', drug_group: '', unit_category: 'Tablet', hsn_code: '', gst_percent: 12, schedule: '', is_h1: 0, tablets_per_strip: 10 });
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.brand_name.trim()) return showToast('Brand name required', 'error');
    setSaving(true);
    try {
      if (medicine?.id) await api.updateMedicine(medicine.id, form);
      else await api.createMedicine(form);
      onSave();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{medicine ? 'Edit Medicine' : 'Add Medicine'}</h2>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Alias (Short Code)</label>
                <input className="form-input" value={form.alias} onChange={e => set('alias', e.target.value)} placeholder="e.g. A1, B2" />
              </div>
              <div className="form-group">
                <label className="form-label">Brand Name *</label>
                <input className="form-input" value={form.brand_name} onChange={e => set('brand_name', e.target.value)} autoFocus />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Company</label>
                <input className="form-input" value={form.company_name} onChange={e => set('company_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Drug Group</label>
                <input className="form-input" value={form.drug_group} onChange={e => set('drug_group', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Unit Category</label>
                <select className="form-select" value={form.unit_category} onChange={e => set('unit_category', e.target.value)}>
                  {['Tablet','Capsule','Syrup','Injection','Cream','Ointment','Drops','Powder','Inhaler','Gel','Lotion','Spray','Suppository','Strip','Bottle','Tube','Sachet','Other'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">GST %</label>
                <select className="form-select" value={form.gst_percent} onChange={e => set('gst_percent', Number(e.target.value))}>
                  {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">HSN Code</label>
                <input className="form-input" value={form.hsn_code} onChange={e => set('hsn_code', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Schedule</label>
                <input className="form-input" value={form.schedule} onChange={e => set('schedule', e.target.value)} placeholder="e.g. H, H1, X" />
              </div>
            </div>
            {['Tablet','Capsule','Strip'].includes(form.unit_category) && (
              <div className="form-group" style={{ marginTop: 4 }}>
                <label className="form-label">Strip Packing <span className="text-muted" style={{ fontWeight: 400 }}>(Tablets per Strip)</span></label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>1 ×</span>
                  <input
                    type="number"
                    className="form-input"
                    style={{ width: 100 }}
                    value={form.tablets_per_strip || 10}
                    onChange={e => set('tablets_per_strip', parseInt(e.target.value) || 1)}
                    min={1}
                    max={100}
                    placeholder="10"
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>tablets = 1 strip. Per-tablet price shown in billing.</span>
                </div>
              </div>
            )}
            <div className="form-group" style={{ marginTop: 10 }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_h1 === 1} onChange={e => set('is_h1', e.target.checked ? 1 : 0)} />
                <span className="form-label" style={{ marginBottom: 0 }}>Schedule H1 Drug (Requires H1 Register Details)</span>
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BatchPanel({ medicine, onClose, onUpdate }) {
  const [batches, setBatches] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editBatch, setEditBatch] = useState(null);
  const showToast = useToast();

  const loadBatches = () => {
    api.getBatches({ medicine_id: medicine.id }).then(setBatches).catch(() => {});
  };

  useEffect(loadBatches, [medicine.id]);

  const handleDeleteBatch = async (id) => {
    if (!window.confirm('Are you sure you want to delete this batch?')) return;
    try {
      await api.deleteBatch(id);
      loadBatches();
      onUpdate();
      showToast('Batch deleted');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Batches - {medicine.brand_name}</h2>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="modal-body">
          <div className="flex justify-between items-center mb-4">
            <span className="text-secondary" style={{ fontSize: 13 }}>{batches.length} batch(es)</span>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditBatch(null); setShowForm(true); }}><Plus size={13}/> Add Batch</button>
          </div>
          {batches.length === 0 ? (
            <p className="text-muted text-center" style={{ padding: 24 }}>No batches. Add a batch to track stock.</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Batch #</th><th>MFG</th><th>Expiry</th><th>Purchase</th><th>Selling</th><th>MRP</th><th className="text-right">Qty</th><th>Actions</th></tr></thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 500 }}>{b.batch_number}</td>
                    <td>{b.mfg_date || '-'}</td>
                    <td><span className={`badge ${new Date(b.expiry_date) < new Date() ? 'badge-red' : 'badge-blue'}`}>{b.expiry_date}</span></td>
                    <td>₹{b.purchase_rate}</td>
                    <td>₹{b.selling_rate}</td>
                    <td>₹{b.mrp}</td>
                    <td className="text-right"><span className={`badge ${b.quantity <= 10 ? 'badge-red' : 'badge-green'}`}>{b.quantity}</span></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditBatch(b); setShowForm(true); }}><Edit2 size={13}/></button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteBatch(b.id)}><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {showForm && (
          <BatchForm 
            batch={editBatch} 
            medicineId={medicine.id} 
            onClose={() => setShowForm(false)} 
            onSave={() => { setShowForm(false); loadBatches(); onUpdate(); showToast('Batch saved'); }}
          />
        )}
      </div>
    </div>
  );
}

function useBatchValidation(form) {
  const today = new Date().toISOString().slice(0, 10);
  const pr = parseFloat(form.purchase_rate);
  const sr = parseFloat(form.selling_rate);
  const mrp = parseFloat(form.mrp);
  const qty = parseInt(form.quantity);

  const errors = [];
  const warnings = [];

  // Hard errors — block save
  if (!isNaN(sr) && !isNaN(pr) && sr < pr)
    errors.push(`Selling Rate (₹${sr}) cannot be less than Purchase Rate (₹${pr})`);
  if (!isNaN(mrp) && !isNaN(sr) && sr > mrp)
    errors.push(`Selling Rate (₹${sr}) cannot exceed MRP (₹${mrp})`);
  if (!isNaN(mrp) && !isNaN(pr) && pr > mrp)
    errors.push(`Purchase Rate (₹${pr}) cannot exceed MRP (₹${mrp})`);
  if (form.expiry_date && form.expiry_date <= today)
    errors.push('Expiry date must be a future date');
  if (form.mfg_date && form.expiry_date && form.mfg_date >= form.expiry_date)
    errors.push('MFG date must be before Expiry date');
  if (!isNaN(qty) && qty <= 0)
    errors.push('Quantity must be greater than 0');

  // Soft warnings — allow save but notify
  if (!isNaN(sr) && !isNaN(pr) && sr > 0 && pr > 0) {
    const margin = ((sr - pr) / pr) * 100;
    if (margin < 5)  warnings.push(`Very low profit margin: ${margin.toFixed(1)}%`);
    if (margin > 60) warnings.push(`Unusually high margin: ${margin.toFixed(1)}% — double-check rates`);
  }
  if (form.expiry_date) {
    const daysToExpiry = Math.floor((new Date(form.expiry_date) - new Date()) / 86400000);
    if (daysToExpiry > 0 && daysToExpiry < 90)
      warnings.push(`This batch expires in ${daysToExpiry} days — consider ordering less`);
  }

  // Computed info
  const margin = (!isNaN(sr) && !isNaN(pr) && pr > 0) ? ((sr - pr) / pr * 100).toFixed(1) : null;
  const mrpDiscount = (!isNaN(sr) && !isNaN(mrp) && mrp > 0) ? ((mrp - sr) / mrp * 100).toFixed(1) : null;

  return { errors, warnings, margin, mrpDiscount, hasError: errors.length > 0 };
}

function BatchForm({ batch, medicineId, onClose, onSave }) {
  const [form, setForm] = useState(batch || { batch_number: '', mfg_date: '', expiry_date: '', purchase_rate: '', selling_rate: '', mrp: '', quantity: '' });
  const [saving, setSaving] = useState(false);
  const showToast = useToast();
  const validation = useBatchValidation(form);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.batch_number || !form.expiry_date) return showToast('Batch # and expiry are required', 'error');
    if (validation.hasError) return showToast(validation.errors[0], 'error');
    setSaving(true);
    try {
      if (batch?.id) await api.updateBatch(batch.id, form);
      else await api.createBatch({ ...form, medicine_id: medicineId });
      onSave();
    } catch (err) { showToast(err.message, 'error'); }
    setSaving(false);
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: '16px 24px' }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{batch ? 'Edit Batch' : 'New Batch'}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Batch Number *</label><input className="form-input" value={form.batch_number} onChange={e => set('batch_number', e.target.value)} /></div>
          <div className="form-group">
            <label className="form-label">MFG Date</label>
            <input type="date" className="form-input" value={form.mfg_date} max={new Date().toISOString().slice(0,10)} onChange={e => set('mfg_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Expiry Date *</label>
            <input type="date" className="form-input" value={form.expiry_date} min={new Date().toISOString().slice(0,10)} onChange={e => set('expiry_date', e.target.value)} />
            {form.mfg_date && form.expiry_date && form.mfg_date >= form.expiry_date && (
              <div style={{ fontSize: 10, color: 'var(--accent-rose)', marginTop: 3 }}>MFG must be before expiry</div>
            )}
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Purchase Rate (₹)</label>
            <input type="number" step="0.01" min="0" className={`form-input${validation.errors.some(e => e.includes('Purchase Rate')) ? ' input-error' : ''}`} value={form.purchase_rate} onChange={e => set('purchase_rate', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Selling Rate (₹) {validation.margin && <span style={{ fontSize: 10, fontWeight: 400, color: parseFloat(validation.margin) < 5 ? 'var(--accent-rose)' : 'var(--accent-green)' }}>({validation.margin}% margin)</span>}</label>
            <input type="number" step="0.01" min="0" className={`form-input${validation.errors.some(e => e.includes('Selling Rate')) ? ' input-error' : ''}`} value={form.selling_rate} onChange={e => set('selling_rate', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">MRP (₹) {validation.mrpDiscount && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>({validation.mrpDiscount}% off MRP)</span>}</label>
            <input type="number" step="0.01" min="0" className={`form-input${validation.errors.some(e => e.includes('MRP')) ? ' input-error' : ''}`} value={form.mrp} onChange={e => set('mrp', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Quantity</label>
            <input type="number" min="1" className="form-input" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
          </div>
        </div>

        {/* Validation messages */}
        {validation.errors.length > 0 && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
            {validation.errors.map((err, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--accent-rose)', fontWeight: 500 }}>⛔ {err}</div>
            ))}
          </div>
        )}
        {validation.warnings.length > 0 && !validation.hasError && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
            {validation.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 12, color: '#b45309', fontWeight: 500 }}>⚠️ {w}</div>
            ))}
          </div>
        )}

        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || validation.hasError}>
            {saving ? 'Saving...' : validation.hasError ? 'Fix Errors to Save' : 'Save Batch'}
          </button>
        </div>
      </form>
    </div>
  );
}
