import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { Search, Filter, Trash2, Tag, Download, Archive, X } from 'lucide-react';
import Fuse from 'fuse.js';

export default function NonMovingMedicines() {
  const [medicines, setMedicines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  
  const [filters, setFilters] = useState({
    days: 60,
    category: '',
    supplier_id: ''
  });
  
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [discountModal, setDiscountModal] = useState(null);
  
  const showToast = useToast();

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

  useEffect(() => {
    loadDropdowns();
  }, [loadDropdowns]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const fuse = useMemo(() => new Fuse(medicines, {
    keys: ['medicine_name', 'batch_number', 'supplier_name', 'category'],
    threshold: 0.3,
  }), [medicines]);

  const filteredMedicines = useMemo(() => {
    if (!search.trim()) return medicines;
    return fuse.search(search).map(r => r.item);
  }, [search, medicines, fuse]);

  const handleWriteOff = async (batchId, batchNumber) => {
    if (!window.confirm(`Are you sure you want to write-off (set stock to 0) for batch ${batchNumber}? This action cannot be undone.`)) return;
    try {
      await api.writeOffBatch(batchId);
      showToast(`Batch ${batchNumber} has been written off successfully.`);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const exportCSV = () => {
    if (filteredMedicines.length === 0) return showToast('No data to export', 'error');

    const headers = ['Medicine Name', 'Category', 'Batch #', 'Supplier', 'Purchase Date', 'Last Sold Date', 'Expiry Date', 'MRP', 'Selling Rate', 'Stock'];
    const rows = filteredMedicines.map(m => [
      `"${m.medicine_name}"`,
      `"${m.category || ''}"`,
      `"${m.batch_number}"`,
      `"${m.supplier_name || ''}"`,
      `"${m.purchase_date ? m.purchase_date.split(' ')[0] : '-'}"`,
      `"${m.last_sold_date ? m.last_sold_date.split(' ')[0] : 'Never'}"`,
      `"${m.expiry_date}"`,
      m.mrp,
      m.selling_rate,
      m.stock
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const fileName = `Non_Moving_Medicines_${new Date().toISOString().split('T')[0]}.csv`;

    // Check if running in Electron
    if (window.require) {
      try {
        const fs = window.require('fs');
        const path = window.require('path');
        const os = window.require('os');
        const { shell } = window.require('electron');
        
        const homeDir = os.homedir();
        const downloadsPath = path.join(homeDir, 'Downloads');
        const filePath = path.join(downloadsPath, fileName);
        
        fs.writeFileSync(filePath, csvContent);
        showToast(`CSV exported to Downloads folder: ${fileName}`, 'success');
        shell.showItemInFolder(filePath);
        return;
      } catch (e) {
        console.error('Electron save error', e);
        // Fallback to browser download if Electron fails
      }
    }

    // Standard Browser Download approach
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName; // Use .download property for better compatibility
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  };

  return (
    <div>
      {/* Header and Filters */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div className="toolbar-left" style={{ flexWrap: 'wrap', gap: '12px', flex: 1 }}>
          <div className="search-box">
            <Search />
            <input 
              className="form-input" 
              placeholder="Search medicines, batches..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
          
          <div className="flex gap-2 items-center" style={{ marginLeft: 'auto' }}>
            <Filter size={18} className="text-secondary" />
            <select 
              className="form-select" 
              value={filters.days} 
              onChange={e => setFilters({...filters, days: Number(e.target.value)})}
            >
              <option value={30}>No sales in 30 days</option>
              <option value={60}>No sales in 60 days</option>
              <option value={90}>No sales in 90 days</option>
              <option value={120}>No sales in 120 days</option>
              <option value={180}>No sales in 180 days</option>
            </select>

            <select 
              className="form-select" 
              value={filters.category} 
              onChange={e => setFilters({...filters, category: e.target.value})}
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select 
              className="form-select" 
              value={filters.supplier_id} 
              onChange={e => setFilters({...filters, supplier_id: e.target.value})}
            >
              <option value="">All Suppliers</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        
        <div className="toolbar-right">
          <button className="btn btn-secondary" onClick={exportCSV}>
            <Download size={15}/> Export CSV
          </button>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="glass-card">
        {loading ? (
          <p className="text-muted text-center" style={{ padding: 40 }}>Loading data...</p>
        ) : filteredMedicines.length === 0 ? (
          <div className="empty-state">
            <Archive size={40}/>
            <p>No non-moving medicines found for the selected criteria.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Medicine Name</th>
                <th>Category</th>
                <th>Batch #</th>
                <th>Last Sold</th>
                <th>Expiry</th>
                <th>Stock</th>
                <th>Supplier</th>
                <th>Selling (₹)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMedicines.map(m => {
                // Ensure nice rendering formating
                const lastSoldRaw = m.last_sold_date ? m.last_sold_date.split(' ')[0] : 'Never';
                const isExpired = new Date(m.expiry_date) < new Date();
                
                return (
                  <tr key={m.batch_id}>
                    <td style={{ fontWeight: 500 }}>{m.medicine_name}</td>
                    <td className="text-secondary">{m.category || '-'}</td>
                    <td className="text-secondary">{m.batch_number}</td>
                    <td>
                      <span className={`badge ${lastSoldRaw === 'Never' ? 'badge-yellow' : 'badge-blue'}`}>
                        {lastSoldRaw}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${isExpired ? 'badge-red' : 'badge-green'}`}>
                        {m.expiry_date}
                      </span>
                    </td>
                    <td><span className="badge badge-yellow">{m.stock}</span></td>
                    <td className="text-secondary">{m.supplier_name || '-'}</td>
                    <td>{m.selling_rate}</td>
                    <td>
                      <div className="flex gap-2">
                        <button 
                          title="Apply Discount / Change Selling Rate"
                          className="btn btn-primary btn-sm" 
                          onClick={() => setDiscountModal(m)}
                        >
                          <Tag size={13}/>
                        </button>
                        <button 
                          title="Write-off Stock"
                          className="btn btn-danger btn-sm" 
                          onClick={() => handleWriteOff(m.batch_id, m.batch_number)}
                        >
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Discount Modal */}
      {discountModal && (
        <DiscountModal 
          medicine={discountModal} 
          onClose={() => setDiscountModal(null)} 
          onSave={() => {
            setDiscountModal(null);
            loadData();
            showToast('Selling rate updated successfully.');
          }} 
        />
      )}
    </div>
  );
}

function DiscountModal({ medicine, onClose, onSave }) {
  const [sellingRate, setSellingRate] = useState(medicine.selling_rate);
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sellingRate || parseFloat(sellingRate) <= 0) {
      return showToast('Please enter a valid selling rate', 'error');
    }
    setSaving(true);
    try {
      await api.discountBatch(medicine.batch_id, Number(sellingRate));
      onSave();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const discountPercent = ((medicine.mrp - sellingRate) / medicine.mrp * 100).toFixed(1);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Apply Discount / Price Adjust</h2>
          <button className="modal-close" onClick={onClose}><X size={18}/></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="mb-4" style={{ padding: 12, background: 'rgba(0,123,255,0.05)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
              <p><strong>Medicine:</strong> {medicine.medicine_name}</p>
              <p><strong>Batch:</strong> {medicine.batch_number} (Stock: {medicine.stock})</p>
              <p><strong>MRP:</strong> ₹{medicine.mrp} | <strong>Current Selling Rate:</strong> ₹{medicine.selling_rate}</p>
            </div>
            
            <div className="form-group">
              <label className="form-label">New Selling Rate (₹) *</label>
              <input 
                type="number" 
                step="0.01" 
                className="form-input" 
                value={sellingRate} 
                onChange={e => setSellingRate(e.target.value)} 
                autoFocus 
              />
            </div>

            {medicine.mrp > 0 && sellingRate > 0 && (
              <div className="text-secondary" style={{ fontSize: 13, marginTop: 8 }}>
                Effective Discount: <strong className={discountPercent > 0 ? 'text-green' : 'text-red'}>{discountPercent}%</strong> off MRP
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Updating...' : 'Update Price'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
