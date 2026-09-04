import React from 'react';
import { Home, Receipt, FileText, Package, ShoppingCart, Users, Stethoscope, Truck, BarChart3, Settings, Archive } from 'lucide-react';
import logoImg from '../assets/logo.png';

const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
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
        <img
          src={logoImg}
          alt="Athass MediSync — Pharmacy Management"
          style={{
            width: '100%',
            maxWidth: 198,
            height: 'auto',
            display: 'block',
            userSelect: 'none',
          }}
        />
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon 
              size={20}
              strokeWidth={activePage === item.id ? 2.2 : 1.8} 
            />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Promotional card */}
      <div className="sidebar-promo">
        <div className="promo-text">
          Better Care,<br/>
          Healthier Lives
        </div>
        <div className="promo-brand">
          Athass MediSync · v1.2.0
        </div>
      </div>
    </aside>
  );
}
