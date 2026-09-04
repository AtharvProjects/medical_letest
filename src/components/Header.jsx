import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Search, Bell, ChevronDown } from 'lucide-react';
import logoMarkImg from '../assets/logo-mark.png';

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
  const [shopName, setShopName] = useState('AthassMediSync');

  useEffect(() => {
    api.getSettings().then(s => {
      if (s.shop_name) setShopName(s.shop_name);
    }).catch(() => {});
  }, []);

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

        {/* User avatar */}
        <div className="header-user">
          <div className="header-avatar" style={{ background: '#FAF5EE', border: '1px solid var(--border)', padding: 2 }}>
            <img src={logoMarkImg} alt="Brand" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          </div>
          <div className="header-user-info">
            <span className="header-user-name">{shopName}</span>
            <span className="header-user-role">Administrator</span>
          </div>
          <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>
    </header>
  );
}
