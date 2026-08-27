import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

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
        <div className="trademark-container">
           <div className="trademark-text">{shopName}</div>
        </div>
      </div>
    </header>
  );
}
