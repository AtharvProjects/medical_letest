import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Search, Plus, Edit, Phone, Truck, FileText, Trash2, X } from 'lucide-react';

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', gst_number: '', dl_number: '' });

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const data = await api.get('/suppliers', { search });
      setSuppliers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/suppliers/${editing.id}`, formData);
      } else {
        await api.post('/suppliers', formData);
      }
      setShowModal(false);
      setEditing(null);
      setFormData({ name: '', phone: '', email: '', address: '', gst_number: '', dl_number: '' });
      fetchSuppliers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEdit = (sup) => {
    setEditing(sup);
    setFormData({ 
      name: sup.name, 
      phone: sup.phone, 
      email: sup.email, 
      address: sup.address, 
      gst_number: sup.gst_number,
      dl_number: sup.dl_number
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this supplier?')) return;
    try {
      await api.delete(`/suppliers/${id}`);
      fetchSuppliers();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <h2 className="section-title">Suppliers</h2>
          <div className="search-box">
            <Search />
            <input 
              type="text" 
              placeholder="Search suppliers..." 
              className="form-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => { setEditing(null); setFormData({ name: '', phone: '', email: '', address: '', gst_number: '', dl_number: '' }); setShowModal(true); }}>
            <Plus size={16} /> New Supplier
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>GST / DL</th>
              <th>Address</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="text-center">Loading...</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan="5" className="text-center">No suppliers found</td></tr>
            ) : (
              suppliers.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Truck size={16} className="text-muted" />
                      <span style={{ fontWeight: 500 }}>{s.name}</span>
                    </div>
                  </td>
                  <td>{s.phone}</td>
                  <td>
                    <div className="flex flex-col gap-1" style={{fontSize: '11px'}}>
                      {s.gst_number && <span>GST: {s.gst_number}</span>}
                      {s.dl_number && <span>DL: {s.dl_number}</span>}
                    </div>
                  </td>
                  <td>{s.address}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(s)}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{editing ? 'Edit Supplier' : 'Add Supplier'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Supplier Name *</label>
                  <input 
                    type="text" 
                    required 
                    className="form-input" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="form-row">
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
                    <label className="form-label">Email</label>
                    <input 
                      type="email" 
                      className="form-input" 
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">GST Number</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={formData.gst_number}
                      onChange={e => setFormData({...formData, gst_number: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Drug License No.</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={formData.dl_number}
                      onChange={e => setFormData({...formData, dl_number: e.target.value})}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <textarea 
                    className="form-textarea" 
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Supplier</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
