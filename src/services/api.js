export let BASE_URL = 'http://localhost:3001';

if (typeof window !== 'undefined') {
  // Try to use the network address if loaded via a web browser on LAN
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    if (window.location.port !== '5173' && window.location.port !== '5174') {
      BASE_URL = `${window.location.protocol}//${window.location.hostname}:3001`;
    }
  }
  
  // Custom network server URL set in Settings
  const savedUrl = localStorage.getItem('network_server_url');
  if (savedUrl) {
    BASE_URL = savedUrl;
  }
}

const API = `${BASE_URL}/api`;
async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  
  const contentType = res.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    data = { error: text || res.statusText };
  }

  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Medicines
  getMedicines: (search = '') => request(`/medicines?search=${encodeURIComponent(search)}`),
  getMedicineCategories: () => request('/medicines-categories'),
  getMedicine: (id) => request(`/medicines/${id}`),
    createMedicine: (data) => request('/medicines', { method: 'POST', body: JSON.stringify(data) }),
    updateMedicine: (id, data) => request(`/medicines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteMedicine: (id) => request(`/medicines/${id}`, { method: 'DELETE' }),
  
    // Batches
    getBatches: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/batches?${q}`);
    },
    createBatch: (data) => request('/batches', { method: 'POST', body: JSON.stringify(data) }),
    updateBatch: (id, data) => request(`/batches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteBatch: (id) => request(`/batches/${id}`, { method: 'DELETE' }),
    writeOffBatch: (id) => request(`/batches/${id}/write-off`, { method: 'POST' }),
    discountBatch: (id, selling_rate) => request(`/batches/${id}/discount`, { method: 'PUT', body: JSON.stringify({ selling_rate }) }),
  
    // Customers
    getCustomers: (search = '') => request(`/customers?search=${encodeURIComponent(search)}`),
    getCustomer: (id) => request(`/customers/${id}`),
    createCustomer: (data) => request('/customers', { method: 'POST', body: JSON.stringify(data) }),
    updateCustomer: (id, data) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCustomer: (id) => request(`/customers/${id}`, { method: 'DELETE' }),
    payCredit: (id, amount) => request(`/customers/${id}/pay-credit`, { method: 'POST', body: JSON.stringify({ amount }) }),
  
    // Doctors
    getDoctors: (search = '') => request(`/doctors?search=${encodeURIComponent(search)}`),
    createDoctor: (data) => request('/doctors', { method: 'POST', body: JSON.stringify(data) }),
    updateDoctor: (id, data) => request(`/doctors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteDoctor: (id) => request(`/doctors/${id}`, { method: 'DELETE' }),
  
    // Suppliers
    getSuppliers: (search = '') => request(`/suppliers?search=${encodeURIComponent(search)}`),
    createSupplier: (data) => request('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
    updateSupplier: (id, data) => request(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteSupplier: (id) => request(`/suppliers/${id}`, { method: 'DELETE' }),


  // Invoices
  getInvoices: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/invoices?${q}`);
  },
  getInvoice: (id) => request(`/invoices/${id}`),
    createInvoice: (data) => request('/invoices', { method: 'POST', body: JSON.stringify(data) }),
    deleteInvoice: (id) => request(`/invoices/${id}`, { method: 'DELETE' }),

    // Purchases
  getPurchases: () => request('/purchases'),
  getPurchase: (id) => request(`/purchases/${id}`),
  createPurchase: (data) => request('/purchases', { method: 'POST', body: JSON.stringify(data) }),

  // Dashboard
  getDashboard: () => request('/dashboard'),

  // Reports
  getSalesReport: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/reports/sales?${q}`);
  },
  getProfitReport: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/reports/profit?${q}`);
  },
  getNonMovingReport: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/reports/non-moving?${q}`);
  },
    getOutstandingReport: () => request('/reports/outstanding'),
    getDailyChart: () => request('/reports/daily-chart'),
    getH1RegisterReport: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/reports/h1-register?${q}`);
    },

    // WhatsApp
    getWhatsAppStatus: () => request('/whatsapp/status'),
    sendWhatsAppPdf: (data) => request('/whatsapp/send-pdf', { method: 'POST', body: JSON.stringify(data) }),
    logoutWhatsApp: () => request('/whatsapp/logout', { method: 'POST' }),
    restartWhatsApp: () => request('/whatsapp/restart', { method: 'POST' }),
    connectWhatsApp: () => request('/whatsapp/connect', { method: 'POST' }),

    // Generic

  get: (url, params) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request(`${url}${q}`);
  },
  post: (url, data) => request(url, { method: 'POST', body: JSON.stringify(data) }),
  put: (url, data) => request(url, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (url) => request(url, { method: 'DELETE' }),

  // ── CSV Import / Export / Update ──────────────────────────────────────

  // Medicines
  exportMedicinesCSV: () => fetchCSVText('/medicines/export/csv'),
  importMedicinesCSV: (text) => postCSVText('/medicines/import/csv', text),
  updateMedicinesCSV: (text) => putCSVText('/medicines/import/csv', text),

  // Customers
  exportCustomersCSV: () => fetchCSVText('/customers/export/csv'),
  importCustomersCSV: (text) => postCSVText('/customers/import/csv', text),
  updateCustomersCSV: (text) => putCSVText('/customers/import/csv', text),

  // Doctors
  exportDoctorsCSV: () => fetchCSVText('/doctors/export/csv'),
  importDoctorsCSV: (text) => postCSVText('/doctors/import/csv', text),
  updateDoctorsCSV: (text) => putCSVText('/doctors/import/csv', text),

  // Suppliers
  exportSuppliersCSV: () => fetchCSVText('/suppliers/export/csv'),
  importSuppliersCSV: (text) => postCSVText('/suppliers/import/csv', text),
  updateSuppliersCSV: (text) => putCSVText('/suppliers/import/csv', text),
};

// ── CSV helpers (text/csv content type) ─────────────────────────────────

async function fetchCSVText(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Export failed');
  }
  return res.text();
}

async function postCSVText(path, text) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: text,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Import failed');
  return data;
}

async function putCSVText(path, text) {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/csv' },
    body: text,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  return data;
}

