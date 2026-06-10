import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import { Search, Plus, Edit, Phone, MapPin, User, IndianRupee, Trash2, X, History, Eye, Printer, FileText, Send, RefreshCw } from 'lucide-react';
import Fuse from 'fuse.js';
import { generateInvoicePDF, sendInvoiceViaWhatsApp } from '../services/pdf';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedCust, setSelectedCust] = useState(null);
  const [historyDetails, setHistoryDetails] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', credit_balance: 0, last_payment_mode: 'Cash' });
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'credit', 'cash', 'upi'
  const [settings, setSettings] = useState({});
  const [sendingWhatsApp, setSendingWhatsApp] = useState(null);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/customers');
      setCustomers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
    api.get('/settings').then(setSettings).catch(console.error);
  }, [fetchCustomers]);

  const fuse = useMemo(() => new Fuse(customers, {
    keys: ['name', 'phone', 'address'],
    threshold: 0.3,
  }), [customers]);

  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (activeTab === 'credit') {
      list = customers.filter(c => c.credit_balance > 0);
    } else if (activeTab === 'cash') {
      list = customers.filter(c => c.last_payment_mode === 'Cash');
    } else if (activeTab === 'upi') {
      list = customers.filter(c => c.last_payment_mode === 'UPI');
    }
    
    if (!search.trim()) return list;
    const fuseInstance = new Fuse(list, {
      keys: ['name', 'phone', 'address'],
      threshold: 0.3,
    });
    return fuseInstance.search(search).map(r => r.item);
  }, [search, customers, activeTab]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/customers/${editing.id}`, formData);
      } else {
        await api.post('/customers', formData);
      }
        setShowModal(false);
        setEditing(null);
        setFormData({ name: '', phone: '', address: '', credit_balance: 0, last_payment_mode: 'Cash' });
        fetchCustomers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEdit = (customer) => {
    setEditing(customer);
    setFormData({ name: customer.name, phone: customer.phone, address: customer.address, credit_balance: customer.credit_balance, last_payment_mode: customer.last_payment_mode });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    try {
      await api.delete(`/customers/${id}`);
      fetchCustomers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handlePayCredit = async (e) => {
    e.preventDefault();
    if (!payAmount || isNaN(payAmount)) return;
    try {
      await api.post(`/customers/${selectedCust.id}/pay-credit`, { amount: parseFloat(payAmount) });
      setShowPayModal(false);
      setPayAmount('');
      fetchCustomers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleViewHistory = async (customer) => {
    try {
      setSelectedCust(customer);
      setHistoryDetails(null);
      setShowHistoryModal(true);
      const data = await api.get(`/customers/${customer.id}`);
      setHistoryDetails(data);
    } catch (err) {
      alert('Failed to load purchase history');
    }
  };

  const handlePrint = (invId) => {
    api.get(`/invoices/${invId}`).then(fullInv => {
      generateInvoicePDF(fullInv, settings, 'print');
    }).catch(() => alert('Failed to load invoice data'));
  };

  const handlePDF = (invId) => {
    api.get(`/invoices/${invId}`).then(fullInv => {
      generateInvoicePDF(fullInv, settings, 'download');
    }).catch(() => alert('Failed to load invoice data'));
  };

  const handleWhatsApp = async (invId, phone) => {
    if (!phone) {
      alert('No customer phone number available');
      return;
    }
    setSendingWhatsApp(invId);
    try {
      const fullInv = await api.get(`/invoices/${invId}`);
      await sendInvoiceViaWhatsApp(fullInv, settings);
      alert('Invoice sent via WhatsApp successfully!');
    } catch (err) {
      alert(err.message || 'Failed to send WhatsApp message');
    } finally {
      setSendingWhatsApp(null);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <h2 className="section-title">Customers</h2>
            <div className="flex gap-2 bg-glass p-1 rounded-lg mr-4">
              <button 
                className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('all')}
              >
                All
              </button>
              <button 
                className={`btn btn-sm ${activeTab === 'credit' ? 'btn-danger' : 'btn-ghost'}`}
                onClick={() => setActiveTab('credit')}
              >
                Pending ({customers.filter(c => c.credit_balance > 0).length})
              </button>
              <button 
                className={`btn btn-sm ${activeTab === 'cash' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('cash')}
                style={activeTab === 'cash' ? { backgroundColor: '#3b82f6' } : {}}
              >
                Cash
              </button>
              <button 
                className={`btn btn-sm ${activeTab === 'upi' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('upi')}
                style={activeTab === 'upi' ? { backgroundColor: '#8b5cf6' } : {}}
              >
                UPI
              </button>
            </div>
          <div className="search-box">
            <Search />
            <input 
              type="text" 
              placeholder="Search customers..." 
              className="form-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => { setEditing(null); setFormData({ name: '', phone: '', address: '' }); setShowModal(true); }}>
            <Plus size={16} /> New Customer
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Last Mode</th>
              <th>Credit Balance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="text-center">Loading...</td></tr>
            ) : filteredCustomers.length === 0 ? (
              <tr><td colSpan="6" className="text-center">No customers found</td></tr>
            ) : (
              filteredCustomers.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-muted" />
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                    </div>
                  </td>
                  <td>{c.phone}</td>
                  <td>{c.address}</td>
                  <td>
                    <span className={`badge ${c.last_payment_mode === 'UPI' ? 'badge-lavender' : 'badge-blue'}`}>
                      {c.last_payment_mode || 'Cash'}
                    </span>
                  </td>
                  <td>
                    {c.credit_balance > 0 ? (
                      <span className="badge badge-red">₹{c.credit_balance.toFixed(2)}</span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(c)} title="Edit Info">
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => handleViewHistory(c)} title="View History">
                        <History size={14} />
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)} title="Delete Customer">
                        <Trash2 size={14} />
                      </button>
                      {c.credit_balance > 0 && (
                        <button className="btn btn-success btn-sm" onClick={() => { setSelectedCust(c); setShowPayModal(true); }} title="Pay Credit">
                          <IndianRupee size={14} /> Pay
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showHistoryModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 900, width: '90%' }}>
            <div className="modal-header">
              <div>
                <h2 className="text-xl font-bold">Purchase History: {selectedCust?.name}</h2>
                <p className="text-muted text-sm">{selectedCust?.phone} | {selectedCust?.address}</p>
              </div>
              <button className="modal-close" onClick={() => setShowHistoryModal(false)}><X /></button>
            </div>
            <div className="modal-body">
              {!historyDetails ? (
                <div className="text-center py-10">
                  <RefreshCw className="animate-spin mb-2 mx-auto" />
                  <p>Loading records...</p>
                </div>
              ) : historyDetails.invoices.length === 0 ? (
                <div className="text-center py-10">
                  <History size={48} className="text-muted mb-4 mx-auto" opacity={0.3} />
                  <p className="text-muted">No previous purchase records found for this customer.</p>
                </div>
              ) : (
                <div className="glass-card" style={{ padding: 0 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoice #</th>
                        <th>Mode</th>
                        <th className="text-right">Amount</th>
                        <th className="text-center">Reprint Options</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyDetails.invoices.map(inv => (
                        <tr key={inv.id}>
                          <td>{new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td className="font-bold">{inv.invoice_number}</td>
                          <td>
                            <span className={`badge badge-${inv.payment_mode === 'Pending' ? 'red' : 'green'}`}>
                              {inv.payment_mode}
                            </span>
                          </td>
                          <td className="text-right font-bold">₹{inv.total_amount.toFixed(2)}</td>
                          <td>
                            <div className="flex justify-center gap-2">
                              <button className="btn btn-primary btn-sm" onClick={() => handlePrint(inv.id)} title="Print Bill">
                                <Printer size={14} />
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={() => handlePDF(inv.id)} title="Download PDF">
                                <FileText size={14} />
                              </button>
                              <button 
                                className="btn btn-success btn-sm" 
                                onClick={() => handleWhatsApp(inv.id, selectedCust?.phone)} 
                                disabled={sendingWhatsApp === inv.id}
                                title="Send to WhatsApp"
                              >
                                {sendingWhatsApp === inv.id ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <div className="flex justify-between items-center w-full">
                <div className="flex gap-4">
                  <div className="text-sm">
                    <span className="text-muted">Total Visits:</span> <b>{historyDetails?.invoices.length || 0}</b>
                  </div>
                  {selectedCust?.credit_balance > 0 && (
                    <div className="text-sm">
                      <span className="text-muted">Outstanding:</span> <b className="text-danger">₹{selectedCust.credit_balance.toFixed(2)}</b>
                    </div>
                  )}
                </div>
                <button className="btn btn-secondary" onClick={() => setShowHistoryModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{editing ? 'Edit Customer' : 'Add Customer'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X /></button>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="form-label">Customer Name *</label>
                    <input 
                      type="text" 
                      required 
                      className="form-input" 
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Address</label>
                    <textarea 
                      className="form-textarea" 
                      value={formData.address}
                      onChange={e => setFormData({...formData, address: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Outstanding Balance (Pending) ₹</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="form-input" 
                      value={formData.credit_balance}
                      onChange={e => setFormData({...formData, credit_balance: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPayModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Pay Credit: {selectedCust?.name}</h2>
              <button className="modal-close" onClick={() => setShowPayModal(false)}><X /></button>
            </div>
            <form onSubmit={handlePayCredit}>
              <div className="modal-body">
                <div className="glass-card mb-4 text-center" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <p className="text-muted text-sm">Outstanding Balance</p>
                  <h3 className="text-2xl font-bold text-danger">₹{selectedCust?.credit_balance.toFixed(2)}</h3>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Amount to Pay</label>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      step="0.01"
                      required 
                      className="form-input" 
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      autoFocus
                    />
                    <button 
                      type="button" 
                      className="btn btn-secondary whitespace-nowrap"
                      onClick={() => setPayAmount(selectedCust?.credit_balance.toString())}
                    >
                      All Covered
                    </button>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPayModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-success">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
