import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { Eye, Printer, FileText, Send, Trash2, Filter, Receipt } from 'lucide-react';
import { generateInvoicePDF, sendInvoiceViaWhatsApp } from '../services/pdf';
import { inr, money, formatDate } from '../utils/format';
import {
  Button, Modal, DataTable, Badge, EmptyState, SearchInput, FormField, Input, ConfirmDialog, Spinner,
} from '../components/ui';

// Date + time for the list (SQLite stores 'YYYY-MM-DD HH:MM:SS' in local time).
const fmtDateTime = (s) => {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d)
    ? String(s)
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const payTone = (mode) => (mode === 'Pending' ? 'red' : mode === 'UPI' ? 'purple' : 'green');

export default function Bills() {
  const showToast = useToast();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [settings, setSettings] = useState({});
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchInvoices();
    api.getSettings().then(setSettings).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateRange.from) params.from = dateRange.from;
      if (dateRange.to) params.to = dateRange.to;
      setInvoices(await api.getInvoices(params));
    } catch (err) {
      showToast('Failed to load invoices', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const s = search.toLowerCase();
    return invoices.filter((inv) =>
      inv.invoice_number.toLowerCase().includes(s) ||
      (inv.customer_name && inv.customer_name.toLowerCase().includes(s))
    );
  }, [search, invoices]);

  const handleViewDetails = async (id) => {
    try {
      setSelectedInvoice(await api.getInvoice(id));
    } catch (err) {
      showToast('Failed to load invoice details', 'error');
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteInvoice(confirmDelete.id);
      showToast('Bill deleted and stock restored');
      setConfirmDelete(null);
      fetchInvoices();
      window.dispatchEvent(new Event('invoice-saved')); // refresh dashboard stats
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handlePrint = (inv) => {
    api.getInvoice(inv.id)
      .then((full) => generateInvoicePDF(full, settings, 'print'))
      .catch(() => showToast('Failed to load invoice data', 'error'));
  };

  const handlePDF = (inv) => {
    api.getInvoice(inv.id)
      .then((full) => generateInvoicePDF(full, settings, 'download'))
      .catch(() => showToast('Failed to load invoice data', 'error'));
  };

  const handleWhatsApp = async (inv) => {
    setSendingWhatsApp(inv.id);
    try {
      const full = await api.getInvoice(inv.id);
      await sendInvoiceViaWhatsApp(full, settings);
      showToast('Invoice sent via WhatsApp successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to send WhatsApp message. Ensure WhatsApp is connected in Settings.', 'error');
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const hasFilter = dateRange.from || dateRange.to;

  const columns = [
    { header: 'Date', render: (inv) => <span className="text-sm">{fmtDateTime(inv.created_at)}</span> },
    { header: 'Invoice #', render: (inv) => <span style={{ fontWeight: 600 }}>{inv.invoice_number}</span> },
    {
      header: 'Customer',
      render: (inv) => (
        <div>
          {inv.customer_name || <span className="text-muted">Walk-in</span>}
          {inv.doctor_name && <div className="text-muted" style={{ fontSize: 11 }}>Dr. {inv.doctor_name}</div>}
        </div>
      ),
    },
    { header: 'Payment', render: (inv) => <Badge tone={payTone(inv.payment_mode)}>{inv.payment_mode}</Badge> },
    { header: 'Amount', align: 'right', render: (inv) => <span style={{ fontWeight: 600 }}>{inr(inv.total_amount)}</span> },
    {
      header: 'Actions',
      align: 'right',
      width: 190,
      render: (inv) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" icon={Eye} title="View details" onClick={() => handleViewDetails(inv.id)} />
          <Button variant="ghost" size="sm" icon={Printer} title="Print" onClick={() => handlePrint(inv)} />
          <Button variant="ghost" size="sm" icon={FileText} title="Download PDF" onClick={() => handlePDF(inv)} />
          <Button
            variant="ghost"
            size="sm"
            title={inv.customer_id ? 'Send via WhatsApp' : 'Walk-in invoices have no saved customer number'}
            onClick={() => handleWhatsApp(inv)}
            disabled={sendingWhatsApp === inv.id || !inv.customer_id}
            style={{ color: inv.customer_id ? 'var(--success)' : undefined }}
          >
            {sendingWhatsApp === inv.id ? <Spinner size={14} /> : <Send size={14} />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            title="Delete bill"
            onClick={() => setConfirmDelete(inv)}
            style={{ color: 'var(--danger)' }}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search invoice # or customer name…" />
        </div>
        <FormField label="From" style={{ margin: 0 }}>
          <Input type="date" value={dateRange.from} onChange={(e) => setDateRange((p) => ({ ...p, from: e.target.value }))} />
        </FormField>
        <FormField label="To" style={{ margin: 0 }}>
          <Input type="date" value={dateRange.to} onChange={(e) => setDateRange((p) => ({ ...p, to: e.target.value }))} />
        </FormField>
        <Button variant="primary" icon={Filter} onClick={fetchInvoices}>Filter</Button>
        {hasFilter && (
          <Button variant="secondary" onClick={() => { setDateRange({ from: '', to: '' }); setTimeout(fetchInvoices, 0); }}>
            Clear
          </Button>
        )}
      </div>

      <div className="glass-card">
        <DataTable
          loading={loading}
          columns={columns}
          rows={filteredInvoices}
          empty={
            <EmptyState
              icon={Receipt}
              title="No invoices found"
              message={search || hasFilter ? 'Try adjusting your search or date range.' : 'Bills you generate will appear here.'}
            />
          }
        />
      </div>

      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onPrint={() => handlePrint(selectedInvoice)}
          onPDF={() => handlePDF(selectedInvoice)}
          onWhatsApp={() => handleWhatsApp(selectedInvoice)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this bill?"
          message={`Delete invoice ${confirmDelete.invoice_number}? Stock will be restored and any customer credit reverted. This cannot be undone.`}
          confirmLabel="Delete Bill"
          loading={deleting}
          onConfirm={doDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function InfoCard({ label, primary, secondary }) {
  return (
    <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <div className="text-muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontWeight: 600 }}>{primary}</div>
      {secondary && <div className="text-muted" style={{ fontSize: 13 }}>{secondary}</div>}
    </div>
  );
}

function InvoiceDetailModal({ invoice, onClose, onPrint, onPDF, onWhatsApp }) {
  const itemColumns = [
    {
      header: 'Medicine',
      render: (it) => (
        <div>
          <div style={{ fontWeight: 500 }}>{it.brand_name}</div>
          <div className="text-muted" style={{ fontSize: 11 }}>{it.company_name}</div>
        </div>
      ),
    },
    { header: 'Batch', render: (it) => <span className="text-secondary">{it.batch_number}</span> },
    { header: 'Expiry', render: (it) => <span className="text-secondary">{formatDate(it.expiry_date)}</span> },
    { header: 'Qty', align: 'right', render: (it) => it.quantity },
    { header: 'Price', align: 'right', render: (it) => money(it.unit_price) },
    { header: 'Total', align: 'right', render: (it) => <span style={{ fontWeight: 600 }}>{money(it.total)}</span> },
  ];

  return (
    <Modal
      title="Invoice Details"
      onClose={onClose}
      size={820}
      footer={
        <>
          <Button variant="primary" icon={Printer} onClick={onPrint}>Print</Button>
          <Button variant="secondary" icon={FileText} onClick={onPDF}>PDF</Button>
          <Button
            variant="success"
            icon={Send}
            onClick={onWhatsApp}
            disabled={!invoice.customer_id}
            title={!invoice.customer_id ? 'Walk-in invoices have no saved customer phone number' : 'Send invoice via WhatsApp'}
          >
            WhatsApp
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </>
      }
    >
      <p className="text-muted text-sm" style={{ marginTop: -4, marginBottom: 14 }}>
        {invoice.invoice_number} · {fmtDateTime(invoice.created_at)}
      </p>

      <div className="two-col" style={{ marginBottom: 18 }}>
        <InfoCard label="Customer" primary={invoice.customer_name || 'Walk-in Customer'} secondary={invoice.customer_phone} />
        <InfoCard
          label="Doctor"
          primary={invoice.doctor_name ? `Dr. ${invoice.doctor_name}` : 'Self'}
          secondary={invoice.doctor_hospital}
        />
      </div>

      <DataTable columns={itemColumns} rows={invoice.items} rowKey={(_, i) => i} />

      <div className="flex justify-end" style={{ marginTop: 18 }}>
        <div style={{ width: 260 }}>
          <div className="flex justify-between" style={{ marginBottom: 4 }}>
            <span className="text-muted">Subtotal</span><span>{inr(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between" style={{ marginBottom: 4 }}>
            <span className="text-muted">GST</span><span>{inr(invoice.gst_amount)}</span>
          </div>
          {invoice.discount_amount > 0 && (
            <div className="flex justify-between" style={{ marginBottom: 4, color: 'var(--danger)' }}>
              <span>Discount</span><span>-{inr(invoice.discount_amount)}</span>
            </div>
          )}
          <div
            className="flex justify-between"
            style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 18, fontWeight: 700 }}
          >
            <span>Total</span><span>{inr(invoice.total_amount)}</span>
          </div>
          <div className="flex justify-end" style={{ marginTop: 6 }}>
            <Badge tone={payTone(invoice.payment_mode)}>{invoice.payment_mode} Payment</Badge>
          </div>
        </div>
      </div>
    </Modal>
  );
}
