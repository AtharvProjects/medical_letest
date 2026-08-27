import React, { useState, useCallback, createContext, useContext, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';
import Bills from './pages/Bills';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import Doctors from './pages/Doctors';
import Suppliers from './pages/Suppliers';
import Purchases from './pages/Purchases';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import NonMovingMedicines from './pages/NonMovingMedicines';
import ErrorBoundary from './components/ErrorBoundary';
import Activation from './pages/Activation';
import { api } from './services/api';

export const ToastContext = createContext();
export const useToast = () => useContext(ToastContext);

const pages = {
  dashboard: Dashboard,
  billing: Billing,
  bills: Bills,
  inventory: Inventory,
  customers: Customers,
  doctors: Doctors,
  suppliers: Suppliers,
  purchases: Purchases,
  reports: Reports,
  settings: Settings,
  nonmoving: NonMovingMedicines,
};

function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [toasts, setToasts] = useState([]);
  const [isLicensed, setIsLicensed] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // Check license status on load
  useEffect(() => {
    api.get('/license/status')
      .then(res => {
        setIsLicensed(res.licensed);
      })
      .catch(() => {
        setIsLicensed(false);
      });
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    if (!isLicensed) return;

    const handleKeyDown = (e) => {
      // Avoid shortcuts when typing in inputs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        if (e.key === 'Escape') document.activeElement.blur();
        return;
      }

      switch(e.key) {
        case 'F1': e.preventDefault(); setActivePage('dashboard'); break;
        case 'F2': e.preventDefault(); setActivePage('billing'); break;
        case 'F3': e.preventDefault(); setActivePage('inventory'); break;
        case 'F4': e.preventDefault(); setActivePage('purchases'); break;
        case 'F5': e.preventDefault(); setActivePage('customers'); break;
        case 'F6': e.preventDefault(); setActivePage('doctors'); break;
        case 'F7': e.preventDefault(); setActivePage('suppliers'); break;
        case 'F8': e.preventDefault(); setActivePage('reports'); break;
        case 'F9': e.preventDefault(); setActivePage('settings'); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLicensed]);

  if (isLicensed === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-muted)', fontSize: 14, fontFamily: 'Inter, sans-serif' }}>
        Checking license status…
      </div>
    );
  }

  if (isLicensed === false) {
    return <Activation onActivated={() => setIsLicensed(true)} />;
  }

  const PageComponent = pages[activePage] || Dashboard;

  return (
    <ToastContext.Provider value={showToast}>
      <div className="app-layout">
        <Sidebar activePage={activePage} onNavigate={setActivePage} />
        <div className="main-content">
          <Header activePage={activePage} />
          <div className="page-content">
            <ErrorBoundary key={activePage}>
              <PageComponent onNavigate={setActivePage} />
            </ErrorBoundary>
          </div>
        </div>
      </div>
      <ToastContainer toasts={toasts} />
      {/* Keyboard shortcut hint */}
        <div style={{ position: 'fixed', bottom: 8, left: 12, fontSize: 10.5, color: 'var(--text-muted)', opacity: 0.65, pointerEvents: 'none', zIndex: 1000, fontWeight: 500 }}>
          F1 Dashboard · F2 Billing · F3 Inventory · F4 Purchases · F5 Customers · F6 Doctors · F7 Suppliers · F8 Reports · F9 Settings
        </div>
    </ToastContext.Provider>
  );
}
