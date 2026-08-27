import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { Plus, Edit2, Trash2, Truck, Upload, Download, RefreshCw } from 'lucide-react';
import { downloadCSV, readFileAsText, exportFilename } from '../utils/csv';
import ImportResultModal from '../components/ImportResultModal';
import {
  Button, Modal, ConfirmDialog, DataTable, SearchInput, EmptyState,
  FormField, Input, Textarea,
} from '../components/ui';

const EMPTY = { name: '', phone: '', email: '', address: '', gst_number: '', dl_number: '' };

export default function Suppliers() {
  const showToast = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // CSV
  const [csvResult, setCsvResult] = useState(null);
  const [csvMode, setCsvMode] = useState('import');
  const csvImportRef = useRef(null);
  const csvUpdateRef = useRef(null);

  const fetchSuppliers = useCallback(() => {
    setLoading(true);
    api.get('/suppliers')
      .then(setSuppliers)
      .catch(() => showToast('Failed to load suppliers', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q) ||
        (s.gst_number || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  const openNew = () => { setEditing(null); setFormData(EMPTY); setShowModal(true); };
  const openEdit = (s) => {
    setEditing(s);
    setFormData({
      name: s.name || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      gst_number: s.gst_number || '',
      dl_number: s.dl_number || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return showToast('Supplier name is required', 'error');
    setSaving(true);
    try {
      if (editing) await api.put(`/suppliers/${editing.id}`, formData);
      else await api.post('/suppliers', formData);
      showToast(editing ? 'Supplier updated' : 'Supplier added');
      setShowModal(false);
      setEditing(null);
      setFormData(EMPTY);
      fetchSuppliers();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/suppliers/${confirmTarget.id}`);
      showToast('Supplier deleted');
      setConfirmTarget(null);
      fetchSuppliers();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ----------------------------- CSV handlers ------------------------------ */
  const handleExportCSV = async () => {
    try {
      const csv = await api.exportSuppliersCSV();
      downloadCSV(exportFilename('suppliers'), csv);
      showToast('Suppliers exported successfully');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await readFileAsText(file);
      const result = await api.importSuppliersCSV(text);
      setCsvMode('import');
      setCsvResult(result);
      fetchSuppliers();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleCSVUpdate = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await readFileAsText(file);
      const result = await api.updateSuppliersCSV(text);
      setCsvMode('update');
      setCsvResult(result);
      fetchSuppliers();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const columns = [
    {
      header: 'Name',
      render: (s) => (
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-muted" />
          <div>
            <div style={{ fontWeight: 500 }}>{s.name}</div>
            {s.email && <div className="text-muted text-xs">{s.email}</div>}
          </div>
        </div>
      ),
    },
    { header: 'Phone', render: (s) => s.phone || <span className="text-muted">—</span> },
    {
      header: 'GST / DL',
      render: (s) =>
        s.gst_number || s.dl_number ? (
          <div className="flex flex-col gap-1" style={{ fontSize: 11 }}>
            {s.gst_number && <span>GST: {s.gst_number}</span>}
            {s.dl_number && <span>DL: {s.dl_number}</span>}
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { header: 'Address', render: (s) => s.address || <span className="text-muted">—</span> },
    {
      header: '',
      align: 'right',
      width: 110,
      render: (s) => (
        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" icon={Edit2} onClick={() => openEdit(s)} title="Edit supplier" />
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmTarget(s)} title="Delete supplier" />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone, GST…" width={320} />
        </div>
        <div className="toolbar-right">
          <Button variant="secondary" icon={Download} onClick={handleExportCSV}>Export CSV</Button>
          <Button variant="secondary" icon={Upload} onClick={() => csvImportRef.current?.click()}>Import CSV</Button>
          <Button variant="secondary" icon={RefreshCw} onClick={() => csvUpdateRef.current?.click()}>Update CSV</Button>
          <Button variant="primary" icon={Plus} onClick={openNew}>New Supplier</Button>
          <input ref={csvImportRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
          <input ref={csvUpdateRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpdate} />
        </div>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <DataTable
          loading={loading}
          columns={columns}
          rows={filtered}
          empty={
            <EmptyState
              icon={Truck}
              title="No suppliers found"
              message={search ? 'No suppliers match your search.' : 'Add the distributors you buy stock from to track purchases and payments.'}
              action={!search && <Button icon={Plus} onClick={openNew}>New Supplier</Button>}
            />
          }
        />
      </div>

      {showModal && (
        <Modal
          title={editing ? 'Edit Supplier' : 'Add Supplier'}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={saving}>{editing ? 'Save Changes' : 'Save Supplier'}</Button>
            </>
          }
        >
          <FormField label="Supplier Name" required>
            <Input autoFocus value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          </FormField>
          <div className="form-row">
            <FormField label="Phone Number">
              <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            </FormField>
            <FormField label="Email">
              <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            </FormField>
          </div>
          <div className="form-row">
            <FormField label="GST Number">
              <Input value={formData.gst_number} onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })} />
            </FormField>
            <FormField label="Drug License No.">
              <Input value={formData.dl_number} onChange={(e) => setFormData({ ...formData, dl_number: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Address">
            <Textarea rows={2} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
          </FormField>
        </Modal>
      )}

      {csvResult && (
        <ImportResultModal
          result={csvResult}
          entity="suppliers"
          mode={csvMode}
          onClose={() => setCsvResult(null)}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="Delete supplier?"
          message={`Delete "${confirmTarget.name}"? This cannot be undone. Suppliers linked to purchases or batches cannot be deleted.`}
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
