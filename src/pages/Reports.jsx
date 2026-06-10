import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { FileText, Download, Calendar, Search, ShieldAlert, Package, AlertTriangle, IndianRupee, Users, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { downloadPDF } from '../services/pdf';

export default function Reports() {
  const [activeTab, setActiveTab] = useState('gst');
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [expiryDays, setExpiryDays] = useState(90);
  const [stockThreshold, setStockThreshold] = useState(10);
  const [reportData, setReportData] = useState({ type: '', items: null });
  const [loading, setLoading] = useState(false);
  const [shopName, setShopName] = useState('AthassMediSync');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.getSettings().then(s => {
      if (s.shop_name) setShopName(s.shop_name);
      if (s.expiry_alert_days) setExpiryDays(parseInt(s.expiry_alert_days) || 90);
      if (s.low_stock_threshold) setStockThreshold(parseInt(s.low_stock_threshold) || 10);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [activeTab, dateRange, expiryDays, stockThreshold]);

  useEffect(() => {
    setSearchTerm('');
  }, [activeTab]);

  const fetchReportData = async () => {
    const currentTab = activeTab;
    setLoading(true);
    setReportData({ type: currentTab, items: null }); 
    try {
      let endpoint = '';
      if (currentTab === 'gst') endpoint = `/reports/gst?from=${dateRange.from}&to=${dateRange.to}`;
      else if (currentTab === 'h1') endpoint = `/reports/h1?from=${dateRange.from}&to=${dateRange.to}`;
      else if (currentTab === 'expiry') endpoint = `/reports/expiry?days=${expiryDays}`;
      else if (currentTab === 'low-stock') endpoint = `/reports/low-stock?threshold=${stockThreshold}`;
      else if (currentTab === 'sales') endpoint = `/reports/sales-summary?from=${dateRange.from}&to=${dateRange.to}`;
      else if (currentTab === 'credit') endpoint = `/reports/customer-credit`;
      else if (currentTab === 'purchases') endpoint = `/reports/purchases-summary?from=${dateRange.from}&to=${dateRange.to}`;
      else if (currentTab === 'profitability') endpoint = `/reports/profitability?from=${dateRange.from}&to=${dateRange.to}`;

      const res = await api.get(endpoint);
      setReportData({ type: currentTab, items: res });
    } catch (err) {
      console.error('Failed to fetch report data:', err);
      setReportData({ type: currentTab, items: null });
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = (items, filename) => {
    if (!items || !items.length) return;
    const headers = Object.keys(items[0]).join(',');
    const rows = items.map(row => 
      Object.values(row).map(val => `"${val}"`).join(',')
    ).join('\n');
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  const exportToPDF = (items, title, headers) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(shopName, 14, 20);
    doc.setFontSize(12);
    doc.text(title, 14, 30);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 38);
    
    const tableData = items.map(row => headers.map(h => {
        const val = row[h.key];
        return typeof val === 'number' ? val.toFixed(2) : val;
    }));

    doc.autoTable({
      startY: 45,
      head: [headers.map(h => h.label)],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 122, 255] } // Match Apple Accent Blue
    });

    downloadPDF(doc, `${title.toLowerCase().replace(/ /g, '_')}.pdf`);
  };

  const hasData = (data) => {
    if (!data) return false;
    if (activeTab === 'gst') {
      return (data.sales && data.sales.length > 0) || (data.breakup && data.breakup.length > 0);
    }
    return Array.isArray(data) && data.length > 0;
  };

  const getFilteredData = () => {
    if (!reportData.items || reportData.type !== activeTab) return null;
    if (!searchTerm.trim()) return reportData.items;

    const term = searchTerm.toLowerCase();

    if (activeTab === 'gst') {
      const salesFiltered = reportData.items.sales?.filter(row => 
        row.month.toLowerCase().includes(term) ||
        String(row.taxable_value).includes(term) ||
        String(row.total_gst).includes(term) ||
        String(row.total_sales).includes(term)
      ) || [];
      const breakupFiltered = reportData.items.breakup?.filter(row =>
        String(row.gst_percent).includes(term) ||
        String(row.taxable_value).includes(term) ||
        String(row.gst_amount).includes(term)
      ) || [];
      return { sales: salesFiltered, breakup: breakupFiltered };
    }

    if (Array.isArray(reportData.items)) {
      return reportData.items.filter(row => {
        return Object.entries(row).some(([key, val]) => {
          if (val === null || val === undefined) return false;
          if (key === 'created_at' || key === 'sale_date' || key === 'expiry_date') {
            return new Date(val).toLocaleDateString().toLowerCase().includes(term) || String(val).toLowerCase().includes(term);
          }
          return String(val).toLowerCase().includes(term);
        });
      });
    }

    return reportData.items;
  };

  const filteredItems = getFilteredData();

  const renderSummaryCards = () => {
    if (!filteredItems) return null;

    const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (activeTab === 'gst' && filteredItems.sales) {
      const totalTaxable = filteredItems.sales.reduce((sum, item) => sum + (item.taxable_value || 0), 0);
      const totalGst = filteredItems.sales.reduce((sum, item) => sum + (item.total_gst || 0), 0);
      const totalSales = filteredItems.sales.reduce((sum, item) => sum + (item.total_sales || 0), 0);

      return (
        <div className="stats-grid mb-4">
          <div className="glass-card stat-blue">
            <div className="card-title">Total Sales (Inc GST)</div>
            <div className="card-value">{fmt(totalSales)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Over selected period</div>
          </div>
          <div className="glass-card stat-green">
            <div className="card-title">Taxable Value</div>
            <div className="card-value">{fmt(totalTaxable)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Net sale value</div>
          </div>
          <div className="glass-card stat-purple">
            <div className="card-title">GST Collected</div>
            <div className="card-value">{fmt(totalGst)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Total tax amount</div>
          </div>
        </div>
      );
    }

    if (activeTab === 'sales' && Array.isArray(filteredItems)) {
      const totalSales = filteredItems.reduce((sum, item) => sum + (item.total_amount || 0), 0);
      const cashSales = filteredItems.filter(i => i.payment_mode === 'Cash').reduce((sum, item) => sum + (item.total_amount || 0), 0);
      const upiSales = filteredItems.filter(i => i.payment_mode === 'UPI').reduce((sum, item) => sum + (item.total_amount || 0), 0);
      const creditSales = filteredItems.filter(i => ['credit', 'pending', 'udhaari'].includes(i.payment_mode.toLowerCase())).reduce((sum, item) => sum + (item.total_amount || 0), 0);

      return (
        <div className="stats-grid mb-4">
          <div className="glass-card stat-blue">
            <div className="card-title">Total Sales Value</div>
            <div className="card-value">{fmt(totalSales)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{filteredItems.length} invoices generated</div>
          </div>
          <div className="glass-card stat-green">
            <div className="card-title">Cash Sales</div>
            <div className="card-value small">{fmt(cashSales)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Cash mode payments</div>
          </div>
          <div className="glass-card stat-purple">
            <div className="card-title">UPI Sales</div>
            <div className="card-value small">{fmt(upiSales)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Digital mode payments</div>
          </div>
          <div className="glass-card stat-peach">
            <div className="card-title">Udhaari (Pending)</div>
            <div className="card-value small">{fmt(creditSales)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Outstanding sales</div>
          </div>
        </div>
      );
    }

    if (activeTab === 'h1' && Array.isArray(filteredItems)) {
      const totalQty = filteredItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const patientCount = new Set(filteredItems.map(i => i.patient_name)).size;
      const doctorCount = new Set(filteredItems.map(i => i.doctor_name)).size;

      return (
        <div className="stats-grid mb-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="glass-card stat-rose">
            <div className="card-title">H1 Drugs Dispensed</div>
            <div className="card-value">{totalQty} Units</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Under Schedule H1 logs</div>
          </div>
          <div className="glass-card stat-purple">
            <div className="card-title">Patients Served</div>
            <div className="card-value">{patientCount} Patients</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Unique patients listed</div>
          </div>
          <div className="glass-card stat-blue">
            <div className="card-title">Prescribing Doctors</div>
            <div className="card-value">{doctorCount} Doctors</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Authorized medical practitioners</div>
          </div>
        </div>
      );
    }

    if (activeTab === 'expiry' && Array.isArray(filteredItems)) {
      const batchCount = filteredItems.length;
      const expiredCount = filteredItems.filter(i => new Date(i.expiry_date) <= new Date()).length;
      const expiringSoon = batchCount - expiredCount;
      const totalQty = filteredItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

      return (
        <div className="stats-grid mb-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="glass-card stat-rose">
            <div className="card-title">Already Expired</div>
            <div className="card-value" style={{ color: 'var(--accent-rose)' }}>{expiredCount} Batches</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Remove from inventory</div>
          </div>
          <div className="glass-card stat-peach">
            <div className="card-title">Expiring Soon</div>
            <div className="card-value" style={{ color: 'var(--accent-peach)' }}>{expiringSoon} Batches</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Next {expiryDays} days</div>
          </div>
          <div className="glass-card stat-blue">
            <div className="card-title">Total Batches</div>
            <div className="card-value">{batchCount} Batches</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>At risk of expiration</div>
          </div>
          <div className="glass-card stat-purple">
            <div className="card-title">Total Qty at Risk</div>
            <div className="card-value">{totalQty} Units</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Total remaining units</div>
          </div>
        </div>
      );
    }

    if (activeTab === 'low-stock' && Array.isArray(filteredItems)) {
      const itemCount = filteredItems.length;
      const outOfStock = filteredItems.filter(i => i.total_stock === 0).length;
      const lowStock = itemCount - outOfStock;

      return (
        <div className="stats-grid mb-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="glass-card stat-rose">
            <div className="card-title">Out of Stock</div>
            <div className="card-value" style={{ color: 'var(--accent-rose)' }}>{outOfStock} Medicines</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Immediate order required</div>
          </div>
          <div className="glass-card stat-peach">
            <div className="card-title">Low Stock Alert</div>
            <div className="card-value" style={{ color: 'var(--accent-peach)' }}>{lowStock} Medicines</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Below threshold ({stockThreshold} units)</div>
          </div>
          <div className="glass-card stat-blue">
            <div className="card-title">Total Reorder Needs</div>
            <div className="card-value">{itemCount} Medicines</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Combined shortfalls</div>
          </div>
        </div>
      );
    }

    if (activeTab === 'credit' && Array.isArray(filteredItems)) {
      const totalCredit = filteredItems.reduce((sum, item) => sum + (item.current_balance || 0), 0);
      const customerCount = filteredItems.length;
      const avgCredit = customerCount > 0 ? (totalCredit / customerCount) : 0;

      return (
        <div className="stats-grid mb-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="glass-card stat-rose">
            <div className="card-title">Total Outstanding Credit</div>
            <div className="card-value" style={{ color: 'var(--accent-rose)' }}>{fmt(totalCredit)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Total unpaid udhaari</div>
          </div>
          <div className="glass-card stat-purple">
            <div className="card-title">Debtors Count</div>
            <div className="card-value">{customerCount} Customers</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Customers with balance &gt; 0</div>
          </div>
          <div className="glass-card stat-blue">
            <div className="card-title">Average Credit</div>
            <div className="card-value">{fmt(avgCredit)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Per outstanding customer</div>
          </div>
        </div>
      );
    }

    if (activeTab === 'purchases' && Array.isArray(filteredItems)) {
      const totalPurchase = filteredItems.reduce((sum, item) => sum + (item.total_amount || 0), 0);
      const totalPaid = filteredItems.reduce((sum, item) => sum + (item.amount_paid || 0), 0);
      const totalOutstanding = filteredItems.reduce((sum, item) => sum + (item.outstanding || 0), 0);

      return (
        <div className="stats-grid mb-4">
          <div className="glass-card stat-blue">
            <div className="card-title">Total Purchases</div>
            <div className="card-value">{fmt(totalPurchase)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Total billed purchases</div>
          </div>
          <div className="glass-card stat-green">
            <div className="card-title">Total Paid</div>
            <div className="card-value">{fmt(totalPaid)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Paid to suppliers</div>
          </div>
          <div className="glass-card stat-rose">
            <div className="card-title">Total Payables</div>
            <div className="card-value" style={{ color: 'var(--accent-rose)' }}>{fmt(totalOutstanding)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Unpaid outstanding amount</div>
          </div>
        </div>
      );
    }

    if (activeTab === 'profitability' && Array.isArray(filteredItems)) {
      const totalSales = filteredItems.reduce((sum, item) => sum + (item.sales_value || 0), 0);
      const totalCost = filteredItems.reduce((sum, item) => sum + (item.purchase_cost || 0), 0);
      const totalProfit = filteredItems.reduce((sum, item) => sum + (item.gross_profit || 0), 0);
      const marginPct = totalSales > 0 ? (totalProfit / totalSales * 100) : 0;

      return (
        <div className="stats-grid mb-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="glass-card stat-blue">
            <div className="card-title">Sales Revenue</div>
            <div className="card-value">{fmt(totalSales)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Excluding tax calculations</div>
          </div>
          <div className="glass-card stat-rose">
            <div className="card-title">Purchase Cost</div>
            <div className="card-value">{fmt(totalCost)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Total acquisition cost</div>
          </div>
          <div className="glass-card stat-green">
            <div className="card-title">Gross Profit</div>
            <div className="card-value" style={{ color: 'var(--accent-mint)' }}>{fmt(totalProfit)}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Revenue minus Cost</div>
          </div>
          <div className="glass-card stat-purple">
            <div className="card-title">Gross Profit Margin</div>
            <div className="card-value">{marginPct.toFixed(2)}%</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>Overall profit percentage</div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderChart = () => {
    if (!filteredItems) return null;

    const tooltipStyle = {
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      borderRadius: '12px',
      border: '1px solid var(--border-glass)',
      boxShadow: 'var(--shadow-md)',
      fontSize: '12px',
      fontWeight: '600',
      color: 'var(--text-primary)'
    };

    if (activeTab === 'gst' && filteredItems.sales && filteredItems.sales.length > 0) {
      const chartSales = [...filteredItems.sales].reverse();
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartSales} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => '₹' + v.toLocaleString('en-IN')} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => ['₹' + Number(v).toFixed(2), '']} />
            <Bar dataKey="total_sales" name="Total Sales" fill="var(--accent-blue-pastel)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="total_gst" name="GST Collected" fill="var(--accent-lavender-pastel)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'sales' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const dailyMap = {};
      filteredItems.forEach(item => {
        const d = item.created_at.split('T')[0];
        dailyMap[d] = (dailyMap[d] || 0) + item.total_amount;
      });
      const chartSales = Object.entries(dailyMap)
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartSales} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }} 
              axisLine={false} 
              tickLine={false}
              tickFormatter={d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => '₹' + v.toLocaleString('en-IN')} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => ['₹' + Number(v).toFixed(2), 'Sales']} />
            <Area type="monotone" dataKey="total" name="Total Sales" stroke="var(--accent-blue)" fillOpacity={1} fill="url(#salesGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'h1' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const medMap = {};
      filteredItems.forEach(item => {
        medMap[item.brand_name] = (medMap[item.brand_name] || 0) + item.quantity;
      });
      const chartMeds = Object.entries(medMap)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartMeds} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" horizontal={false} vertical={true} />
            <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--text-primary)', fontWeight: 500 }} axisLine={false} tickLine={false} width={120} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="qty" name="Qty Sold" fill="var(--accent-rose-pastel)" radius={[0, 4, 4, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'expiry' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const expiryMap = {};
      filteredItems.forEach(item => {
        const month = item.expiry_date.slice(0, 7);
        expiryMap[month] = (expiryMap[month] || 0) + item.quantity;
      });
      const chartExpiry = Object.entries(expiryMap)
        .map(([month, qty]) => ({ month, qty }))
        .sort((a, b) => a.month.localeCompare(b.month));

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartExpiry} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="qty" name="Expiring Qty" fill="var(--accent-peach-pastel)" radius={[4, 4, 0, 0]} barSize={25} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'low-stock' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const chartLow = [...filteredItems]
        .sort((a, b) => a.total_stock - b.total_stock)
        .slice(0, 5);

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartLow} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis dataKey="brand_name" tick={{ fontSize: 10, fill: 'var(--text-primary)', fontWeight: 500 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="total_stock" name="Stock Left" fill="var(--accent-rose-pastel)" radius={[4, 4, 0, 0]} barSize={25} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'credit' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const chartCredit = [...filteredItems]
        .sort((a, b) => b.current_balance - a.current_balance)
        .slice(0, 5);

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartCredit} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-primary)', fontWeight: 500 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => '₹' + v.toLocaleString('en-IN')} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => ['₹' + Number(v).toFixed(2), 'Balance']} />
            <Bar dataKey="current_balance" name="Outstanding Balance" fill="var(--accent-lavender-pastel)" radius={[4, 4, 0, 0]} barSize={25} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'purchases' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const chartPur = filteredItems.slice(0, 5);
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartPur} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis dataKey="supplier_name" tick={{ fontSize: 10, fill: 'var(--text-primary)', fontWeight: 500 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => '₹' + v.toLocaleString('en-IN')} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => ['₹' + Number(v).toFixed(2), '']} />
            <Bar dataKey="amount_paid" name="Paid Amount" stackId="a" fill="var(--accent-mint-pastel)" barSize={25} />
            <Bar dataKey="outstanding" name="Outstanding" stackId="a" fill="var(--accent-rose-pastel)" radius={[4, 4, 0, 0]} barSize={25} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'profitability' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const chartProfit = [...filteredItems]
        .sort((a, b) => a.sale_date.localeCompare(b.sale_date));

      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartProfit} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-mint)" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="var(--accent-mint)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis 
              dataKey="sale_date" 
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }} 
              axisLine={false} 
              tickLine={false}
              tickFormatter={d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => '₹' + v.toLocaleString('en-IN')} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => ['₹' + Number(v).toFixed(2), '']} />
            <Area type="monotone" dataKey="sales_value" name="Sales" stroke="var(--accent-blue)" fill="none" strokeWidth={2} />
            <Area type="monotone" dataKey="gross_profit" name="Gross Profit" stroke="var(--accent-mint)" fillOpacity={1} fill="url(#profitGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  const tabs = [
    { id: 'gst', label: 'GST Summary', icon: <IndianRupee size={15}/> },
    { id: 'sales', label: 'Sales Summary', icon: <FileText size={15}/> },
    { id: 'h1', label: 'H1 Register', icon: <ShieldAlert size={15}/> },
    { id: 'expiry', label: 'Expiry Report', icon: <AlertTriangle size={15}/> },
    { id: 'low-stock', label: 'Low Stock', icon: <Package size={15}/> },
    { id: 'credit', label: 'Customer Credit', icon: <Users size={15}/> },
    { id: 'purchases', label: 'Purchases', icon: <Package size={15}/> },
    { id: 'profitability', label: 'Profitability', icon: <IndianRupee size={15}/> },
  ];

  return (
    <div className="w-full">
      <div className="toolbar flex justify-between items-center mb-4">
        <h2 className="section-title flex items-center gap-2" style={{ margin: 0 }}>
          <FileText size={24} className="text-primary" />
          Business Reports
        </h2>
        
        <div className="flex items-center gap-3">
          {/* Local Search input */}
          <div className="report-search-container">
            <Search />
            <input 
              type="text" 
              className="report-search-input" 
              placeholder="Search in report..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>

          {['gst', 'h1', 'sales', 'purchases', 'profitability'].includes(activeTab) && (
              <div className="reports-filters">
                  <Calendar size={15} className="text-muted" />
                  <div className="date-range-picker">
                      <input 
                          type="date" 
                          className="date-range-input" 
                          value={dateRange.from}
                          onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                      />
                      <span className="date-range-separator">TO</span>
                      <input 
                          type="date" 
                          className="date-range-input" 
                          value={dateRange.to}
                          onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                      />
                  </div>
              </div>
          )}

          {activeTab === 'expiry' && (
              <div className="reports-filters">
                  <Calendar size={15} className="text-muted" />
                  <span className="reports-filter-label">Alert Period:</span>
                  <select 
                      className="reports-select" 
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(parseInt(e.target.value))}
                  >
                      <option value={30}>30 Days (1 Month)</option>
                      <option value={60}>60 Days (2 Months)</option>
                      <option value={90}>90 Days (3 Months)</option>
                      <option value={180}>180 Days (6 Months)</option>
                      <option value={365}>365 Days (1 Year)</option>
                  </select>
              </div>
          )}

          {activeTab === 'low-stock' && (
              <div className="reports-filters">
                  <Package size={15} className="text-muted" />
                  <span className="reports-filter-label">Threshold:</span>
                  <select 
                      className="reports-select" 
                      value={stockThreshold}
                      onChange={(e) => setStockThreshold(parseInt(e.target.value))}
                  >
                      <option value={5}>5 Units</option>
                      <option value={10}>10 Units</option>
                      <option value={20}>20 Units</option>
                      <option value={50}>50 Units</option>
                      <option value={100}>100 Units</option>
                  </select>
              </div>
          )}
        </div>
      </div>

      {/* Apple-style Segmented Tabs */}
      <div className="segmented-tabs-container">
        <div className="segmented-tabs">
            {tabs.map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`segmented-tab ${activeTab === tab.id ? 'active' : ''}`}
                >
                    {tab.icon}
                    {tab.label}
                </button>
            ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted glass-card">
            <RefreshCw size={32} className="animate-spin mx-auto mb-4 text-primary opacity-50" />
            <p className="font-medium">Preparing your report...</p>
        </div>
      ) : (!reportData.items || reportData.type !== activeTab || !hasData(reportData.items)) ? (
        <div className="text-center py-20 text-muted glass-card border-dashed border-2" style={{ border: '2px dashed var(--border-glass)' }}>
            <AlertTriangle size={32} className="mx-auto mb-4 text-muted opacity-50" />
            <p className="font-medium">No data found for the selected criteria.</p>
        </div>
      ) : (!filteredItems || !hasData(filteredItems)) ? (
        <div className="text-center py-20 text-muted glass-card border-dashed border-2" style={{ border: '2px dashed var(--border-glass)' }}>
            <Search size={32} className="mx-auto mb-4 text-muted opacity-50" />
            <p className="font-medium">No results matching your filter query.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards Row */}
          {renderSummaryCards()}

          {/* Graphical Analytics Chart */}
          {renderChart() && (
            <div className="report-chart-container">
              <h4 className="report-chart-title">Visual Analytics</h4>
              <div style={{ height: 220, width: '100%', marginTop: 8 }}>
                {renderChart()}
              </div>
            </div>
          )}

          {activeTab === 'gst' && filteredItems.sales && (
            <>
              <ReportSection 
                title="Sales GST Summary" 
                data={filteredItems.sales} 
                headers={[
                    { key: 'month', label: 'Month' },
                    { key: 'taxable_value', label: 'Taxable (₹)' },
                    { key: 'total_gst', label: 'GST (₹)' },
                    { key: 'total_sales', label: 'Total Sales (₹)' }
                ]}
                onExportCSV={() => exportToCSV(filteredItems.sales, 'gst_summary')}
                onExportPDF={() => exportToPDF(filteredItems.sales, 'Sales GST Summary', [
                    { key: 'month', label: 'Month' },
                    { key: 'taxable_value', label: 'Taxable' },
                    { key: 'total_gst', label: 'GST' },
                    { key: 'total_sales', label: 'Total' }
                ])}
              />
              <div style={{ height: 16 }}></div>
              <ReportSection 
                title="GST Breakup" 
                data={filteredItems.breakup} 
                headers={[
                    { key: 'gst_percent', label: 'GST %' },
                    { key: 'taxable_value', label: 'Taxable (₹)' },
                    { key: 'gst_amount', label: 'Total GST (₹)' }
                ]}
                onExportCSV={() => exportToCSV(filteredItems.breakup, 'gst_breakup')}
                onExportPDF={() => exportToPDF(filteredItems.breakup, 'GST Breakup', [
                    { key: 'gst_percent', label: 'Rate (%)' },
                    { key: 'taxable_value', label: 'Taxable' },
                    { key: 'gst_amount', label: 'GST Amount' }
                ])}
              />
            </>
          )}

          {activeTab === 'sales' && Array.isArray(filteredItems) && (
            <ReportSection 
                title="Detailed Sales Summary" 
                data={filteredItems} 
                headers={[
                    { key: 'created_at', label: 'Date' },
                    { key: 'invoice_number', label: 'Invoice' },
                    { key: 'customer_name', label: 'Customer' },
                    { key: 'total_amount', label: 'Total (₹)' },
                    { key: 'payment_mode', label: 'Mode' }
                ]}
                onExportCSV={() => exportToCSV(filteredItems, 'sales_summary')}
                onExportPDF={() => exportToPDF(filteredItems, 'Sales Summary Report', [
                    { key: 'created_at', label: 'Date' },
                    { key: 'invoice_number', label: 'Inv #' },
                    { key: 'customer_name', label: 'Customer' },
                    { key: 'total_amount', label: 'Amount' },
                    { key: 'payment_mode', label: 'Mode' }
                ])}
            />
          )}

          {activeTab === 'h1' && Array.isArray(filteredItems) && (
            <ReportSection 
                title="Schedule H1 Drug Register" 
                data={filteredItems} 
                headers={[
                    { key: 'created_at', label: 'Date' },
                    { key: 'invoice_number', label: 'Invoice' },
                    { key: 'patient_name', label: 'Patient' },
                    { key: 'doctor_name', label: 'Doctor' },
                    { key: 'brand_name', label: 'Medicine' },
                    { key: 'quantity', label: 'Qty' }
                ]}
                onExportCSV={() => exportToCSV(filteredItems, 'h1_register')}
                onExportPDF={() => exportToPDF(filteredItems, 'Schedule H1 Drug Register', [
                    { key: 'created_at', label: 'Date' },
                    { key: 'patient_name', label: 'Patient' },
                    { key: 'doctor_name', label: 'Doctor' },
                    { key: 'brand_name', label: 'Medicine' },
                    { key: 'quantity', label: 'Qty' }
                ])}
            />
          )}

          {activeTab === 'expiry' && Array.isArray(filteredItems) && (
            <ReportSection 
                title={`Medicine Expiry Report (${expiryDays} Days)`} 
                data={filteredItems} 
                headers={[
                    { key: 'brand_name', label: 'Medicine' },
                    { key: 'batch_number', label: 'Batch' },
                    { key: 'expiry_date', label: 'Expiry Date' },
                    { key: 'quantity', label: 'Stock Left' }
                ]}
                onExportCSV={() => exportToCSV(filteredItems, 'expiry_report')}
                onExportPDF={() => exportToPDF(filteredItems, 'Medicine Expiry Report', [
                    { key: 'brand_name', label: 'Medicine' },
                    { key: 'batch_number', label: 'Batch' },
                    { key: 'expiry_date', label: 'Expiry' },
                    { key: 'quantity', label: 'Qty' }
                ])}
            />
          )}

          {activeTab === 'low-stock' && Array.isArray(filteredItems) && (
            <ReportSection 
                title={`Low Stock Inventory Report (Threshold: ${stockThreshold})`}
                data={filteredItems} 
                headers={[
                    { key: 'brand_name', label: 'Medicine' },
                    { key: 'company_name', label: 'Company' },
                    { key: 'total_stock', label: 'Stock' }
                ]}
                onExportCSV={() => exportToCSV(filteredItems, 'low_stock_report')}
                onExportPDF={() => exportToPDF(filteredItems, 'Low Stock Report', [
                    { key: 'brand_name', label: 'Medicine' },
                    { key: 'total_stock', label: 'Stock' }
                ])}
            />
          )}

          {activeTab === 'credit' && Array.isArray(filteredItems) && (
            <ReportSection 
                title="Customer Credit (Pending) Report" 
                data={filteredItems} 
                headers={[
                    { key: 'name', label: 'Customer' },
                    { key: 'phone', label: 'Phone' },
                    { key: 'current_balance', label: 'Balance (₹)' }
                ]}
                onExportCSV={() => exportToCSV(filteredItems, 'credit_report')}
                onExportPDF={() => exportToPDF(filteredItems, 'Customer Credit Report', [
                    { key: 'name', label: 'Customer' },
                    { key: 'phone', label: 'Phone' },
                    { key: 'current_balance', label: 'Balance' }
                ])}
            />
          )}

          {activeTab === 'purchases' && Array.isArray(filteredItems) && (
            <ReportSection 
                title="Supplier Purchase Summary" 
                data={filteredItems} 
                headers={[
                    { key: 'supplier_name', label: 'Supplier' },
                    { key: 'total_bills', label: 'Bills' },
                    { key: 'total_amount', label: 'Total Purchase (₹)' },
                    { key: 'amount_paid', label: 'Paid (₹)' },
                    { key: 'outstanding', label: 'Pending (₹)' }
                ]}
                onExportCSV={() => exportToCSV(filteredItems, 'purchase_summary')}
                onExportPDF={() => exportToPDF(filteredItems, 'Supplier Purchase Summary', [
                    { key: 'supplier_name', label: 'Supplier' },
                    { key: 'total_bills', label: 'Bills' },
                    { key: 'total_amount', label: 'Total' },
                    { key: 'amount_paid', label: 'Paid' },
                    { key: 'outstanding', label: 'Pending' }
                ])}
            />
          )}

          {activeTab === 'profitability' && Array.isArray(filteredItems) && (
            <ReportSection 
                title="Daily Profitability Report" 
                data={filteredItems} 
                headers={[
                    { key: 'sale_date', label: 'Date' },
                    { key: 'bills', label: 'Bills' },
                    { key: 'sales_value', label: 'Sales (₹)' },
                    { key: 'purchase_cost', label: 'Purchase Cost (₹)' },
                    { key: 'gross_profit', label: 'Gross Profit (₹)' }
                ]}
                onExportCSV={() => exportToCSV(filteredItems, 'profitability_report')}
                onExportPDF={() => exportToPDF(filteredItems, 'Daily Profitability Report', [
                    { key: 'sale_date', label: 'Date' },
                    { key: 'bills', label: 'Bills' },
                    { key: 'sales_value', label: 'Sales' },
                    { key: 'purchase_cost', label: 'Cost' },
                    { key: 'gross_profit', label: 'Profit' }
                ])}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReportSection({ title, data, headers, onExportCSV, onExportPDF }) {
    return (
        <div className="glass-card shadow-sm border border-white/40">
            <div className="flex justify-between items-center mb-5 border-b border-black/5 pb-3">
                <h3 className="font-bold text-secondary" style={{ margin: 0, fontSize: '15px' }}>{title}</h3>
                <div className="flex gap-2">
                    <button onClick={onExportPDF} className="btn btn-primary btn-sm text-[10px] py-1.5 px-3 uppercase tracking-wider font-bold">
                        <Download size={12} /> PDF
                    </button>
                    <button onClick={onExportCSV} className="btn btn-secondary btn-sm text-[10px] py-1.5 px-3 uppercase tracking-wider font-bold">
                        <FileText size={12} /> CSV
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="data-table no-border">
                    <thead>
                        <tr>
                            {headers.map(h => {
                                const alignRight = ['quantity', 'total_stock', 'total_bills', 'qty', 'bills'].some(k => h.key.toLowerCase().includes(k)) || 
                                                   ['amount', 'balance', 'cost', 'value', 'profit', 'gst', 'taxable', 'rate', 'mrp', 'price', 'total'].some(k => h.key.toLowerCase().includes(k));
                                return (
                                    <th key={h.key} className={`text-[11px] text-muted uppercase tracking-wider ${alignRight ? 'text-right' : ''}`}>
                                        {h.label}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.isArray(data) && data.map((row, i) => (
                            <tr key={i} className="hover:bg-black/[0.02] transition-colors">
                                {headers.map(h => {
                                    const alignRight = ['quantity', 'total_stock', 'total_bills', 'qty', 'bills'].some(k => h.key.toLowerCase().includes(k)) || 
                                                       ['amount', 'balance', 'cost', 'value', 'profit', 'gst', 'taxable', 'rate', 'mrp', 'price', 'total'].some(k => h.key.toLowerCase().includes(k));
                                    return (
                                        <td key={h.key} className={`text-sm ${alignRight ? 'text-right' : ''} ${String(h.key).includes('total') || String(h.key).includes('balance') || String(h.key).includes('profit') ? 'font-bold text-primary' : ''}`}>
                                            {h.key === 'created_at' || h.key === 'sale_date' ? new Date(row[h.key]).toLocaleDateString() : 
                                             typeof row[h.key] === 'number' ? row[h.key].toFixed(2) : row[h.key]}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
