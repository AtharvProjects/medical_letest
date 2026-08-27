import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { Plus, Edit2, Trash2, Stethoscope, Upload, Download, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { downloadCSV, readFileAsText, exportFilename } from '../utils/csv';
import ImportResultModal from '../components/ImportResultModal';
import {
  Button, Modal, ConfirmDialog, DataTable, SearchInput, EmptyState,
  FormField, Input, Textarea,
} from '../components/ui';

const EMPTY = { name: '', hospital: '', phone: '', address: '', specialization: '' };

export default function Doctors() {
  const showToast = useToast();
  const [doctors, setDoctors] = useState([]);
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

  const fetchDoctors = useCallback(() => {
    setLoading(true);
    api.get('/doctors')
      .then(setDoctors)
      .catch(() => showToast('Failed to load doctors', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { fetchDoctors(); }, [fetchDoctors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter(
      (d) =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.hospital || '').toLowerCase().includes(q) ||
        (d.specialization || '').toLowerCase().includes(q) ||
        (d.phone || '').toLowerCase().includes(q)
    );
  }, [doctors, search]);

  const openNew = () => { setEditing(null); setFormData(EMPTY); setShowModal(true); };
  const openEdit = (d) => {
    setEditing(d);
    setFormData({
      name: d.name || '',
      hospital: d.hospital || '',
      phone: d.phone || '',
      address: d.address || '',
      specialization: d.specialization || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return showToast('Doctor name is required', 'error');
    setSaving(true);
    try {
      if (editing) await api.put(`/doctors/${editing.id}`, formData);
      else await api.post('/doctors', formData);
      showToast(editing ? 'Doctor updated' : 'Doctor added');
      setShowModal(false);
      setEditing(null);
      setFormData(EMPTY);
      fetchDoctors();
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
      await api.delete(`/doctors/${confirmTarget.id}`);
      showToast('Doctor deleted');
      setConfirmTarget(null);
      fetchDoctors();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ----------------------------- CSV handlers ------------------------------ */
  const handleDownloadSample = async () => {
    try {
      const csv = await api.getDoctorSampleCSV();
      downloadCSV('sample_doctors_template.csv', csv);
      showToast('Sample template downloaded');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleExportCSV = async () => {
    try {
      const csv = await api.exportDoctorsCSV();
      downloadCSV(exportFilename('doctors'), csv);
      showToast('Doctors exported successfully');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await readFileAsText(file);
      const result = await api.importDoctorsCSV(text);
      setCsvMode('import');
      setCsvResult(result);
      fetchDoctors();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleCSVUpdate = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await readFileAsText(file);
      const result = await api.updateDoctorsCSV(text);
      setCsvMode('update');
      setCsvResult(result);
      fetchDoctors();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const columns = [
    {
      header: 'Name',
      render: (d) => (
        <div className="flex items-center gap-2">
          <Stethoscope size={16} className="text-muted" />
          <span style={{ fontWeight: 500 }}>{d.name}</span>
        </div>
      ),
    },
    { header: 'Hospital / Clinic', render: (d) => d.hospital || <span className="text-muted">—</span> },
    { header: 'Specialization', render: (d) => d.specialization || <span className="text-muted">—</span> },
    { header: 'Phone', render: (d) => d.phone || <span className="text-muted">—</span> },
    {
      header: '',
      align: 'right',
      width: 110,
      render: (d) => (
        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" icon={Edit2} onClick={() => openEdit(d)} title="Edit doctor" />
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmTarget(d)} title="Delete doctor" />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, hospital, specialization…" width={320} />
        </div>
        <div className="toolbar-right">
          <Button variant="ghost" icon={FileSpreadsheet} onClick={handleDownloadSample} title="Download sample CSV template">Sample Template</Button>
          <Button variant="secondary" icon={Download} onClick={handleExportCSV}>Export CSV</Button>
          <Button variant="secondary" icon={Upload} onClick={() => csvImportRef.current?.click()}>Import CSV</Button>
          <Button variant="secondary" icon={RefreshCw} onClick={() => csvUpdateRef.current?.click()}>Update CSV</Button>
          <Button variant="primary" icon={Plus} onClick={openNew}>New Doctor</Button>
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
              icon={Stethoscope}
              title="No doctors found"
              message={search ? 'No doctors match your search.' : 'Add the prescribing doctors you work with to speed up billing.'}
              action={!search && <Button icon={Plus} onClick={openNew}>New Doctor</Button>}
            />
          }
        />
      </div>

      {showModal && (
        <Modal
          title={editing ? 'Edit Doctor' : 'Add Doctor'}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={saving}>{editing ? 'Save Changes' : 'Save Doctor'}</Button>
            </>
          }
        >
          <FormField label="Doctor Name" required>
            <Input autoFocus value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          </FormField>
          <div className="form-row">
            <FormField label="Hospital / Clinic">
              <Input value={formData.hospital} onChange={(e) => setFormData({ ...formData, hospital: e.target.value })} />
            </FormField>
            <FormField label="Specialization">
              <Input value={formData.specialization} onChange={(e) => setFormData({ ...formData, specialization: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Phone Number">
            <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          </FormField>
          <FormField label="Address">
            <Textarea rows={2} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
          </FormField>
        </Modal>
      )}

      {csvResult && (
        <ImportResultModal
          result={csvResult}
          entity="doctors"
          mode={csvMode}
          onClose={() => setCsvResult(null)}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="Delete doctor?"
          message={`Delete "${confirmTarget.name}"? This cannot be undone. Doctors linked to existing bills cannot be deleted.`}
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
