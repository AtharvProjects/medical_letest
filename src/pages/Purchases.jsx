import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Search, Plus, Eye, Calendar, User, Package, CreditCard, Edit2, Trash2 } from 'lucide-react';

export default function Purchases() {
  const [view, setView] = useState('list'); // list, create, detail
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Create state
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [batches, setBatches] = useState([]);
  const [searchMed, setSearchMed] = useState('');
  const [medResults, setMedResults] = useState([]);
  
  const [formData, setFormData] = useState({
    supplier_id: '',
    invoice_number: '',
    purchase_date: new Date().toISOString().slice(0, 10),
    notes: '',
    amount_paid: '',
    payment_mode: 'Cash',
    payment_notes: ''
  });
  
  const [items, setItems] = useState([]);
  const [currentItem, setCurrentItem] = useState({
    medicine_id: '',
    medicine_name: '',
    batch_number: '',
    expiry_date: '',
    mfg_date: '',
    quantity: '',
    pack_count: '',
    purchase_rate: '',
    selling_rate: '',
    mrp: '',
    unit_category: '',
    tablets_per_strip: 10
  });

  const [selectedPurchase, setSelectedPurchase] = useState(null);

  useEffect(() => {
    if (view === 'list') fetchPurchases();
    if (view === 'create') {
      fetchSuppliers();
      fetchMedicines();
      fetchBatches();
    }
  }, [view]);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const data = await api.get('/purchases');
      setPurchases(data);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    const data = await api.get('/suppliers');
    setSuppliers(data);
  };

  const fetchMedicines = async () => {
    const data = await api.get('/medicines');
    setMedicines(data);
  };

  const fetchBatches = async () => {
    const data = await api.get('/batches');
    setBatches(data);
  };

  const handleSearchMed = (query) => {
    setSearchMed(query);
    if (!query) {
      setMedResults([]);
      return;
    }
    const lower = query.toLowerCase();
    
    // Find matching medicines
    const matchingMeds = medicines.filter(m => 
      m.brand_name.toLowerCase().includes(lower) || 
      (m.generic_name && m.generic_name.toLowerCase().includes(lower))
    );

    // Build combined options
    let options = [];
    matchingMeds.forEach(m => {
      // Find batches for this medicine
      const medBatches = batches.filter(b => b.medicine_id === m.id);
      
      // Add each batch as an option
      medBatches.forEach(b => {
        options.push({
          type: 'batch',
          unique_id: `batch_${b.id}`,
          medicine_id: m.id,
          brand_name: m.brand_name,
          company_name: m.company_name,
          batch_number: b.batch_number,
          quantity: b.quantity,
          gst_percent: m.gst_percent,
          expiry_date: b.expiry_date,
          mrp: b.mrp,
          selling_rate: b.selling_rate,
          purchase_rate: b.purchase_rate,
          unit_category: m.unit_category,
          tablets_per_strip: m.tablets_per_strip
        });
      });
      
      // Always add a base option for New Batch
      options.push({
        type: 'medicine',
        unique_id: `med_${m.id}`,
        medicine_id: m.id,
        brand_name: m.brand_name,
        company_name: m.company_name,
        gst_percent: m.gst_percent,
        unit_category: m.unit_category,
        tablets_per_strip: m.tablets_per_strip
      });
    });

    setMedResults(options.slice(0, 15));
  };

  const selectMedicine = (item) => {
    if (item.type === 'batch') {
      setCurrentItem({
        ...currentItem,
        medicine_id: item.medicine_id,
        medicine_name: item.brand_name,
        batch_number: item.batch_number || '',
        gst_percent: item.gst_percent,
        expiry_date: item.expiry_date || '',
        mrp: item.mrp || '',
        selling_rate: item.selling_rate || '',
        purchase_rate: item.purchase_rate || '',
        unit_category: item.unit_category || 'Tablet',
        tablets_per_strip: item.tablets_per_strip || 10,
        pack_count: ''
      });
    } else {
      setCurrentItem({
        ...currentItem,
        medicine_id: item.medicine_id,
        medicine_name: item.brand_name,
        batch_number: '',
        gst_percent: item.gst_percent,
        expiry_date: '',
        mrp: '',
        selling_rate: '',
        purchase_rate: '',
        unit_category: item.unit_category || 'Tablet',
        tablets_per_strip: item.tablets_per_strip || 10,
        pack_count: ''
      });
    }
    setSearchMed(item.brand_name);
    setMedResults([]);
  };

  const addItem = () => {
    if (!currentItem.medicine_id || !currentItem.batch_number || !currentItem.quantity || !currentItem.expiry_date) {
      alert('Please fill all required fields: Medicine, Batch No, Expiry Date and Quantity');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const sell = parseFloat(currentItem.selling_rate);
    const purch = parseFloat(currentItem.purchase_rate);
    const mrp = parseFloat(currentItem.mrp);
    const qty = parseInt(currentItem.quantity);

    // Hard errors
    if (!isNaN(sell) && !isNaN(purch) && sell < purch) {
      alert(`❌ Selling Rate (₹${sell}) cannot be less than Purchase Rate (₹${purch})`);
      return;
    }
    if (!isNaN(sell) && !isNaN(mrp) && sell > mrp) {
      alert(`❌ Selling Rate (₹${sell}) cannot exceed MRP (₹${mrp})`);
      return;
    }
    if (!isNaN(purch) && !isNaN(mrp) && purch > mrp) {
      alert(`❌ Purchase Rate (₹${purch}) cannot exceed MRP (₹${mrp})`);
      return;
    }
    if (currentItem.expiry_date <= today) {
      alert('❌ Expiry date must be a future date — expired stock cannot be purchased');
      return;
    }
    if (currentItem.mfg_date && currentItem.mfg_date >= currentItem.expiry_date) {
      alert('❌ MFG date must be before Expiry date');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      alert('❌ Quantity must be a positive number');
      return;
    }

    setItems([...items, { ...currentItem, id: Date.now() }]);
    setCurrentItem({
      medicine_id: '',
      medicine_name: '',
      batch_number: '',
      expiry_date: '',
      mfg_date: '',
      quantity: '',
      pack_count: '',
      purchase_rate: '',
      selling_rate: '',
      mrp: '',
      unit_category: '',
      tablets_per_strip: 10
    });
    setSearchMed('');
  };

  const removeItem = (id) => {
    setItems(items.filter(i => i.id !== id));
  };

  const editItem = (item) => {
    setCurrentItem({ ...item });
    setSearchMed(item.medicine_name);
    removeItem(item.id);
  };

  const handleSubmit = async () => {
    if (!formData.supplier_id) {
      alert('Please select a supplier');
      return;
    }
    if (items.length === 0) {
      alert('Please add at least one item');
      return;
    }
    const totalAmt = items.reduce((sum, i) => sum + (i.quantity * i.purchase_rate), 0);
    const paid = parseFloat(formData.amount_paid) || 0;
    if (paid > totalAmt) {
      alert(`❌ Amount Paying (₹${paid.toFixed(2)}) cannot exceed Invoice Total (₹${totalAmt.toFixed(2)})`);
      return;
    }
    if (items.some(i => !i.medicine_id)) {
      alert('❌ Error: One or more items in the list do not have a valid medicine ID. Please remove and re-add them.');
      return;
    }
    if (paid < 0) {
      alert('❌ Amount paid cannot be negative');
      return;
    }

    try {
      const payload = {
        ...formData,
        amount_paid: parseFloat(formData.amount_paid) || 0,
        items: items.map(i => ({
          medicine_id: i.medicine_id,
          batch_id: i.batch_id, // Required for edits
          batch_number: i.batch_number,
          expiry_date: i.expiry_date,
          mfg_date: i.mfg_date,
          quantity: parseInt(i.quantity),
          purchase_rate: parseFloat(i.purchase_rate),
          selling_rate: parseFloat(i.selling_rate),
          mrp: parseFloat(i.mrp)
        }))
      };

      if (formData.id) {
        await api.put(`/purchases/${formData.id}`, payload);
      } else {
        await api.post('/purchases', payload);
      }
      setView('list');
      setItems([]);
      setFormData({
        supplier_id: '',
        invoice_number: '',
        purchase_date: new Date().toISOString().slice(0, 10),
        notes: '',
        amount_paid: '',
        payment_mode: 'Cash',
        payment_notes: ''
      });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditPurchase = () => {
    setFormData({
      id: selectedPurchase.id,
      supplier_id: selectedPurchase.supplier_id,
      invoice_number: selectedPurchase.invoice_number || '',
      purchase_date: selectedPurchase.purchase_date || new Date().toISOString().slice(0, 10),
      notes: selectedPurchase.notes || '',
      amount_paid: selectedPurchase.amount_paid || '',
      payment_mode: 'Cash',
      payment_notes: ''
    });
    setItems(selectedPurchase.items.map(item => ({
      id: Date.now() + Math.random(),
      medicine_id: item.medicine_id,
      medicine_name: item.brand_name,
      batch_id: item.batch_id,
      batch_number: item.batch_number,
      expiry_date: item.expiry_date,
      mfg_date: item.mfg_date || '',
      quantity: item.quantity,
      purchase_rate: item.purchase_rate,
      selling_rate: item.selling_rate,
      mrp: item.mrp,
      unit_category: item.unit_category || 'Tablet',
      tablets_per_strip: item.tablets_per_strip || 10,
      pack_count: ''
    })));
    fetchSuppliers();
    fetchMedicines();
    fetchBatches();
    setView('create');
  };

  const viewDetail = async (id) => {
    try {
      const data = await api.get(`/purchases/${id}`);
      setSelectedPurchase(data);
      setView('detail');
    } catch (err) {
      console.error(err);
    }
  };

  if (view === 'create') {
    const today = new Date().toISOString().slice(0, 10);
    const sell = parseFloat(currentItem.selling_rate);
    const purch = parseFloat(currentItem.purchase_rate);
    const mrp = parseFloat(currentItem.mrp);

    const isSellLessThanPurchase = !isNaN(sell) && !isNaN(purch) && sell < purch;
    const isSellGreaterThanMrp   = !isNaN(sell) && !isNaN(mrp)  && sell > mrp;
    const isPurchGreaterThanMrp  = !isNaN(purch) && !isNaN(mrp) && purch > mrp;
    const isExpiryInPast = currentItem.expiry_date && currentItem.expiry_date <= today;
    const isMfgAfterExpiry = currentItem.mfg_date && currentItem.expiry_date && currentItem.mfg_date >= currentItem.expiry_date;
    const hasHardError = isSellLessThanPurchase || isSellGreaterThanMrp || isPurchGreaterThanMrp || isExpiryInPast || isMfgAfterExpiry;

    const profitMargin = (!isNaN(sell) && !isNaN(purch) && purch > 0) ? ((sell - purch) / purch * 100).toFixed(1) : null;
    const mrpDiscount  = (!isNaN(sell) && !isNaN(mrp)  && mrp  > 0) ? ((mrp - sell) / mrp * 100).toFixed(1) : null;
    const totalAmt = items.reduce((sum, i) => sum + (i.quantity * parseFloat(i.purchase_rate || 0)), 0);
    const amtPaid = parseFloat(formData.amount_paid) || 0;
    const amtPaidExceedsTotal = amtPaid > totalAmt && totalAmt > 0;
    const daysToExpiry = currentItem.expiry_date ? Math.floor((new Date(currentItem.expiry_date) - new Date()) / 86400000) : null;
    const nearExpiry = daysToExpiry !== null && daysToExpiry > 0 && daysToExpiry < 90;

    const isTabletLike = ['Tablet', 'Capsule', 'Strip'].includes(currentItem.unit_category);
    const tps = currentItem.tablets_per_strip || 10;

    return (
      <div className="pb-8">
        <div className="toolbar">
          <button className="btn btn-secondary" onClick={() => {
            setView('list');
            setFormData({...formData, id: undefined}); // clear id on cancel
          }}>← Back</button>
          <h2 className="section-title mb-0">{formData.id ? `Edit Purchase #${formData.id}` : 'New Purchase Entry'}</h2>
          <div className="flex-1"></div>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {formData.id ? 'Save Changes' : 'Save Purchase'}
          </button>
        </div>

        <div className="glass-card mb-4">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Supplier *</label>
              <select 
                className="form-select"
                value={formData.supplier_id}
                onChange={e => setFormData({...formData, supplier_id: e.target.value})}
              >
                <option value="">Select Supplier</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Invoice Number</label>
              <input 
                type="text" 
                className="form-input"
                value={formData.invoice_number}
                onChange={e => setFormData({...formData, invoice_number: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Purchase Date</label>
              <input 
                type="date" 
                className="form-input"
                value={formData.purchase_date}
                onChange={e => setFormData({...formData, purchase_date: e.target.value})}
              />
            </div>
          </div>
        </div>

        <div className="two-col mb-4">
          <div className="glass-card">
            <h3 className="text-sm font-semibold mb-3">Add Item</h3>
            <div className="form-group relative">
              <label className="form-label">Medicine Search *</label>
              <input 
                type="text" 
                className="form-input"
                placeholder="Type medicine name..."
                value={searchMed}
                onChange={e => handleSearchMed(e.target.value)}
              />
              {medResults.length > 0 && (
                <div className="autocomplete-dropdown">
                  {medResults.map(m => (
                    <div key={m.unique_id} className="autocomplete-item" onClick={() => selectMedicine(m)}>
                      <div className="font-medium">
                        {m.brand_name} <span className="text-muted font-normal">| {m.company_name}</span>
                      </div>
                      <div className="item-subtitle" style={{ color: m.type === 'batch' ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {m.type === 'batch' 
                          ? `Batch: ${m.batch_number} | Stock: ${m.quantity}` 
                          : '+ New Batch'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Batch No *</label>
                <input 
                  type="text" className="form-input"
                  value={currentItem.batch_number}
                  onChange={e => setCurrentItem({...currentItem, batch_number: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label className="form-label">MFG Date</label>
                <input 
                  type="date" className="form-input"
                  value={currentItem.mfg_date}
                  max={today}
                  onChange={e => setCurrentItem({...currentItem, mfg_date: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Expiry Date *</label>
                <input 
                  type="date" className={`form-input ${isExpiryInPast ? 'input-error' : ''}`}
                  value={currentItem.expiry_date}
                  min={today}
                  onChange={e => setCurrentItem({...currentItem, expiry_date: e.target.value})}
                />
                {isExpiryInPast && <div style={{ fontSize: 10, color: 'var(--accent-rose)', marginTop: 2 }}>Must be a future date</div>}
                {nearExpiry && !isExpiryInPast && <div style={{ fontSize: 10, color: '#b45309', marginTop: 2 }}>⚠️ Expires in {daysToExpiry} days</div>}
                {isMfgAfterExpiry && <div style={{ fontSize: 10, color: 'var(--accent-rose)', marginTop: 2 }}>MFG must be before expiry</div>}
              </div>
            </div>

            <div className="form-row">
              {isTabletLike && (
                <div className="form-group">
                  <label className="form-label">
                    Pack (Strips) <span className="text-muted" style={{textTransform: 'none'}}>(1×{tps})</span>
                  </label>
                  <input 
                    type="number" className="form-input" min="1"
                    value={currentItem.pack_count}
                    placeholder="E.g. 5 strips"
                    onChange={e => {
                      const pack = parseInt(e.target.value) || '';
                      setCurrentItem({
                        ...currentItem, 
                        pack_count: pack,
                        quantity: pack ? pack * tps : ''
                      });
                    }}
                  />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Quantity {isTabletLike && <span style={{textTransform: 'none'}}>(Total Tabs)</span>} *</label>
                <input 
                  type="number" className="form-input" min="1"
                  value={currentItem.quantity}
                  onChange={e => {
                    const qty = parseInt(e.target.value) || '';
                    setCurrentItem({
                      ...currentItem, 
                      quantity: qty,
                      pack_count: isTabletLike && qty > 0 ? (qty / tps).toFixed(1).replace(/\.0$/, '') : ''
                    });
                  }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Purchase Rate {isTabletLike ? <span style={{textTransform: 'none'}}>(per strip)</span> : '(₹)'}</label>
                <input 
                  type="number" className={`form-input ${isPurchGreaterThanMrp ? 'input-error' : ''}`}
                  value={currentItem.purchase_rate}
                  onChange={e => setCurrentItem({...currentItem, purchase_rate: e.target.value})}
                />
                {isPurchGreaterThanMrp && <div style={{ fontSize: 10, color: 'var(--accent-rose)', marginTop: 2 }}>Cannot exceed MRP (₹{mrp})</div>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">MRP (₹)</label>
                <input 
                  type="number" className="form-input"
                  value={currentItem.mrp}
                  onChange={e => setCurrentItem({...currentItem, mrp: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Selling Rate (₹)
                  {profitMargin !== null && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 6, color: parseFloat(profitMargin) < 5 ? 'var(--accent-rose)' : 'var(--accent-green)' }}>{profitMargin}% margin</span>}
                  {mrpDiscount !== null && !isSellGreaterThanMrp && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4, color: 'var(--text-secondary)' }}>| {mrpDiscount}% off MRP</span>}
                </label>
                <input 
                  type="number" 
                  className={`form-input ${isSellLessThanPurchase || isSellGreaterThanMrp ? 'input-error' : ''}`}
                  value={currentItem.selling_rate}
                  onChange={e => setCurrentItem({...currentItem, selling_rate: e.target.value})}
                />
                {isSellLessThanPurchase && <div style={{ fontSize: 10, color: 'var(--accent-rose)', marginTop: 2 }}>Cannot be less than Purchase Rate (₹{purch})</div>}
                {isSellGreaterThanMrp && !isSellLessThanPurchase && <div style={{ fontSize: 10, color: 'var(--accent-rose)', marginTop: 2 }}>Cannot exceed MRP (₹{mrp})</div>}
              </div>
            </div>

            <button 
              className="btn btn-secondary w-full" 
              onClick={addItem}
              disabled={hasHardError}
            >
              {hasHardError ? '❌ Fix Errors to Add' : '+ Add to List'}
            </button>
          </div>

          <div className="glass-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="p-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold">Items ({items.length})</h3>
            </div>
            <div className="overflow-y-auto flex-1 p-0">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Batch</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const isTab = ['Tablet', 'Capsule', 'Strip'].includes(item.unit_category);
                    const strips = isTab ? Math.floor(item.quantity / item.tablets_per_strip) : 0;
                    const tabs = isTab ? (item.quantity % item.tablets_per_strip) : 0;
                    const qtyStr = isTab ? `${strips > 0 ? strips + 's ' : ''}${tabs > 0 ? tabs + 't' : ''}` : item.quantity;
                    
                    return (
                    <tr key={item.id}>
                      <td>{item.medicine_name}</td>
                      <td>{item.batch_number}</td>
                      <td>{qtyStr}</td>
                      <td>₹{(item.quantity * item.purchase_rate).toFixed(2)}</td>
                      <td>
                        <div className="flex gap-2 justify-end">
                          <button 
                            className="text-blue-500 hover:text-blue-700 p-1" 
                            onClick={() => editItem(item)}
                            title="Edit item"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            className="text-red-500 hover:text-red-700 p-1" 
                            onClick={() => removeItem(item.id)}
                            title="Remove item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr><td colSpan="5" className="text-center py-8 text-muted">No items added yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-gray-50 border-t border-gray-100 text-right font-bold">
              Total: ₹{items.reduce((sum, i) => sum + (i.quantity * i.purchase_rate), 0).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Payment Section */}
        <div className="glass-card mb-4" style={{ background: 'var(--surface)' }}>
          <div style={{ paddingBottom: 12, marginBottom:16, borderBottom: '1px solid rgba(0,0,0,0.05)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={16} color="var(--primary)" /> Payment Details (Optional)
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Total Amount</label>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>₹{items.reduce((sum, i) => sum + (i.quantity * i.purchase_rate), 0).toFixed(2)}</div>
            </div>
            <div className="form-group">
              <label className="form-label">Payment Mode</label>
              <select 
                className="form-select"
                value={formData.payment_mode}
                onChange={e => setFormData({...formData, payment_mode: e.target.value})}
              >
                <option>Cash</option>
                <option>UPI</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Amount Paying Now</label>
              <input 
                type="number" 
                className={`form-input ${amtPaidExceedsTotal ? 'input-error' : ''}`}
                placeholder="0.00"
                value={formData.amount_paid}
                onChange={e => setFormData({...formData, amount_paid: e.target.value})}
              />
              {amtPaidExceedsTotal && (
                <div style={{ fontSize: 11, color: 'var(--accent-rose)', marginTop: 3, fontWeight: 500 }}>
                  Amount paid cannot exceed invoice total (₹{totalAmt.toFixed(2)})
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Remaining Balance</label>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-rose)' }}>
                ₹{(items.reduce((sum, i) => sum + (i.quantity * i.purchase_rate), 0) - (parseFloat(formData.amount_paid) || 0)).toFixed(2)}
              </div>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Note / Reference (Optional)</label>
              <input 
                type="text" 
                className="form-input"
                placeholder="Transaction ID, Cheque No, etc."
                value={formData.payment_notes}
                onChange={e => setFormData({...formData, payment_notes: e.target.value})}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Payment Date</label>
              <input 
                type="date" 
                className="form-input"
                value={formData.purchase_date}
                readOnly
                style={{ background: 'var(--surface)', cursor: 'default' }}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button className="btn btn-secondary" onClick={() => setView('list')}>Cancel</button>
          <button 
            className="btn btn-primary" 
            style={{ padding: '12px 40px' }} 
            onClick={handleSubmit}
            disabled={amtPaidExceedsTotal}
          >
            {amtPaidExceedsTotal ? '❌ Fix Amount Paid' : 'Save Purchase & Payment'}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'detail' && selectedPurchase) {
    return (
      <div>
        <div className="toolbar">
          <div className="toolbar-left">
            <button className="btn btn-secondary" onClick={() => setView('list')}>← Back</button>
            <h2 className="section-title mb-0">Purchase Details #{selectedPurchase.id}</h2>
          </div>
          <button className="btn btn-primary" onClick={handleEditPurchase}>
            <Eye size={16} style={{display: 'none'}} /> Edit Purchase
          </button>
        </div>

        <div className="glass-card mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-muted text-xs">Supplier</div>
              <div className="font-medium">{selectedPurchase.supplier_name}</div>
            </div>
            <div>
              <div className="text-muted text-xs">Invoice No</div>
              <div className="font-medium">{selectedPurchase.invoice_number}</div>
            </div>
            <div>
              <div className="text-muted text-xs">Date</div>
              <div className="font-medium">{selectedPurchase.purchase_date}</div>
            </div>
            <div>
              <div className="text-muted text-xs">Total Amount</div>
              <div className="font-bold text-lg text-primary">₹{selectedPurchase.total_amount.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-muted text-xs">Amount Paid</div>
              <div className="font-bold text-lg text-green-600">₹{(selectedPurchase.amount_paid || 0).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-muted text-xs">Remaining Balance</div>
              <div className="font-bold text-lg text-rose-600">₹{(selectedPurchase.total_amount - (selectedPurchase.amount_paid || 0)).toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>MRP</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {selectedPurchase.items && selectedPurchase.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.brand_name}</td>
                  <td>{item.batch_number}</td>
                  <td>{item.expiry_date}</td>
                  <td>{item.quantity}</td>
                  <td>{item.purchase_rate}</td>
                  <td>{item.mrp}</td>
                  <td>{(item.quantity * item.purchase_rate).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <h2 className="section-title">Purchase History</h2>
        <button className="btn btn-primary" onClick={() => setView('create')}>
          <Plus size={16} /> New Purchase
        </button>
      </div>

      <div className="glass-card" style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Invoice No</th>
              <th>Paid Amt</th>
              <th>Total Amount</th>
              <th className="text-center">Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="text-center">Loading...</td></tr>
            ) : purchases.length === 0 ? (
              <tr><td colSpan="7" className="text-center">No purchases found</td></tr>
            ) : (
              purchases.map(p => {
                const isPaid = (p.amount_paid || 0) >= p.total_amount;
                const isPartial = (p.amount_paid || 0) > 0 && (p.amount_paid || 0) < p.total_amount;
                const isUnpaid = (p.amount_paid || 0) === 0;

                return (
                  <tr key={p.id}>
                    <td>{p.purchase_date.slice(0, 10)}</td>
                    <td>{p.supplier_name}</td>
                    <td>{p.invoice_number}</td>
                    <td>₹{(p.amount_paid || 0).toFixed(2)}</td>
                    <td className="font-medium">₹{p.total_amount.toFixed(2)}</td>
                    <td className="text-center">
                      <span className={`badge ${isPaid ? 'badge-green' : isPartial ? 'badge-yellow' : 'badge-red'}`}>
                        {isPaid ? 'Paid' : isPartial ? 'Partial' : 'Unpaid'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => viewDetail(p.id)}>
                        <Eye size={14} /> View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
