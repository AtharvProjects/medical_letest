import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { Search, Eye, Printer, FileText, Send, Trash2, Calendar, Filter, X, RefreshCw } from 'lucide-react';
import { generateInvoicePDF, sendInvoiceViaWhatsApp } from '../services/pdf';

export default function Bills() {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sendingWhatsApp, setSendingWhatsApp] = useState(null);

  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [settings, setSettings] = useState({});
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const showToast = useToast();

  useEffect(() => {
    fetchInvoices();
    api.getSettings().then(setSettings).catch(console.error);
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateRange.from) params.from = dateRange.from;
      if (dateRange.to) params.to = dateRange.to;
      const data = await api.getInvoices(params);
      setInvoices(data);
    } catch (err) {
      showToast('Failed to load invoices', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const s = search.toLowerCase();
    return invoices.filter(inv => 
      inv.invoice_number.toLowerCase().includes(s) || 
      (inv.customer_name && inv.customer_name.toLowerCase().includes(s))
    );
  }, [search, invoices]);

  const handleViewDetails = async (id) => {
    try {
      const fullInv = await api.getInvoice(id);
      setSelectedInvoice(fullInv);
      setShowDetailModal(true);
    } catch (err) {
      showToast('Failed to load invoice details', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this bill? Stock will be restored and customer credit will be reverted.')) return;
    try {
      await api.deleteInvoice(id);
      showToast('Bill deleted and stock restored');
      fetchInvoices();
      // Also refresh dashboard stats if visible elsewhere
      window.dispatchEvent(new Event('invoice-saved'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handlePrint = (inv) => {
    api.getInvoice(inv.id).then(fullInv => {
      generateInvoicePDF(fullInv, settings, 'print');
    }).catch(() => showToast('Failed to load invoice data', 'error'));
  };

  const handlePDF = (inv) => {
    api.getInvoice(inv.id).then(fullInv => {
      generateInvoicePDF(fullInv, settings, 'download');
    }).catch(() => showToast('Failed to load invoice data', 'error'));
  };

const handleWhatsApp = async (inv) => {
        setSendingWhatsApp(inv.id);
        try {
          const fullInv = await api.getInvoice(inv.id);
          await sendInvoiceViaWhatsApp(fullInv, settings);
          showToast('Invoice sent via WhatsApp successfully!', 'success');
        } catch (err) {
          console.error(err);
          showToast(err.message || 'Failed to send WhatsApp message. Ensure WhatsApp is connected in Settings.', 'error');
        } finally {
          setSendingWhatsApp(null);
        }
      };

  return (
    <div className="page-container">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="page-title">Manage Bills</h1>
          <p className="page-subtitle">View, print, and manage all generated invoices</p>
        </div>
      </div>

      <div className="glass-card mb-6">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="form-group mb-0" style={{ flex: 1, minWidth: 250 }}>
            <label className="form-label">Search Invoices</label>
            <div className="search-box">
              <Search size={18} />
              <input 
                className="form-input" 
                placeholder="Invoice # or Customer Name..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
            </div>
          </div>
          <div className="form-group mb-0">
            <label className="form-label">From Date</label>
            <input 
              type="date" 
              className="form-input" 
              value={dateRange.from} 
              onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))} 
            />
          </div>
          <div className="form-group mb-0">
            <label className="form-label">To Date</label>
            <input 
              type="date" 
              className="form-input" 
              value={dateRange.to} 
              onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))} 
            />
          </div>
          <button className="btn btn-primary" onClick={fetchInvoices}>
            <Filter size={18} /> Filter
          </button>
          {(dateRange.from || dateRange.to) && (
            <button className="btn btn-secondary" onClick={() => { setDateRange({ from: '', to: '' }); setTimeout(fetchInvoices, 0); }}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="glass-card">
        {loading ? (
          <div className="text-center py-10"><p>Loading invoices...</p></div>
        ) : filteredInvoices.length === 0 ? (
          <div className="empty-state">
            <Calendar size={48} className="mb-4 text-muted" />
            <p>No invoices found matching your criteria</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Payment</th>
                <th className="text-right">Amount</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => (
                <tr key={inv.id}>
                  <td>{new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ fontWeight: 600 }}>{inv.invoice_number}</td>
                  <td>
                    {inv.customer_name || <span className="text-muted">Walk-in</span>}
                    {inv.doctor_name && <div className="text-muted" style={{ fontSize: 11 }}>Dr. {inv.doctor_name}</div>}
                  </td>
                  <td>
                    <span className={`badge badge-${inv.payment_mode === 'Pending' ? 'red' : 'green'}`}>
                      {inv.payment_mode}
                    </span>
                  </td>
                  <td className="text-right" style={{ fontWeight: 600 }}>₹{inv.total_amount.toFixed(2)}</td>
                  <td>
                    <div className="flex justify-center gap-1">
                      <button className="btn btn-secondary btn-sm" title="View Details" onClick={() => handleViewDetails(inv.id)}>
                        <Eye size={14} />
                      </button>
                      <button className="btn btn-primary btn-sm" title="Print" onClick={() => handlePrint(inv)}>
                        <Printer size={14} />
                      </button>
                      <button className="btn btn-secondary btn-sm" title="PDF" onClick={() => handlePDF(inv)}>
                        <FileText size={14} />
                      </button>
<button 
                            className="btn btn-success btn-sm" 
                            title={inv.customer_name ? `WhatsApp: ${inv.customer_name}` : 'WhatsApp (Walk-in)'}
                            onClick={() => handleWhatsApp(inv)}
                            disabled={sendingWhatsApp === inv.id || !inv.customer_id}
                            style={!inv.customer_id ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                          >
                            {sendingWhatsApp === inv.id ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                          </button>

                      <button className="btn btn-danger btn-sm" title="Delete Bill" onClick={() => handleDelete(inv.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showDetailModal && selectedInvoice && (
        <InvoiceDetailModal 
          invoice={selectedInvoice} 
          onClose={() => setShowDetailModal(false)} 
          onPrint={() => handlePrint(selectedInvoice)}
          onPDF={() => handlePDF(selectedInvoice)}
          onWhatsApp={() => handleWhatsApp(selectedInvoice)}
        />
      )}
    </div>
  );
}

function InvoiceDetailModal({ invoice, onClose, onPrint, onPDF, onWhatsApp }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Invoice Details</h2>
            <p className="text-muted">{invoice.invoice_number} | {new Date(invoice.created_at).toLocaleString()}</p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="modal-body">
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="glass-card" style={{ padding: 12 }}>
              <div className="text-muted mb-1" style={{ fontSize: 11, textTransform: 'uppercase' }}>Customer Info</div>
              <div style={{ fontWeight: 600 }}>{invoice.customer_name || 'Walk-in Customer'}</div>
              {invoice.customer_phone && <div className="text-muted" style={{ fontSize: 13 }}>{invoice.customer_phone}</div>}
            </div>
            <div className="glass-card" style={{ padding: 12 }}>
              <div className="text-muted mb-1" style={{ fontSize: 11, textTransform: 'uppercase' }}>Doctor Info</div>
              <div style={{ fontWeight: 600 }}>{invoice.doctor_name ? `Dr. ${invoice.doctor_name}` : 'Self'}</div>
              {invoice.doctor_hospital && <div className="text-muted" style={{ fontSize: 13 }}>{invoice.doctor_hospital}</div>}
            </div>
          </div>

          <table className="data-table mb-6">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Price</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{item.brand_name}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>{item.company_name}</div>
                  </td>
                  <td>{item.batch_number}</td>
                  <td>{item.expiry_date}</td>
                  <td className="text-right">{item.quantity}</td>
                  <td className="text-right">₹{item.unit_price.toFixed(2)}</td>
                  <td className="text-right" style={{ fontWeight: 600 }}>₹{item.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div style={{ width: 250 }}>
              <div className="flex justify-between mb-1"><span className="text-muted">Subtotal</span><span>₹{invoice.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between mb-1"><span className="text-muted">GST</span><span>₹{invoice.gst_amount.toFixed(2)}</span></div>
              {invoice.discount_amount > 0 && <div className="flex justify-between mb-1 text-red-500"><span>Discount</span><span>-₹{invoice.discount_amount.toFixed(2)}</span></div>}
              <div className="flex justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.1)', fontSize: 18, fontWeight: 700 }}>
                <span>Total</span>
                <span>₹{invoice.total_amount.toFixed(2)}</span>
              </div>
              <div className="text-right mt-1">
                <span className={`badge badge-${invoice.payment_mode === 'Pending' ? 'red' : 'green'}`}>
                  {invoice.payment_mode} Payment
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <div className="flex gap-2 w-full">
            <button className="btn btn-primary" onClick={onPrint} style={{ flex: 1 }}><Printer size={18}/> Print</button>
            <button className="btn btn-secondary" onClick={onPDF} style={{ flex: 1 }}><FileText size={18}/> PDF</button>
            <button className="btn btn-success" onClick={onWhatsApp} style={{ flex: 1 }} disabled={!invoice.customer_id} title={!invoice.customer_id ? 'Walk-in invoices have no saved customer phone number' : 'Send invoice via WhatsApp'}><Send size={18}/> WhatsApp</button>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
