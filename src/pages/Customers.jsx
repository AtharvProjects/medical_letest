import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import {
  Plus, Edit2, Trash2, User, History, Printer, FileText, Send, IndianRupee,
  Users, Wallet, AlertCircle, Upload, Download, RefreshCw, FileSpreadsheet,
} from 'lucide-react';
import { generateInvoicePDF, sendInvoiceViaWhatsApp } from '../services/pdf';
import { downloadCSV, readFileAsText, exportFilename } from '../utils/csv';
import ImportResultModal from '../components/ImportResultModal';
import { money, formatDate } from '../utils/format';
import { INDIAN_STATES } from '../utils/states';
import {
  Button, Modal, ConfirmDialog, DataTable, SearchInput, EmptyState, Badge, StatCard,
  FormField, Input, Select, Textarea, Spinner,
} from '../components/ui';

const EMPTY = { name: '', phone: '', address: '', state: '', credit_balance: 0, last_payment_mode: 'Cash' };

const TABS = [
  { key: 'all', label: 'All', variant: 'primary' },
  { key: 'credit', label: 'Pending', variant: 'danger' },
  { key: 'cash', label: 'Cash', variant: 'primary' },
  { key: 'upi', label: 'UPI', variant: 'purple' },
];

export default function Customers() {
  const showToast = useToast();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [settings, setSettings] = useState({});

  // Add / edit
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // Delete
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Pay credit
  const [payCust, setPayCust] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  // Purchase history
  const [historyCust, setHistoryCust] = useState(null);
  const [historyDetails, setHistoryDetails] = useState(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(null);

  // CSV
  const [csvResult, setCsvResult] = useState(null);
  const [csvMode, setCsvMode] = useState('import');
  const csvImportRef = useRef(null);
  const csvUpdateRef = useRef(null);

  const fetchCustomers = useCallback(() => {
    setLoading(true);
    api.get('/customers')
      .then(setCustomers)
      .catch(() => showToast('Failed to load customers', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => {
    fetchCustomers();
    api.get('/settings').then(setSettings).catch(() => {});
  }, [fetchCustomers]);

  const counts = useMemo(() => ({
    all: customers.length,
    credit: customers.filter((c) => Number(c.credit_balance) > 0).length,
    cash: customers.filter((c) => (c.last_payment_mode || 'Cash') === 'Cash').length,
    upi: customers.filter((c) => c.last_payment_mode === 'UPI').length,
  }), [customers]);

  const stats = useMemo(() => {
    let outstanding = 0, pending = 0;
    for (const c of customers) {
      const bal = Number(c.credit_balance) || 0;
      if (bal > 0) { outstanding += bal; pending++; }
    }
    return { total: customers.length, pending, outstanding };
  }, [customers]);

  const filtered = useMemo(() => {
    let list = customers;
    if (activeTab === 'credit') list = list.filter((c) => Number(c.credit_balance) > 0);
    else if (activeTab === 'cash') list = list.filter((c) => (c.last_payment_mode || 'Cash') === 'Cash');
    else if (activeTab === 'upi') list = list.filter((c) => c.last_payment_mode === 'UPI');

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q)
    );
  }, [customers, activeTab, search]);

  /* ------------------------------ add / edit ------------------------------ */
  const openNew = () => { setEditing(null); setFormData(EMPTY); setShowModal(true); };
  const openEdit = (c) => {
    setEditing(c);
    setFormData({
      name: c.name || '',
      phone: c.phone || '',
      address: c.address || '',
      state: c.state || '',
      credit_balance: Number(c.credit_balance) || 0,
      last_payment_mode: c.last_payment_mode || 'Cash',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return showToast('Customer name is required', 'error');
    setSaving(true);
    try {
      if (editing) await api.put(`/customers/${editing.id}`, formData);
      else await api.post('/customers', formData);
      showToast(editing ? 'Customer updated' : 'Customer added');
      setShowModal(false);
      setEditing(null);
      setFormData(EMPTY);
      fetchCustomers();
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
      await api.delete(`/customers/${confirmTarget.id}`);
      showToast('Customer deleted');
      setConfirmTarget(null);
      fetchCustomers();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ------------------------------ pay credit ------------------------------ */
  const openPay = (c) => { setPayCust(c); setPayAmount(''); };
  const handlePayCredit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(payAmount);
    const balance = Number(payCust?.credit_balance) || 0;
    if (isNaN(amt) || amt <= 0) return showToast('Enter a valid amount', 'error');
    if (amt > balance + 0.001) return showToast('Amount exceeds outstanding balance', 'error');
    setPaying(true);
    try {
      await api.post(`/customers/${payCust.id}/pay-credit`, { amount: amt });
      showToast(`Payment of ${money(amt)} recorded`);
      setPayCust(null);
      setPayAmount('');
      fetchCustomers();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPaying(false);
    }
  };

  /* ---------------------------- purchase history --------------------------- */
  const openHistory = async (c) => {
    setHistoryCust(c);
    setHistoryDetails(null);
    try {
      const data = await api.get(`/customers/${c.id}`);
      setHistoryDetails(data);
    } catch (err) {
      showToast('Failed to load purchase history', 'error');
    }
  };

  const withInvoice = async (invId, fn, failMsg) => {
    try {
      const fullInv = await api.get(`/invoices/${invId}`);
      await fn(fullInv);
    } catch (err) {
      showToast(err.message || failMsg, 'error');
    }
  };
  const handlePrint = (invId) => withInvoice(invId, (inv) => generateInvoicePDF(inv, settings, 'print'), 'Failed to load invoice');
  const handlePDF = (invId) => withInvoice(invId, (inv) => generateInvoicePDF(inv, settings, 'download'), 'Failed to load invoice');
  const handleWhatsApp = async (invId, phone) => {
    if (!phone) return showToast('No customer phone number available', 'error');
    setSendingWhatsApp(invId);
    try {
      const fullInv = await api.get(`/invoices/${invId}`);
      await sendInvoiceViaWhatsApp(fullInv, settings);
      showToast('Invoice sent via WhatsApp');
    } catch (err) {
      showToast(err.message || 'Failed to send WhatsApp message', 'error');
    } finally {
      setSendingWhatsApp(null);
    }
  };

  /* ----------------------------- CSV handlers ------------------------------ */
  const handleDownloadSample = async () => {
    try {
      const csv = await api.getCustomerSampleCSV();
      downloadCSV('sample_customers_template.csv', csv);
      showToast('Sample template downloaded');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleExportCSV = async () => {
    try {
      const csv = await api.exportCustomersCSV();
      downloadCSV(exportFilename('customers'), csv);
      showToast('Customers exported successfully');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await readFileAsText(file);
      const result = await api.importCustomersCSV(text);
      setCsvMode('import');
      setCsvResult(result);
      fetchCustomers();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleCSVUpdate = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await readFileAsText(file);
      const result = await api.updateCustomersCSV(text);
      setCsvMode('update');
      setCsvResult(result);
      fetchCustomers();
    } catch (err) { showToast(err.message, 'error'); }
  };

  /* -------------------------------- columns -------------------------------- */
  const columns = [
    {
      header: 'Name',
      render: (c) => (
        <div className="flex items-center gap-2">
          <User size={16} className="text-muted" />
          <span style={{ fontWeight: 500 }}>{c.name}</span>
        </div>
      ),
    },
    { header: 'Phone', render: (c) => c.phone || <span className="text-muted">—</span> },
    { header: 'Address', render: (c) => c.address || <span className="text-muted">—</span> },
    { header: 'State', render: (c) => c.state || <span className="text-muted">—</span> },
    {
      header: 'Last Mode',
      render: (c) => <Badge tone={c.last_payment_mode === 'UPI' ? 'purple' : 'blue'}>{c.last_payment_mode || 'Cash'}</Badge>,
    },
    {
      header: 'Credit Balance',
      align: 'right',
      render: (c) => (Number(c.credit_balance) > 0 ? <Badge tone="red">{money(c.credit_balance)}</Badge> : <span className="text-muted">—</span>),
    },
    {
      header: '',
      align: 'right',
      width: 190,
      render: (c) => (
        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          {Number(c.credit_balance) > 0 && (
            <Button variant="success" size="sm" icon={IndianRupee} onClick={() => openPay(c)} title="Record credit payment">Pay</Button>
          )}
          <Button variant="ghost" size="sm" icon={History} onClick={() => openHistory(c)} title="Purchase history" />
          <Button variant="ghost" size="sm" icon={Edit2} onClick={() => openEdit(c)} title="Edit customer" />
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmTarget(c)} title="Delete customer" />
        </div>
      ),
    },
  ];

  const historyColumns = [
    { header: 'Date', render: (inv) => formatDate(inv.created_at) },
    { header: 'Invoice #', render: (inv) => <span style={{ fontWeight: 600 }}>{inv.invoice_number}</span> },
    { header: 'Mode', render: (inv) => <Badge tone={inv.payment_mode === 'Pending' ? 'red' : 'green'}>{inv.payment_mode}</Badge> },
    { header: 'Amount', align: 'right', render: (inv) => <span style={{ fontWeight: 600 }}>{money(inv.total_amount)}</span> },
    {
      header: 'Reprint',
      align: 'center',
      width: 140,
      render: (inv) => (
        <div className="flex gap-2" style={{ justifyContent: 'center' }}>
          <Button variant="ghost" size="sm" icon={Printer} onClick={() => handlePrint(inv.id)} title="Print bill" />
          <Button variant="ghost" size="sm" icon={FileText} onClick={() => handlePDF(inv.id)} title="Download PDF" />
          <Button
            variant="ghost"
            size="sm"
            icon={Send}
            loading={sendingWhatsApp === inv.id}
            onClick={() => handleWhatsApp(inv.id, historyCust?.phone)}
            title="Send to WhatsApp"
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left" style={{ gap: 12 }}>
          <div className="flex gap-1">
            {TABS.map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={activeTab === t.key ? t.variant : 'ghost'}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}{t.key !== 'cash' && t.key !== 'upi' ? ` (${counts[t.key]})` : ''}
              </Button>
            ))}
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone, address…" width={280} />
        </div>
        <div className="toolbar-right">
          <Button variant="ghost" icon={FileSpreadsheet} onClick={handleDownloadSample} title="Download sample CSV template">Sample Template</Button>
          <Button variant="secondary" icon={Download} onClick={handleExportCSV}>Export CSV</Button>
          <Button variant="secondary" icon={Upload} onClick={() => csvImportRef.current?.click()}>Import CSV</Button>
          <Button variant="secondary" icon={RefreshCw} onClick={() => csvUpdateRef.current?.click()}>Update CSV</Button>
          <Button variant="primary" icon={Plus} onClick={openNew}>New Customer</Button>
          <input ref={csvImportRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
          <input ref={csvUpdateRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpdate} />
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <StatCard label="Total Customers" value={stats.total} accent="blue" icon={Users} />
        <StatCard label="Pending Credit" value={stats.pending} accent="amber" icon={AlertCircle} sub={stats.pending ? 'customers with dues' : 'all clear'} />
        <StatCard label="Total Outstanding" value={money(stats.outstanding)} accent="red" icon={Wallet} />
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <DataTable
          loading={loading}
          columns={columns}
          rows={filtered}
          empty={
            <EmptyState
              icon={Users}
              title="No customers found"
              message={search || activeTab !== 'all' ? 'No customers match this filter.' : 'Add a customer to track credit (udhaari) and purchase history.'}
              action={!search && activeTab === 'all' && <Button icon={Plus} onClick={openNew}>New Customer</Button>}
            />
          }
        />
      </div>

      {/* Add / edit */}
      {showModal && (
        <Modal
          title={editing ? 'Edit Customer' : 'Add Customer'}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={saving}>{editing ? 'Save Changes' : 'Save Customer'}</Button>
            </>
          }
        >
          <FormField label="Customer Name" required>
            <Input autoFocus value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          </FormField>
          <div className="form-row">
            <FormField label="Phone Number">
              <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            </FormField>
            <FormField label="Outstanding Balance (₹)" hint="Opening / carried-forward dues">
              <Input
                type="number"
                step="0.01"
                value={formData.credit_balance}
                onChange={(e) => setFormData({ ...formData, credit_balance: parseFloat(e.target.value) || 0 })}
              />
            </FormField>
          </div>
          <FormField label="Address">
            <Textarea rows={2} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
          </FormField>
          <FormField label="State" hint="Determines CGST/SGST vs IGST on this customer's bills. Leave blank for local (same-state) customers.">
            <Select value={formData.state || ''} onChange={(e) => setFormData({ ...formData, state: e.target.value })}>
              <option value="">— Not specified —</option>
              {INDIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
            </Select>
          </FormField>
        </Modal>
      )}

      {/* Pay credit */}
      {payCust && (
        <Modal
          title={`Record Payment · ${payCust.name}`}
          onClose={() => setPayCust(null)}
          onSubmit={handlePayCredit}
          size={440}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPayCust(null)}>Cancel</Button>
              <Button type="submit" variant="success" loading={paying}>Record Payment</Button>
            </>
          }
        >
          <div
            className="glass-card mb-4"
            style={{ textAlign: 'center', background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}
          >
            <div className="text-muted text-xs" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Outstanding Balance</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--danger)' }}>{money(payCust.credit_balance)}</div>
          </div>
          <FormField label="Amount Received">
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                autoFocus
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
              />
              <Button variant="secondary" onClick={() => setPayAmount(String(Number(payCust.credit_balance) || 0))}>
                Full
              </Button>
            </div>
          </FormField>
        </Modal>
      )}

      {/* Purchase history */}
      {historyCust && (
        <Modal
          title={`Purchase History · ${historyCust.name}`}
          onClose={() => setHistoryCust(null)}
          wide
          footer={
            <div className="flex justify-between items-center" style={{ width: '100%' }}>
              <div className="flex gap-4 text-sm">
                <span><span className="text-muted">Total Visits:</span> <b>{historyDetails?.invoices.length || 0}</b></span>
                {Number(historyCust.credit_balance) > 0 && (
                  <span><span className="text-muted">Outstanding:</span> <b style={{ color: 'var(--danger)' }}>{money(historyCust.credit_balance)}</b></span>
                )}
              </div>
              <Button variant="secondary" onClick={() => setHistoryCust(null)}>Close</Button>
            </div>
          }
        >
          <div className="text-muted text-sm" style={{ marginBottom: 12 }}>
            {historyCust.phone || 'No phone'}{historyCust.address ? ` · ${historyCust.address}` : ''}
          </div>
          {!historyDetails ? (
            <div className="empty-state" style={{ height: 180 }}>
              <Spinner size={22} />
              <p>Loading records…</p>
            </div>
          ) : (
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              <DataTable
                columns={historyColumns}
                rows={historyDetails.invoices}
                empty={<EmptyState icon={History} title="No purchases yet" message="This customer has no billing history." height={160} />}
              />
            </div>
          )}
        </Modal>
      )}

      {csvResult && (
        <ImportResultModal
          result={csvResult}
          entity="customers"
          mode={csvMode}
          onClose={() => setCsvResult(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmTarget && (
        <ConfirmDialog
          title="Delete customer?"
          message={`Delete "${confirmTarget.name}"? This cannot be undone. Customers with existing invoices cannot be deleted.`}
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
