import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { Filter, Trash2, Tag, Download, Archive } from 'lucide-react';
import Fuse from 'fuse.js';
import { formatDate, money, daysUntil, todayStr } from '../utils/format';
import {
  Button, Modal, DataTable, Badge, EmptyState, SearchInput, Select, FormField, Input, ConfirmDialog,
} from '../components/ui';

export default function NonMovingMedicines() {
  const showToast = useToast();
  const [medicines, setMedicines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [filters, setFilters] = useState({ days: 60, category: '', supplier_id: '' });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [discountModal, setDiscountModal] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [writingOff, setWritingOff] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    api.getNonMovingReport(filters)
      .then(setMedicines)
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [filters, showToast]);

  const loadDropdowns = useCallback(() => {
    api.getMedicineCategories().then(setCategories).catch(() => {});
    api.getSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  useEffect(() => { loadDropdowns(); }, [loadDropdowns]);
  useEffect(() => { loadData(); }, [loadData]);

  const fuse = useMemo(
    () => new Fuse(medicines, { keys: ['medicine_name', 'batch_number', 'supplier_name', 'category'], threshold: 0.3 }),
    [medicines]
  );

  const filteredMedicines = useMemo(() => {
    if (!search.trim()) return medicines;
    return fuse.search(search).map((r) => r.item);
  }, [search, medicines, fuse]);

  const doWriteOff = async () => {
    if (!confirmTarget) return;
    setWritingOff(true);
    try {
      await api.writeOffBatch(confirmTarget.batch_id);
      showToast(`Batch ${confirmTarget.batch_number} has been written off.`);
      setConfirmTarget(null);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setWritingOff(false);
    }
  };

  const exportCSV = () => {
    if (filteredMedicines.length === 0) return showToast('No data to export', 'error');

    const headers = ['Medicine Name', 'Category', 'Batch #', 'Supplier', 'Purchase Date', 'Last Sold Date', 'Expiry Date', 'MRP', 'Selling Rate', 'Stock'];
    const rows = filteredMedicines.map((m) => [
      `"${m.medicine_name}"`,
      `"${m.category || ''}"`,
      `"${m.batch_number}"`,
      `"${m.supplier_name || ''}"`,
      `"${m.purchase_date ? m.purchase_date.split(' ')[0] : '-'}"`,
      `"${m.last_sold_date ? m.last_sold_date.split(' ')[0] : 'Never'}"`,
      `"${m.expiry_date}"`,
      m.mrp,
      m.selling_rate,
      m.stock,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const fileName = `Non_Moving_Medicines_${todayStr()}.csv`;

    // Prefer a real save-to-Downloads when running inside Electron.
    if (window.require) {
      try {
        const fs = window.require('fs');
        const path = window.require('path');
        const os = window.require('os');
        const { shell } = window.require('electron');

        const filePath = path.join(os.homedir(), 'Downloads', fileName);
        fs.writeFileSync(filePath, csvContent);
        showToast(`CSV exported to Downloads folder: ${fileName}`, 'success');
        shell.showItemInFolder(filePath);
        return;
      } catch (e) {
        console.error('Electron save error', e);
        // Fall through to the browser download.
      }
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const columns = [
    { header: 'Medicine', render: (m) => <span style={{ fontWeight: 500 }}>{m.medicine_name}</span> },
    { header: 'Category', render: (m) => <span className="text-secondary">{m.category || '—'}</span> },
    { header: 'Batch #', render: (m) => <span className="text-secondary">{m.batch_number}</span> },
    {
      header: 'Last Sold',
      render: (m) =>
        m.last_sold_date
          ? <Badge tone="blue">{formatDate(m.last_sold_date)}</Badge>
          : <Badge tone="yellow">Never</Badge>,
    },
    {
      header: 'Expiry',
      render: (m) => <Badge tone={daysUntil(m.expiry_date) < 0 ? 'red' : 'green'}>{formatDate(m.expiry_date)}</Badge>,
    },
    { header: 'Stock', align: 'right', render: (m) => <Badge tone="yellow">{m.stock}</Badge> },
    { header: 'Supplier', render: (m) => <span className="text-secondary">{m.supplier_name || '—'}</span> },
    { header: 'Selling', align: 'right', render: (m) => money(m.selling_rate) },
    {
      header: 'Actions',
      align: 'right',
      width: 96,
      render: (m) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" icon={Tag} title="Adjust selling rate / apply discount" onClick={() => setDiscountModal(m)} />
          <Button variant="ghost" size="sm" icon={Trash2} title="Write off stock" onClick={() => setConfirmTarget(m)} style={{ color: 'var(--danger)' }} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search medicines, batches, suppliers…" />
        </div>

        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <Filter size={16} className="text-muted" />
          <Select value={filters.days} onChange={(e) => setFilters({ ...filters, days: Number(e.target.value) })}>
            <option value={30}>No sales in 30 days</option>
            <option value={60}>No sales in 60 days</option>
            <option value={90}>No sales in 90 days</option>
            <option value={120}>No sales in 120 days</option>
            <option value={180}>No sales in 180 days</option>
          </Select>
          <Select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={filters.supplier_id} onChange={(e) => setFilters({ ...filters, supplier_id: e.target.value })}>
            <option value="">All Suppliers</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Button variant="secondary" icon={Download} onClick={exportCSV}>Export CSV</Button>
        </div>
      </div>

      <div className="glass-card">
        <DataTable
          loading={loading}
          columns={columns}
          rows={filteredMedicines}
          rowKey={(m) => m.batch_id}
          empty={
            <EmptyState
              icon={Archive}
              title="No non-moving medicines"
              message="Nothing matches the selected period and filters — that's a good sign for stock rotation."
            />
          }
        />
      </div>

      {discountModal && (
        <DiscountModal
          medicine={discountModal}
          onClose={() => setDiscountModal(null)}
          onSaved={() => {
            setDiscountModal(null);
            loadData();
            showToast('Selling rate updated successfully.');
          }}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="Write off this stock?"
          message={`Set stock to 0 for batch ${confirmTarget.batch_number} of ${confirmTarget.medicine_name}? This cannot be undone.`}
          confirmLabel="Write Off"
          loading={writingOff}
          onConfirm={doWriteOff}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}

function DiscountModal({ medicine, onClose, onSaved }) {
  const showToast = useToast();
  const [sellingRate, setSellingRate] = useState(medicine.selling_rate);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sellingRate || parseFloat(sellingRate) <= 0) {
      return showToast('Please enter a valid selling rate', 'error');
    }
    setSaving(true);
    try {
      await api.discountBatch(medicine.batch_id, Number(sellingRate));
      onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const rate = parseFloat(sellingRate);
  const showDiscount = medicine.mrp > 0 && rate > 0;
  const discountPercent = showDiscount ? (((medicine.mrp - rate) / medicine.mrp) * 100).toFixed(1) : null;

  return (
    <Modal
      title="Apply Discount / Price Adjustment"
      onClose={onClose}
      onSubmit={handleSubmit}
      size={460}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>{saving ? 'Updating…' : 'Update Price'}</Button>
        </>
      }
    >
      <div
        style={{
          padding: 12, background: 'var(--primary-bg)', borderRadius: 'var(--radius-md)',
          fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16,
        }}
      >
        <div><strong>Medicine:</strong> {medicine.medicine_name}</div>
        <div><strong>Batch:</strong> {medicine.batch_number} (Stock: {medicine.stock})</div>
        <div><strong>MRP:</strong> {money(medicine.mrp)} · <strong>Current Selling:</strong> {money(medicine.selling_rate)}</div>
      </div>

      <FormField label="New Selling Rate (₹)" required>
        <Input type="number" step="0.01" min="0" value={sellingRate} onChange={(e) => setSellingRate(e.target.value)} autoFocus />
      </FormField>

      {showDiscount && (
        <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>
          Effective discount:{' '}
          <strong style={{ color: discountPercent > 0 ? 'var(--success)' : 'var(--danger)' }}>{discountPercent}%</strong> off MRP
        </div>
      )}
    </Modal>
  );
}
