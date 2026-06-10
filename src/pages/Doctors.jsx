import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Search, Plus, Edit, Phone, MapPin, Stethoscope, Trash2, X } from 'lucide-react';

export default function Doctors() {
  const [doctors, setDoctors] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ name: '', hospital: '', phone: '', address: '', specialization: '' });

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const data = await api.get('/doctors', { search });
      setDoctors(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/doctors/${editing.id}`, formData);
      } else {
        await api.post('/doctors', formData);
      }
      setShowModal(false);
      setEditing(null);
      setFormData({ name: '', hospital: '', phone: '', address: '', specialization: '' });
      fetchDoctors();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEdit = (doc) => {
    setEditing(doc);
    setFormData({ 
      name: doc.name, 
      hospital: doc.hospital, 
      phone: doc.phone, 
      address: doc.address, 
      specialization: doc.specialization 
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this doctor?')) return;
    try {
      await api.delete(`/doctors/${id}`);
      fetchDoctors();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-left">
          <h2 className="section-title">Doctors</h2>
          <div className="search-box">
            <Search />
            <input 
              type="text" 
              placeholder="Search doctors..." 
              className="form-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => { setEditing(null); setFormData({ name: '', hospital: '', phone: '', address: '', specialization: '' }); setShowModal(true); }}>
            <Plus size={16} /> New Doctor
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Hospital</th>
              <th>Specialization</th>
              <th>Phone</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="text-center">Loading...</td></tr>
            ) : doctors.length === 0 ? (
              <tr><td colSpan="5" className="text-center">No doctors found</td></tr>
            ) : (
              doctors.map(d => (
                <tr key={d.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Stethoscope size={16} className="text-muted" />
                      <span style={{ fontWeight: 500 }}>{d.name}</span>
                    </div>
                  </td>
                  <td>{d.hospital}</td>
                  <td>{d.specialization}</td>
                  <td>{d.phone}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(d)}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d.id)}>
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
              <h2>{editing ? 'Edit Doctor' : 'Add Doctor'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Doctor Name *</label>
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
                    <label className="form-label">Hospital / Clinic</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={formData.hospital}
                      onChange={e => setFormData({...formData, hospital: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Specialization</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={formData.specialization}
                      onChange={e => setFormData({...formData, specialization: e.target.value})}
                    />
                  </div>
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
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Doctor</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
