import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  IndianRupee, ShoppingBag, AlertTriangle, TrendingUp, CreditCard,
  Banknote, Clock, Wallet, Receipt, PackageX,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { inr, formatDate, daysUntil } from '../utils/format';
import { StatCard, DataTable, Badge, EmptyState, LoadingState } from '../components/ui';

/** Section panel: a titled card that hosts a DataTable. */
function Panel({ icon: Icon, title, children }) {
  return (
    <div className="glass-card">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon size={18} style={{ color: 'var(--text-muted)' }} />}
        <span className="section-title" style={{ margin: 0 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([api.getDashboard(), api.getDailyChart()])
      .then(([d, c]) => { setData(d); setChartData(Array.isArray(c) ? c : []); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label="Loading dashboard…" height={320} />;
  if (error || !data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load dashboard"
        message="There was a problem fetching dashboard data. Please try again."
        height={320}
      />
    );
  }

  const { today, monthly, lowStock, expiring, fastMoving, recentInvoices, totalOutstanding } = data;

  const lowStockColumns = [
    { header: 'Medicine', render: (m) => <span style={{ fontWeight: 500 }}>{m.brand_name}</span> },
    { header: 'Company', render: (m) => <span className="text-muted">{m.company_name || '—'}</span> },
    { header: 'Stock', align: 'right', render: (m) => <Badge tone="red">{m.total_stock}</Badge> },
  ];

  const expiryColumns = [
    { header: 'Medicine', render: (b) => <span style={{ fontWeight: 500 }}>{b.brand_name}</span> },
    { header: 'Batch', render: (b) => <span className="text-muted">{b.batch_number}</span> },
    {
      header: 'Expiry',
      render: (b) => {
        const expired = (daysUntil(b.expiry_date) ?? 0) < 0;
        return <Badge tone={expired ? 'red' : 'yellow'}>{formatDate(b.expiry_date)}</Badge>;
      },
    },
    { header: 'Qty', align: 'right', render: (b) => b.quantity },
  ];

  const fastMovingColumns = [
    { header: 'Medicine', render: (m) => <span style={{ fontWeight: 500 }}>{m.brand_name}</span> },
    { header: 'Company', render: (m) => <span className="text-muted">{m.company_name || '—'}</span> },
    { header: 'Sold', align: 'right', render: (m) => <Badge tone="green">{m.total_sold}</Badge> },
  ];

  const modeTone = (mode) => (mode === 'Cash' ? 'green' : mode === 'UPI' ? 'purple' : mode === 'Pending' ? 'red' : 'gray');
  const recentColumns = [
    { header: 'Invoice', render: (inv) => <span style={{ fontSize: 12, fontWeight: 600 }}>{inv.invoice_number}</span> },
    { header: 'Customer', render: (inv) => inv.customer_name || 'Walk-in' },
    { header: 'Mode', render: (inv) => <Badge tone={modeTone(inv.payment_mode)}>{inv.payment_mode}</Badge> },
    { header: 'Amount', align: 'right', render: (inv) => <span style={{ fontWeight: 600 }}>{inr(inv.total_amount)}</span> },
  ];

  return (
    <div>
      {/* Today */}
      <div className="stats-grid">
        <StatCard label="Today's Sales" value={inr(today.total)} accent="blue" icon={IndianRupee} sub={`${today.count} invoice${today.count === 1 ? '' : 's'}`} />
        <StatCard label="Cash" value={inr(today.cash)} accent="green" icon={Banknote} sub="Cash sales today" />
        <StatCard label="UPI" value={inr(today.upi)} accent="purple" icon={CreditCard} sub="Digital payments" />
        <StatCard label="Credit (Pending)" value={inr(today.credit)} accent="amber" icon={Clock} sub="Billed on credit today" />
      </div>

      {/* This month */}
      <div className="stats-grid">
        <StatCard label="Monthly Sales" value={inr(monthly.sales)} accent="green" icon={TrendingUp} />
        <StatCard label="Monthly Purchases" value={inr(monthly.purchases)} accent="red" icon={ShoppingBag} />
        <StatCard label="Monthly Profit" value={inr(monthly.profit)} accent="blue" icon={IndianRupee} sub="Gross margin this month" />
        <StatCard label="Total Outstanding" value={inr(totalOutstanding)} accent="red" icon={Wallet} sub="All pending credit" />
      </div>

      {/* Sales chart */}
      <div className="glass-card mb-4">
        <div className="section-title">Last 7 Days Sales</div>
        <div style={{ height: 220, marginTop: 12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-muted)' }}
                tickFormatter={(d) => new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-muted)' }}
                tickFormatter={(v) => '₹' + (v / 1000).toFixed(0) + 'k'}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--primary-bg)' }}
                contentStyle={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-md)',
                  fontSize: '12px',
                  fontWeight: '600',
                }}
                formatter={(v) => [inr(v), 'Sales']}
                labelFormatter={(d) => new Date(d + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
              />
              <Bar dataKey="total" fill="var(--primary)" radius={[6, 6, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Low stock + expiry */}
      <div className="two-col">
        <Panel icon={AlertTriangle} title="Low Stock Alert">
          <DataTable
            columns={lowStockColumns}
            rows={lowStock}
            rowKey={(m, i) => i}
            empty={<EmptyState icon={PackageX} title="All stocked" message="All medicines are adequately stocked." height={160} />}
          />
        </Panel>

        <Panel icon={Clock} title="Expiry Alert">
          <DataTable
            columns={expiryColumns}
            rows={expiring}
            rowKey={(b, i) => i}
            empty={<EmptyState icon={Clock} title="Nothing expiring" message="No medicines are expiring soon." height={160} />}
          />
        </Panel>
      </div>

      {/* Fast moving + recent invoices */}
      <div className="two-col mt-4">
        <Panel icon={TrendingUp} title="Fast Moving Medicines">
          <DataTable
            columns={fastMovingColumns}
            rows={fastMoving}
            rowKey={(m, i) => i}
            empty={<EmptyState icon={TrendingUp} title="No sales yet" message="Fast-moving items appear once you record sales." height={160} />}
          />
        </Panel>

        <Panel icon={Receipt} title="Recent Invoices">
          <DataTable
            columns={recentColumns}
            rows={recentInvoices}
            empty={<EmptyState icon={Receipt} title="No invoices yet" message="Recent bills will show up here." height={160} />}
          />
        </Panel>
      </div>
    </div>
  );
}
