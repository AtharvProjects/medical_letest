import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  FileText, Download, Calendar, Search, ShieldAlert, Package, PackageX,
  AlertTriangle, IndianRupee, Users, Wallet, Banknote, CreditCard, Clock, TrendingUp,
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { downloadPDF } from '../services/pdf';
import { inr, formatDate, todayStr } from '../utils/format';
import { Button, DataTable, EmptyState, LoadingState, StatCard } from '../components/ui';

/* --------------------------- cell formatting --------------------------- */
const DATE_KEYS = ['created_at', 'sale_date', 'expiry_date'];
const COUNT_KEYS = ['quantity', 'qty', 'total_stock', 'total_bills', 'bills'];
const CURRENCY_KEYS = ['amount', 'balance', 'cost', 'value', 'profit', 'gst', 'taxable', 'rate', 'mrp', 'price', 'total', 'sales'];

const includesAny = (key, list) => list.some((k) => String(key).toLowerCase().includes(k));
const isCountKey = (k) => COUNT_KEYS.some((x) => String(k).toLowerCase().includes(x));
const isCurrencyKey = (k) => CURRENCY_KEYS.some((x) => String(k).toLowerCase().includes(x));
const isNumericKey = (k) => k === 'gst_percent' || isCountKey(k) || isCurrencyKey(k);

function formatCell(key, val) {
  if (key === 'customer_name' && !val) return 'Walk-in';
  if (val === null || val === undefined || val === '') return <span className="text-muted">—</span>;
  if (key === 'gst_percent') return `${val}%`;
  if (DATE_KEYS.includes(key)) return formatDate(val);
  if (isCountKey(key)) return val;                       // plain integer counts
  if (isCurrencyKey(key)) return inr(val);               // grouped ₹
  return typeof val === 'number' ? val.toFixed(2) : val;
}

/** Convert an export-headers array ([{key,label}]) into DataTable columns. */
function buildColumns(headers) {
  return headers.map((h) => {
    const right = isNumericKey(h.key);
    const emphasize = includesAny(h.key, ['total', 'balance', 'profit']);
    return {
      header: h.label,
      align: right ? 'right' : 'left',
      render: (row) => {
        const content = formatCell(h.key, row[h.key]);
        return emphasize ? <span style={{ fontWeight: 600 }}>{content}</span> : content;
      },
    };
  });
}

/* solid (non-glass) chart tooltip */
const tooltipStyle = {
  background: 'var(--bg-secondary)',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-md)',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

