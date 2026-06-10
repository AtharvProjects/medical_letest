import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { IndianRupee, ShoppingBag, AlertTriangle, TrendingUp, CreditCard, Banknote, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getDashboard(), api.getDailyChart()])
      .then(([d, c]) => { setData(d); setChartData(c); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state"><p>Loading dashboard...</p></div>;
  if (!data) return <div className="empty-state"><p>Could not load dashboard data.</p></div>;

  const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div>
      <div className="stats-grid">
        <div className="glass-card stat-blue">
          <div className="card-title">Today's Sales</div>
          <div className="card-value">{fmt(data.today.total)}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{data.today.count} invoices</div>
        </div>
        <div className="glass-card stat-green">
          <div className="card-title">Cash</div>
          <div className="card-value small">{fmt(data.today.cash)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}><Banknote size={14} fill="var(--accent-mint)" fillOpacity={0.2}/> Cash sales today</div>
        </div>
        <div className="glass-card stat-purple">
          <div className="card-title">UPI</div>
          <div className="card-value small">{fmt(data.today.upi)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}><CreditCard size={14} fill="var(--accent-lavender)" fillOpacity={0.2}/> Digital payments</div>
        </div>
        <div className="glass-card stat-peach">
          <div className="card-title">Credit (Pending)</div>
          <div className="card-value small">{fmt(data.today.credit)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}><Clock size={14} fill="var(--accent-peach)" fillOpacity={0.2}/> Pending</div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="glass-card stat-green">
          <div className="card-title">Monthly Sales</div>
          <div className="card-value small">{fmt(data.monthly.sales)}</div>
        </div>
        <div className="glass-card stat-rose">
          <div className="card-title">Monthly Purchases</div>
          <div className="card-value small">{fmt(data.monthly.purchases)}</div>
        </div>
        <div className="glass-card stat-blue">
          <div className="card-title">Monthly Profit</div>
          <div className="card-value small">{fmt(data.monthly.profit)}</div>
        </div>
      </div>

      {/* Sales Chart */}
      <div className="glass-card mb-4">
        <div className="card-title">Last 7 Days Sales</div>
        <div style={{ height: 220, marginTop: 12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-muted)' }} 
                tickFormatter={d => new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-muted)' }} 
                tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'k'} 
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                contentStyle={{ 
                  background: 'rgba(255,255,255,0.8)', 
                  backdropFilter: 'blur(10px)', 
                  borderRadius: '12px', 
                  border: '1px solid var(--border-glass)',
                  boxShadow: 'var(--shadow-md)',
                  fontSize: '12px',
                  fontWeight: '600'
                }}
                formatter={v => fmt(v)} 
                labelFormatter={d => new Date(d + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} 
              />
              <Bar dataKey="total" fill="var(--accent-blue)" radius={[8, 8, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="two-col">
        {/* Low Stock */}
        <div className="glass-card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} fill="var(--accent-peach)" fillOpacity={0.2} style={{ color: 'var(--accent-peach)' }} />
            <span className="section-title" style={{ margin: 0 }}>Low Stock Alert</span>
          </div>
          {data.lowStock.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13 }}>All medicines adequately stocked</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Medicine</th><th>Company</th><th className="text-right">Stock</th></tr></thead>
              <tbody>
                {data.lowStock.map((m, i) => (
                  <tr key={i}>
                    <td>{m.brand_name}</td>
                    <td className="text-muted">{m.company_name}</td>
                    <td className="text-right"><span className="badge badge-red">{m.total_stock}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Expiry Alert */}
        <div className="glass-card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} fill="var(--accent-rose)" fillOpacity={0.2} style={{ color: 'var(--accent-rose)' }} />
            <span className="section-title" style={{ margin: 0 }}>Expiry Alert</span>
          </div>
          {data.expiring.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13 }}>No medicines expiring soon</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th className="text-right">Qty</th></tr></thead>
              <tbody>
                {data.expiring.map((b, i) => {
                  const isExpired = new Date(b.expiry_date) < new Date();
                  return (
                    <tr key={i}>
                      <td>{b.brand_name}</td>
                      <td className="text-muted">{b.batch_number}</td>
                      <td><span className={`badge ${isExpired ? 'badge-red' : 'badge-yellow'}`}>{b.expiry_date}</span></td>
                      <td className="text-right">{b.quantity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="two-col mt-4">
        {/* Fast Moving */}
        <div className="glass-card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} fill="var(--accent-mint)" fillOpacity={0.2} style={{ color: 'var(--accent-mint)' }} />
            <span className="section-title" style={{ margin: 0 }}>Fast Moving Medicines</span>
          </div>
          {data.fastMoving.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13 }}>No sales data yet</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Medicine</th><th>Company</th><th className="text-right">Sold</th></tr></thead>
              <tbody>
                {data.fastMoving.map((m, i) => (
                  <tr key={i}>
                    <td>{m.brand_name}</td>
                    <td className="text-muted">{m.company_name}</td>
                    <td className="text-right"><span className="badge badge-green">{m.total_sold}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Invoices */}
        <div className="glass-card">
          <div className="section-title">Recent Invoices</div>
          {data.recentInvoices.length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13 }}>No invoices yet</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Invoice</th><th>Customer</th><th>Mode</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {data.recentInvoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontSize: 12 }}>{inv.invoice_number}</td>
                    <td>{inv.customer_name || 'Walk-in'}</td>
                    <td><span className={`badge ${inv.payment_mode === 'Cash' ? 'badge-green' : inv.payment_mode === 'UPI' ? 'badge-blue' : 'badge-yellow'}`}>{inv.payment_mode}</span></td>
                    <td className="text-right">{fmt(inv.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {data.totalOutstanding > 0 && (
        <div className="glass-card mt-4 stat-rose">
          <div className="card-title">Total Outstanding (Pending)</div>
          <div className="card-value">{fmt(data.totalOutstanding)}</div>
        </div>
      )}
    </div>
  );
}
