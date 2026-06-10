import React from 'react';
import { LayoutDashboard, Receipt, FileText, Package, ShoppingCart, Users, Stethoscope, Truck, BarChart3, Settings, Archive } from 'lucide-react';

const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'billing', label: 'Billing', icon: Receipt },
    { id: 'bills', label: 'Bills List', icon: FileText },
    { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'doctors', label: 'Doctors', icon: Stethoscope },
  { id: 'suppliers', label: 'Suppliers', icon: Truck },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'nonmoving', label: 'Non-Moving', icon: Archive },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>Athass<br/>MediSync</h1>
        <div className="subtitle">Pharmacy Management</div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon 
              strokeWidth={activePage === item.id ? 2.5 : 2} 
              fill={activePage === item.id ? "currentColor" : "none"} 
              fillOpacity={activePage === item.id ? 0.2 : 0}
            />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer" style={{ padding: '0 16px', marginTop: 'auto' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>SYSTEM V1.2.0</div>
      </div>
    </aside>
  );
}