export default function Reports() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState('gst');
  const [dateRange, setDateRange] = useState({
    from: new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA'),
    to: todayStr(),
  });
  const [expiryDays, setExpiryDays] = useState(90);
  const [stockThreshold, setStockThreshold] = useState(10);
  const [reportData, setReportData] = useState({ type: '', items: null });
  const [loading, setLoading] = useState(false);
  const [shopName, setShopName] = useState('AthassMediSync');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.getSettings().then((s) => {
      if (s.shop_name) setShopName(s.shop_name);
      if (s.expiry_alert_days) setExpiryDays(parseInt(s.expiry_alert_days) || 90);
      if (s.low_stock_threshold) setStockThreshold(parseInt(s.low_stock_threshold) || 10);
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchReportData(); /* eslint-disable-next-line */ }, [activeTab, dateRange, expiryDays, stockThreshold]);
  useEffect(() => { setSearchTerm(''); }, [activeTab]);

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
    const rows = items.map((row) => Object.values(row).map((val) => `"${val}"`).join(',')).join('\n');
    const csvContent = 'data:text/csv;charset=utf-8,' + headers + '\n' + rows;
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `${filename}_${todayStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = (items, title, headers) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(shopName, 14, 20);
    doc.setFontSize(12);
    doc.text(title, 14, 30);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 38);

    const tableData = items.map((row) => headers.map((h) => {
      const val = row[h.key];
      return typeof val === 'number' ? val.toFixed(2) : (val ?? '');
    }));

    doc.autoTable({
      startY: 45,
      head: [headers.map((h) => h.label)],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] }, // --primary
    });

    downloadPDF(doc, `${title.toLowerCase().replace(/ /g, '_')}.pdf`);
  };

  const hasData = (data) => {
    if (!data) return false;
    if (activeTab === 'gst') return (data.sales && data.sales.length > 0) || (data.breakup && data.breakup.length > 0);
    return Array.isArray(data) && data.length > 0;
  };

  const getFilteredData = () => {
    if (!reportData.items || reportData.type !== activeTab) return null;
    if (!searchTerm.trim()) return reportData.items;
    const term = searchTerm.toLowerCase();

    if (activeTab === 'gst') {
      const salesFiltered = reportData.items.sales?.filter((row) =>
        row.month.toLowerCase().includes(term) ||
        String(row.taxable_value).includes(term) ||
        String(row.total_gst).includes(term) ||
        String(row.total_sales).includes(term)
      ) || [];
      const breakupFiltered = reportData.items.breakup?.filter((row) =>
        String(row.gst_percent).includes(term) ||
        String(row.taxable_value).includes(term) ||
        String(row.gst_amount).includes(term)
      ) || [];
      return { sales: salesFiltered, breakup: breakupFiltered };
    }

    if (Array.isArray(reportData.items)) {
      return reportData.items.filter((row) =>
        Object.entries(row).some(([key, val]) => {
          if (val === null || val === undefined) return false;
          if (DATE_KEYS.includes(key)) {
            return new Date(val).toLocaleDateString().toLowerCase().includes(term) || String(val).toLowerCase().includes(term);
          }
          return String(val).toLowerCase().includes(term);
        })
      );
    }
    return reportData.items;
  };

  const filteredItems = getFilteredData();

  /* ------------------------------ summary KPIs ------------------------------ */
  const renderSummaryCards = () => {
    if (!filteredItems) return null;

    if (activeTab === 'gst' && filteredItems.sales) {
      const totalTaxable = filteredItems.sales.reduce((s, i) => s + (i.taxable_value || 0), 0);
      const totalGst = filteredItems.sales.reduce((s, i) => s + (i.total_gst || 0), 0);
      const totalSales = filteredItems.sales.reduce((s, i) => s + (i.total_sales || 0), 0);
      return (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <StatCard label="Total Sales (Inc GST)" value={inr(totalSales)} accent="blue" icon={IndianRupee} sub="Over selected period" />
          <StatCard label="Taxable Value" value={inr(totalTaxable)} accent="green" icon={FileText} sub="Net sale value" />
          <StatCard label="GST Collected" value={inr(totalGst)} accent="purple" icon={Wallet} sub="Total tax amount" />
        </div>
      );
    }

    if (activeTab === 'sales' && Array.isArray(filteredItems)) {
      const mode = (i) => (i.payment_mode || '').toLowerCase();
      const totalSales = filteredItems.reduce((s, i) => s + (i.total_amount || 0), 0);
      const cashSales = filteredItems.filter((i) => i.payment_mode === 'Cash').reduce((s, i) => s + (i.total_amount || 0), 0);
      const upiSales = filteredItems.filter((i) => i.payment_mode === 'UPI').reduce((s, i) => s + (i.total_amount || 0), 0);
      const creditSales = filteredItems.filter((i) => ['credit', 'pending', 'udhaari'].includes(mode(i))).reduce((s, i) => s + (i.total_amount || 0), 0);
      return (
        <div className="stats-grid">
          <StatCard label="Total Sales Value" value={inr(totalSales)} accent="blue" icon={IndianRupee} sub={`${filteredItems.length} invoice${filteredItems.length === 1 ? '' : 's'}`} />
          <StatCard label="Cash Sales" value={inr(cashSales)} accent="green" icon={Banknote} sub="Cash mode payments" />
          <StatCard label="UPI Sales" value={inr(upiSales)} accent="purple" icon={CreditCard} sub="Digital mode payments" />
          <StatCard label="Udhaari (Pending)" value={inr(creditSales)} accent="amber" icon={Clock} sub="Outstanding sales" />
        </div>
      );
    }

    if (activeTab === 'h1' && Array.isArray(filteredItems)) {
      const totalQty = filteredItems.reduce((s, i) => s + (i.quantity || 0), 0);
      const patientCount = new Set(filteredItems.map((i) => i.patient_name)).size;
      const doctorCount = new Set(filteredItems.map((i) => i.doctor_name)).size;
      return (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <StatCard label="H1 Drugs Dispensed" value={totalQty} accent="red" icon={ShieldAlert} sub="units under Schedule H1" />
          <StatCard label="Patients Served" value={patientCount} accent="purple" icon={Users} sub="unique patients" />
          <StatCard label="Prescribing Doctors" value={doctorCount} accent="blue" icon={FileText} sub="medical practitioners" />
        </div>
      );
    }

    if (activeTab === 'expiry' && Array.isArray(filteredItems)) {
      const batchCount = filteredItems.length;
      const expiredCount = filteredItems.filter((i) => new Date(i.expiry_date) <= new Date()).length;
      const expiringSoon = batchCount - expiredCount;
      const totalQty = filteredItems.reduce((s, i) => s + (i.quantity || 0), 0);
      return (
        <div className="stats-grid">
          <StatCard label="Already Expired" value={expiredCount} accent="red" icon={AlertTriangle} sub="remove from inventory" />
          <StatCard label="Expiring Soon" value={expiringSoon} accent="amber" icon={Clock} sub={`next ${expiryDays} days`} />
          <StatCard label="Total Batches" value={batchCount} accent="blue" icon={Package} sub="at risk of expiration" />
          <StatCard label="Total Qty at Risk" value={totalQty} accent="purple" icon={Package} sub="remaining units" />
        </div>
      );
    }

    if (activeTab === 'low-stock' && Array.isArray(filteredItems)) {
      const itemCount = filteredItems.length;
      const outOfStock = filteredItems.filter((i) => i.total_stock === 0).length;
      const lowStock = itemCount - outOfStock;
      return (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <StatCard label="Out of Stock" value={outOfStock} accent="red" icon={PackageX} sub="immediate order required" />
          <StatCard label="Low Stock Alert" value={lowStock} accent="amber" icon={AlertTriangle} sub={`below threshold (${stockThreshold} units)`} />
          <StatCard label="Total Reorder Needs" value={itemCount} accent="blue" icon={Package} sub="combined shortfalls" />
        </div>
      );
    }

    if (activeTab === 'credit' && Array.isArray(filteredItems)) {
      const totalCredit = filteredItems.reduce((s, i) => s + (i.current_balance || 0), 0);
      const customerCount = filteredItems.length;
      const avgCredit = customerCount > 0 ? totalCredit / customerCount : 0;
      return (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <StatCard label="Total Outstanding Credit" value={inr(totalCredit)} accent="red" icon={Wallet} sub="total unpaid udhaari" />
          <StatCard label="Debtors Count" value={customerCount} accent="purple" icon={Users} sub="customers with balance" />
          <StatCard label="Average Credit" value={inr(avgCredit)} accent="blue" icon={IndianRupee} sub="per outstanding customer" />
        </div>
      );
    }

    if (activeTab === 'purchases' && Array.isArray(filteredItems)) {
      const totalPurchase = filteredItems.reduce((s, i) => s + (i.total_amount || 0), 0);
      const totalPaid = filteredItems.reduce((s, i) => s + (i.amount_paid || 0), 0);
      const totalOutstanding = filteredItems.reduce((s, i) => s + (i.outstanding || 0), 0);
      return (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <StatCard label="Total Purchases" value={inr(totalPurchase)} accent="blue" icon={Package} sub="total billed purchases" />
          <StatCard label="Total Paid" value={inr(totalPaid)} accent="green" icon={Banknote} sub="paid to suppliers" />
          <StatCard label="Total Payables" value={inr(totalOutstanding)} accent="red" icon={Wallet} sub="unpaid outstanding" />
        </div>
      );
    }

    if (activeTab === 'profitability' && Array.isArray(filteredItems)) {
      const totalSales = filteredItems.reduce((s, i) => s + (i.sales_value || 0), 0);
      const totalCost = filteredItems.reduce((s, i) => s + (i.purchase_cost || 0), 0);
      const totalProfit = filteredItems.reduce((s, i) => s + (i.gross_profit || 0), 0);
      const marginPct = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
      return (
        <div className="stats-grid">
          <StatCard label="Sales Revenue" value={inr(totalSales)} accent="blue" icon={IndianRupee} sub="excluding tax" />
          <StatCard label="Purchase Cost" value={inr(totalCost)} accent="red" icon={Package} sub="total acquisition cost" />
          <StatCard label="Gross Profit" value={inr(totalProfit)} accent="green" icon={TrendingUp} sub="revenue minus cost" />
          <StatCard label="Gross Profit Margin" value={`${marginPct.toFixed(2)}%`} accent="purple" icon={TrendingUp} sub="overall profit %" />
        </div>
      );
    }

    return null;
  };

  /* -------------------------------- charts -------------------------------- */
  const renderChart = () => {
    if (!filteredItems) return null;

    if (activeTab === 'gst' && filteredItems.sales && filteredItems.sales.length > 0) {
      const chartSales = [...filteredItems.sales].reverse();
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartSales} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => '₹' + (v / 1000).toFixed(0) + 'k'} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--primary-bg)' }} formatter={(v, n) => [inr(v), n]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="total_sales" name="Total Sales" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="total_gst" name="GST Collected" fill="var(--upi)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'sales' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const dailyMap = {};
      filteredItems.forEach((item) => {
        const d = String(item.created_at).slice(0, 10); // robust to 'T' or ' ' separator
        dailyMap[d] = (dailyMap[d] || 0) + item.total_amount;
      });
      const chartSales = Object.entries(dailyMap).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date));
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartSales} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(d) => new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => '₹' + (v / 1000).toFixed(0) + 'k'} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [inr(v), 'Sales']} labelFormatter={(d) => new Date(d + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} />
            <Area type="monotone" dataKey="total" name="Total Sales" stroke="var(--primary)" fillOpacity={1} fill="url(#salesGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'h1' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const medMap = {};
      filteredItems.forEach((item) => { medMap[item.brand_name] = (medMap[item.brand_name] || 0) + item.quantity; });
      const chartMeds = Object.entries(medMap).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5);
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartMeds} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--text-primary)', fontWeight: 500 }} axisLine={false} tickLine={false} width={120} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--primary-bg)' }} />
            <Bar dataKey="qty" name="Qty Sold" fill="var(--danger)" radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'expiry' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const expiryMap = {};
      filteredItems.forEach((item) => { const m = item.expiry_date.slice(0, 7); expiryMap[m] = (expiryMap[m] || 0) + item.quantity; });
      const chartExpiry = Object.entries(expiryMap).map(([month, qty]) => ({ month, qty })).sort((a, b) => a.month.localeCompare(b.month));
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartExpiry} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--primary-bg)' }} />
            <Bar dataKey="qty" name="Expiring Qty" fill="var(--warning)" radius={[4, 4, 0, 0]} barSize={25} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'low-stock' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const chartLow = [...filteredItems].sort((a, b) => a.total_stock - b.total_stock).slice(0, 5);
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartLow} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="brand_name" tick={{ fontSize: 10, fill: 'var(--text-primary)', fontWeight: 500 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--primary-bg)' }} />
            <Bar dataKey="total_stock" name="Stock Left" fill="var(--danger)" radius={[4, 4, 0, 0]} barSize={25} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'credit' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const chartCredit = [...filteredItems].sort((a, b) => b.current_balance - a.current_balance).slice(0, 5);
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartCredit} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-primary)', fontWeight: 500 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => '₹' + (v / 1000).toFixed(0) + 'k'} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--primary-bg)' }} formatter={(v) => [inr(v), 'Balance']} />
            <Bar dataKey="current_balance" name="Outstanding Balance" fill="var(--upi)" radius={[4, 4, 0, 0]} barSize={25} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'purchases' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const chartPur = filteredItems.slice(0, 5);
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartPur} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="supplier_name" tick={{ fontSize: 10, fill: 'var(--text-primary)', fontWeight: 500 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => '₹' + (v / 1000).toFixed(0) + 'k'} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--primary-bg)' }} formatter={(v, n) => [inr(v), n]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="amount_paid" name="Paid" stackId="a" fill="var(--success)" barSize={25} />
            <Bar dataKey="outstanding" name="Outstanding" stackId="a" fill="var(--danger)" radius={[4, 4, 0, 0]} barSize={25} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (activeTab === 'profitability' && Array.isArray(filteredItems) && filteredItems.length > 0) {
      const chartProfit = [...filteredItems].sort((a, b) => a.sale_date.localeCompare(b.sale_date));
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartProfit} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--success)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="sale_date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(d) => new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => '₹' + (v / 1000).toFixed(0) + 'k'} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [inr(v), n]} labelFormatter={(d) => formatDate(d)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="sales_value" name="Sales" stroke="var(--primary)" fill="none" strokeWidth={2} />
            <Area type="monotone" dataKey="gross_profit" name="Gross Profit" stroke="var(--success)" fillOpacity={1} fill="url(#profitGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  const chart = renderChart();

  const tabs = [
    { id: 'gst', label: 'GST Summary', icon: <IndianRupee size={15} /> },
    { id: 'sales', label: 'Sales Summary', icon: <FileText size={15} /> },
    { id: 'h1', label: 'H1 Register', icon: <ShieldAlert size={15} /> },
    { id: 'expiry', label: 'Expiry Report', icon: <AlertTriangle size={15} /> },
    { id: 'low-stock', label: 'Low Stock', icon: <Package size={15} /> },
    { id: 'credit', label: 'Customer Credit', icon: <Users size={15} /> },
    { id: 'purchases', label: 'Purchases', icon: <Package size={15} /> },
    { id: 'profitability', label: 'Profitability', icon: <IndianRupee size={15} /> },
  ];

  const showDateRange = ['gst', 'h1', 'sales', 'purchases', 'profitability'].includes(activeTab);

  return (
    <div className="w-full">
      <div className="toolbar flex justify-between items-center mb-4">
        <h2 className="section-title flex items-center gap-2" style={{ margin: 0 }}>
          <FileText size={22} style={{ color: 'var(--primary)' }} />
          Business Reports
        </h2>

        <div className="flex items-center gap-3">
          <div className="report-search-container">
            <Search />
            <input
              type="text"
              className="report-search-input"
              placeholder="Search in report…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {showDateRange && (
            <div className="reports-filters">
              <Calendar size={15} className="text-muted" />
              <div className="date-range-picker">
                <input type="date" className="date-range-input" value={dateRange.from} onChange={(e) => setDateRange((p) => ({ ...p, from: e.target.value }))} />
                <span className="date-range-separator">TO</span>
                <input type="date" className="date-range-input" value={dateRange.to} onChange={(e) => setDateRange((p) => ({ ...p, to: e.target.value }))} />
              </div>
            </div>
          )}

          {activeTab === 'expiry' && (
            <div className="reports-filters">
              <Calendar size={15} className="text-muted" />
              <span className="reports-filter-label">Alert Period:</span>
              <select className="reports-select" value={expiryDays} onChange={(e) => setExpiryDays(parseInt(e.target.value))}>
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
              <select className="reports-select" value={stockThreshold} onChange={(e) => setStockThreshold(parseInt(e.target.value))}>
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

      {/* Segmented tabs */}
      <div className="segmented-tabs-container">
        <div className="segmented-tabs">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`segmented-tab ${activeTab === tab.id ? 'active' : ''}`}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass-card"><LoadingState label="Preparing your report…" height={260} /></div>
      ) : (!reportData.items || reportData.type !== activeTab || !hasData(reportData.items)) ? (
        <div className="glass-card">
          <EmptyState icon={AlertTriangle} title="No data found" message="No records match the selected criteria." height={260} />
        </div>
      ) : (!filteredItems || !hasData(filteredItems)) ? (
        <div className="glass-card">
          <EmptyState icon={Search} title="No results" message="No results match your filter query." height={260} />
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 16 }}>
          {renderSummaryCards()}

          {chart && (
            <div className="report-chart-container">
              <h4 className="report-chart-title">Visual Analytics</h4>
              <div style={{ height: 240, width: '100%', marginTop: 8 }}>{chart}</div>
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
                  { key: 'total_sales', label: 'Total Sales (₹)' },
                ]}
                onExportCSV={() => exportToCSV(filteredItems.sales, 'gst_summary')}
                onExportPDF={() => exportToPDF(filteredItems.sales, 'Sales GST Summary', [
                  { key: 'month', label: 'Month' },
                  { key: 'taxable_value', label: 'Taxable' },
                  { key: 'total_gst', label: 'GST' },
                  { key: 'total_sales', label: 'Total' },
                ])}
              />
              <ReportSection
                title="GST Breakup (CGST / SGST / IGST)"
                data={filteredItems.breakup}
                headers={[
                  { key: 'gst_percent', label: 'GST %' },
                  { key: 'taxable_value', label: 'Taxable (₹)' },
                  { key: 'cgst', label: 'CGST (₹)' },
                  { key: 'sgst', label: 'SGST (₹)' },
                  { key: 'igst', label: 'IGST (₹)' },
                  { key: 'gst_amount', label: 'Total GST (₹)' },
                ]}
                onExportCSV={() => exportToCSV(filteredItems.breakup, 'gst_breakup')}
                onExportPDF={() => exportToPDF(filteredItems.breakup, 'GST Breakup', [
                  { key: 'gst_percent', label: 'Rate (%)' },
                  { key: 'taxable_value', label: 'Taxable' },
                  { key: 'cgst', label: 'CGST' },
                  { key: 'sgst', label: 'SGST' },
                  { key: 'igst', label: 'IGST' },
                  { key: 'gst_amount', label: 'GST Amount' },
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
                { key: 'payment_mode', label: 'Mode' },
              ]}
              onExportCSV={() => exportToCSV(filteredItems, 'sales_summary')}
              onExportPDF={() => exportToPDF(filteredItems, 'Sales Summary Report', [
                { key: 'created_at', label: 'Date' },
                { key: 'invoice_number', label: 'Inv #' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'total_amount', label: 'Amount' },
                { key: 'payment_mode', label: 'Mode' },
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
                { key: 'quantity', label: 'Qty' },
              ]}
              onExportCSV={() => exportToCSV(filteredItems, 'h1_register')}
              onExportPDF={() => exportToPDF(filteredItems, 'Schedule H1 Drug Register', [
                { key: 'created_at', label: 'Date' },
                { key: 'patient_name', label: 'Patient' },
                { key: 'doctor_name', label: 'Doctor' },
                { key: 'brand_name', label: 'Medicine' },
                { key: 'quantity', label: 'Qty' },
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
                { key: 'quantity', label: 'Stock Left' },
              ]}
              onExportCSV={() => exportToCSV(filteredItems, 'expiry_report')}
              onExportPDF={() => exportToPDF(filteredItems, 'Medicine Expiry Report', [
                { key: 'brand_name', label: 'Medicine' },
                { key: 'batch_number', label: 'Batch' },
                { key: 'expiry_date', label: 'Expiry' },
                { key: 'quantity', label: 'Qty' },
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
                { key: 'total_stock', label: 'Stock' },
              ]}
              onExportCSV={() => exportToCSV(filteredItems, 'low_stock_report')}
              onExportPDF={() => exportToPDF(filteredItems, 'Low Stock Report', [
                { key: 'brand_name', label: 'Medicine' },
                { key: 'total_stock', label: 'Stock' },
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
                { key: 'current_balance', label: 'Balance (₹)' },
              ]}
              onExportCSV={() => exportToCSV(filteredItems, 'credit_report')}
              onExportPDF={() => exportToPDF(filteredItems, 'Customer Credit Report', [
                { key: 'name', label: 'Customer' },
                { key: 'phone', label: 'Phone' },
                { key: 'current_balance', label: 'Balance' },
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
                { key: 'outstanding', label: 'Pending (₹)' },
              ]}
              onExportCSV={() => exportToCSV(filteredItems, 'purchase_summary')}
              onExportPDF={() => exportToPDF(filteredItems, 'Supplier Purchase Summary', [
                { key: 'supplier_name', label: 'Supplier' },
                { key: 'total_bills', label: 'Bills' },
                { key: 'total_amount', label: 'Total' },
                { key: 'amount_paid', label: 'Paid' },
                { key: 'outstanding', label: 'Pending' },
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
                { key: 'gross_profit', label: 'Gross Profit (₹)' },
              ]}
              onExportCSV={() => exportToCSV(filteredItems, 'profitability_report')}
              onExportPDF={() => exportToPDF(filteredItems, 'Daily Profitability Report', [
                { key: 'sale_date', label: 'Date' },
                { key: 'bills', label: 'Bills' },
                { key: 'sales_value', label: 'Sales' },
                { key: 'purchase_cost', label: 'Cost' },
                { key: 'gross_profit', label: 'Profit' },
              ])}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReportSection({ title, data, headers, onExportCSV, onExportPDF }) {
  const columns = buildColumns(headers);
  return (
    <div className="glass-card">
      <div
        className="flex justify-between items-center mb-4"
        style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}
      >
        <h3 className="section-title" style={{ margin: 0 }}>{title}</h3>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" icon={Download} onClick={onExportPDF}>PDF</Button>
          <Button variant="secondary" size="sm" icon={FileText} onClick={onExportCSV}>CSV</Button>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={Array.isArray(data) ? data : []}
        rowKey={(r, i) => i}
        empty={<EmptyState message="No rows to display." height={140} />}
      />
    </div>
  );
}
