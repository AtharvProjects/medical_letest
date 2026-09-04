import React from 'react';
import { Search, Bell } from 'lucide-react';

const pageLabels = {
  dashboard: 'Dashboard',
  billing: 'New Bill',
  bills: 'Bills List',
  inventory: 'Inventory',
  purchases: 'Purchases',
  customers: 'Customers',
  doctors: 'Doctors',
  suppliers: 'Suppliers',
  reports: 'Reports',
  nonmoving: 'Non-Moving Medicines',
  settings: 'Settings',
};

export default function Header({ activePage }) {
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <header className="header">
      <div className="header-left">
        <h2 className="header-title">{pageLabels[activePage] || 'Dashboard'}</h2>
        <span className="header-date">{today}</span>
      </div>
      <div className="header-right">
        {/* Global search hint */}
        <div className="header-search">
          <Search size={14} />
          <span>Search medicines, customers, invoices…</span>
          <span className="header-search-kbd">Ctrl K</span>
        </div>

        {/* Notification bell */}
        <div className="header-bell" title="Notifications">
          <Bell size={16} />
        </div>
      </div>
    </header>
  );
}
