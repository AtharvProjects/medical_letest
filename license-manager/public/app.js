// State
let token = localStorage.getItem('ams_admin_token') || null;
let currentAdmin = null;
let licenses = [];
let currentFilter = 'all';
let searchQuery = '';
let activeLicenseForAction = null;

// DOM Elements
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginForm = document.getElementById('loginForm');
const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const loginError = document.getElementById('loginError');
const navAdminName = document.getElementById('navAdminName');
const btnLogout = document.getElementById('btnLogout');
const btnNewLicense = document.getElementById('btnNewLicense');
const searchInput = document.getElementById('searchInput');
const filterTabs = document.querySelectorAll('.tab-btn');
const licensesTableBody = document.getElementById('licensesTableBody');
const emptyState = document.getElementById('emptyState');
const toastEl = document.getElementById('toast');

// Stat Elements
const statTotal = document.getElementById('statTotal');
const statActive = document.getElementById('statActive');
const statExpired = document.getElementById('statExpired');
const statSuspended = document.getElementById('statSuspended');

// API Helper
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    logout();
    throw new Error('Session expired. Please log in again.');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// Toast
let toastTimeout = null;
function showToast(msg, duration = 3000) {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastTimeout = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, duration);
}

// Init
window.addEventListener('DOMContentLoaded', async () => {
  if (token) {
    try {
      const data = await api('/api/admin/me');
      currentAdmin = data.admin;
      showDashboard();
    } catch {
      showLogin();
    }
  } else {
    showLogin();
  }
});

function showLogin() {
  loginSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
}

function showDashboard() {
  loginSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  if (currentAdmin) {
    navAdminName.textContent = currentAdmin.username;
  }
  loadStats();
  loadLicenses();
}

function logout() {
  token = null;
  localStorage.removeItem('ams_admin_token');
  showLogin();
}

btnLogout.addEventListener('click', logout);

// Login Form
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  const user = loginUser.value.trim();
  const pass = loginPass.value;

  try {
    const res = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: user, password: pass })
    });
    token = res.token;
    localStorage.setItem('ams_admin_token', token);
    currentAdmin = res.admin;
    showToast('Signed in successfully!');
    showDashboard();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
});

// Load Stats
async function loadStats() {
  try {
    const stats = await api('/api/admin/stats');
    statTotal.textContent = stats.total;
    statActive.textContent = stats.active;
    statExpired.textContent = stats.expired;
    statSuspended.textContent = stats.suspended;
  } catch (err) {
    console.error('Stats failed:', err);
  }
}

// Load Licenses
async function loadLicenses() {
  try {
    let url = `/api/admin/licenses?status=${currentFilter}`;
    if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
    const data = await api(url);
    licenses = data.licenses;
    renderLicenses();
  } catch (err) {
    showToast(err.message);
  }
}

// Render Licenses
function renderLicenses() {
  if (!licenses || licenses.length === 0) {
    licensesTableBody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  licensesTableBody.innerHTML = licenses
    .map((lic) => {
      const isSuspended = lic.status === 'suspended' || lic.status === 'revoked';
      const isExp = lic.effective_status === 'expired';
      
      let badgeClass = 'badge-active';
      let statusText = 'Active';
      if (isSuspended) {
        badgeClass = 'badge-suspended';
        statusText = 'Suspended';
      } else if (isExp) {
        badgeClass = 'badge-expired';
        statusText = 'Expired';
      }

      const expiryDisplay = lic.expires_at === '9999-12-31' ? 'Lifetime' : lic.expires_at;
      const hwidDisplay = lic.hwid ? `<span class="hwid-text" title="${lic.hwid}">${lic.hwid}</span>` : '<span style="color: var(--text-dim); font-size: 11px;">(Unbound / Any)</span>';
      const pingDisplay = lic.last_ping ? `<span style="font-size: 11px; color: var(--text-muted);">${formatDate(lic.last_ping)}</span>` : '<span style="color: var(--text-dim); font-size: 11px;">Never</span>';

      return `
        <tr>
          <td>
            <div class="client-info">
              <span class="name">${escapeHtml(lic.client_name)}</span>
              <span class="store">🏥 ${escapeHtml(lic.store_name)}</span>
            </div>
          </td>
          <td>
            <div class="key-badge" onclick="copyToClipboard('${lic.license_key}', 'License Key')" title="Click to copy" style="cursor: pointer;">
              <span>${lic.license_key}</span>
              <span style="font-size: 10px; opacity: 0.7;">📋</span>
            </div>
          </td>
          <td>
            ${lic.phone ? `
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 12px;">${escapeHtml(lic.phone)}</span>
                <button class="btn btn-icon btn-whatsapp btn-sm" onclick="openWhatsAppModal(${lic.id})" title="Send via WhatsApp">
                  📱
                </button>
              </div>
            ` : '<span style="color: var(--text-dim); font-size: 11px;">None</span>'}
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              ${hwidDisplay}
              ${lic.hwid ? `<button class="btn btn-ghost btn-icon btn-sm" onclick="resetHwid(${lic.id})" title="Reset machine binding (allows moving to new PC)">🔄</button>` : ''}
            </div>
          </td>
          <td>
            <div style="font-size: 12px; font-weight: 500;">
              ${expiryDisplay}
            </div>
            <div style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">
              ${lic.plan_type.replace('_', ' ')}
            </div>
          </td>
          <td>
            <span class="badge ${badgeClass}">${statusText}</span>
          </td>
          <td>
            ${pingDisplay}
          </td>
          <td>
            <div class="action-group">
              <button class="btn btn-ghost btn-sm" onclick="openOfflineKeyModal(${lic.id})" title="View Offline RSA Key">
                🔐 Offline
              </button>
              <button class="btn btn-ghost btn-sm" onclick="openExtendModal(${lic.id})" title="Extend License">
                ⏱ Extend
              </button>
              <button class="btn btn-ghost btn-sm ${isSuspended ? 'btn-outline' : ''}" onclick="toggleStatus(${lic.id}, '${lic.status}')" title="${isSuspended ? 'Resume License' : 'Suspend License'}">
                ${isSuspended ? '🟢 Resume' : '🛑 Block'}
              </button>
              <button class="btn btn-ghost btn-sm btn-danger" onclick="deleteLicense(${lic.id})" title="Delete License">
                🗑
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

// Search and Filters
let searchDebounce = null;
searchInput.addEventListener('input', (e) => {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = e.target.value.trim();
    loadLicenses();
  }, 300);
});

filterTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    filterTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.status;
    loadLicenses();
  });
});

// Modal Helpers
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// 1. Create New License
btnNewLicense.addEventListener('click', () => {
  document.getElementById('formNewLicense').reset();
  document.getElementById('nlCustomDateGroup').classList.add('hidden');
  openModal('modalNewLicense');
});

document.getElementById('nlPlanType').addEventListener('change', (e) => {
  const customGroup = document.getElementById('nlCustomDateGroup');
  if (e.target.value === 'custom') {
    customGroup.classList.remove('hidden');
  } else {
    customGroup.classList.add('hidden');
  }
});

document.getElementById('formNewLicense').addEventListener('submit', async (e) => {
  e.preventDefault();
  const client_name = document.getElementById('nlClientName').value.trim();
  const store_name = document.getElementById('nlStoreName').value.trim();
  const phone = document.getElementById('nlPhone').value.trim();
  const email = document.getElementById('nlEmail').value.trim();
  const plan_type = document.getElementById('nlPlanType').value;
  const custom_expiry = document.getElementById('nlCustomDate').value;
  const hwid = document.getElementById('nlHwid').value.trim();
  const notes = document.getElementById('nlNotes').value.trim();

  try {
    const res = await api('/api/admin/licenses', {
      method: 'POST',
      body: JSON.stringify({
        client_name,
        store_name,
        phone,
        email,
        plan_type,
        custom_expiry,
        hwid,
        notes
      })
    });

    closeModal('modalNewLicense');
    showToast(`License created: ${res.license.license_key}`);
    loadStats();
    loadLicenses();

    // If phone provided, prompt WhatsApp share
    if (phone) {
      openWhatsAppModal(res.license.id);
    }
  } catch (err) {
    showToast(err.message);
  }
});

// 2. Extend Modal
function openExtendModal(id) {
  const lic = licenses.find((l) => l.id === id);
  if (!lic) return;
  activeLicenseForAction = lic;
  document.getElementById('extendLicId').value = id;
  document.getElementById('extendClientInfo').innerHTML = `
    Extending license for <strong>${escapeHtml(lic.client_name)}</strong> (${escapeHtml(lic.store_name)})<br>
    Current Expiry: <strong>${lic.expires_at === '9999-12-31' ? 'Lifetime' : lic.expires_at}</strong>
  `;
  document.getElementById('extendCustomDate').value = '';
  openModal('modalExtend');
}

async function setExtendDays(days) {
  if (!activeLicenseForAction) return;
  try {
    const res = await api(`/api/admin/licenses/${activeLicenseForAction.id}/extend`, {
      method: 'POST',
      body: JSON.stringify({ days })
    });
    closeModal('modalExtend');
    showToast(`Extended! New expiry: ${res.expires_at}`);
    loadStats();
    loadLicenses();
  } catch (err) {
    showToast(err.message);
  }
}

document.getElementById('formExtend').addEventListener('submit', async (e) => {
  e.preventDefault();
  const customDate = document.getElementById('extendCustomDate').value;
  if (!customDate) {
    showToast('Please select a custom expiry date or click a quick duration button.');
    return;
  }
  if (!activeLicenseForAction) return;

  try {
    const res = await api(`/api/admin/licenses/${activeLicenseForAction.id}/extend`, {
      method: 'POST',
      body: JSON.stringify({ days: 'custom', customDate })
    });
    closeModal('modalExtend');
    showToast(`Extended! New expiry: ${res.expires_at}`);
    loadStats();
    loadLicenses();
  } catch (err) {
    showToast(err.message);
  }
});

// 3. Status Toggle
async function toggleStatus(id, currentStatus) {
  const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
  const actionName = newStatus === 'suspended' ? 'suspend' : 'resume';
  if (!confirm(`Are you sure you want to ${actionName} this client license?`)) return;

  try {
    await api(`/api/admin/licenses/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: newStatus })
    });
    showToast(`License marked as ${newStatus}`);
    loadStats();
    loadLicenses();
  } catch (err) {
    showToast(err.message);
  }
}

// 4. Reset HWID
async function resetHwid(id) {
  if (!confirm('Resetting the hardware binding will allow the client to activate this license on a new PC. Proceed?')) return;
  try {
    await api(`/api/admin/licenses/${id}/reset-hwid`, { method: 'POST' });
    showToast('Hardware binding reset successfully');
    loadLicenses();
  } catch (err) {
    showToast(err.message);
  }
}

// 5. Delete License
async function deleteLicense(id) {
  if (!confirm('Are you sure you want to permanently delete this license record?')) return;
  try {
    await api(`/api/admin/licenses/${id}`, { method: 'DELETE' });
    showToast('License deleted');
    loadStats();
    loadLicenses();
  } catch (err) {
    showToast(err.message);
  }
}

// 6. Offline RSA Key Modal
async function openOfflineKeyModal(id) {
  const lic = licenses.find((l) => l.id === id);
  if (!lic) return;

  try {
    let hwid = lic.hwid;
    if (!hwid) {
      hwid = prompt('This license is not yet bound to a machine. Please enter the client\'s Hardware ID:');
      if (!hwid) return;
    }

    const res = await api(`/api/admin/licenses/${id}/offline-key?hwid=${encodeURIComponent(hwid)}`);
    document.getElementById('offHwidDisplay').value = res.hwid;
    document.getElementById('offKeyDisplay').value = res.offlineKey;
    openModal('modalOfflineKey');
  } catch (err) {
    showToast(err.message);
  }
}

document.getElementById('btnCopyOfflineKey').addEventListener('click', () => {
  const key = document.getElementById('offKeyDisplay').value;
  copyToClipboard(key, 'Offline License Key');
});

// 7. WhatsApp Share Modal
function openWhatsAppModal(id) {
  const lic = licenses.find((l) => l.id === id);
  if (!lic) return;
  activeLicenseForAction = lic;

  const phone = lic.phone ? lic.phone.replace(/[^0-9]/g, '') : '';
  document.getElementById('waRecipientPhone').value = lic.phone || '';

  const expiryText = lic.expires_at === '9999-12-31' ? 'Lifetime Access' : lic.expires_at;

  const msg = 
`*AthassMediSync — Software Activation*

Hello *${lic.client_name}*,
Here are your official software activation credentials for *${lic.store_name}*:

🔑 *License Key:* ${lic.license_key}
⏳ *Validity:* ${expiryText}

*How to Activate:*
1. Open AthassMediSync on your computer.
2. In the Activation window, enter your License Key above.
3. Click *"Activate Online"*.

If you need any support, feel free to reply to this message.
Thank you for choosing AthassMediSync!`;

  document.getElementById('waMessagePreview').value = msg;
  openModal('modalWhatsApp');
}

document.getElementById('btnSendWhatsApp').addEventListener('click', () => {
  const rawPhone = document.getElementById('waRecipientPhone').value.replace(/[^0-9]/g, '');
  const msg = document.getElementById('waMessagePreview').value;
  if (!rawPhone) {
    showToast('Please enter a valid phone number');
    return;
  }

  // Prepend 91 for Indian numbers if not starting with country code
  let formattedPhone = rawPhone;
  if (formattedPhone.length === 10) {
    formattedPhone = '91' + formattedPhone;
  }

  const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
  closeModal('modalWhatsApp');
});

// 8. Change Password Modal
document.getElementById('btnChangePass').addEventListener('click', () => {
  document.getElementById('formChangePass').reset();
  document.getElementById('passAlert').classList.add('hidden');
  openModal('modalPass');
});

document.getElementById('formChangePass').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById('passAlert');
  alertBox.classList.add('hidden');

  const currentPassword = document.getElementById('passCurrent').value;
  const newPassword = document.getElementById('passNew').value;
  const confirmPassword = document.getElementById('passConfirm').value;

  if (newPassword !== confirmPassword) {
    alertBox.textContent = 'New passwords do not match';
    alertBox.classList.remove('hidden');
    return;
  }

  try {
    await api('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    closeModal('modalPass');
    showToast('Password updated successfully!');
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.classList.remove('hidden');
  }
});

// 9. Backup & Restore Modal
document.getElementById('btnBackup').addEventListener('click', () => {
  openModal('modalBackup');
});

document.getElementById('btnExportJson').addEventListener('click', () => {
  window.open(`/api/admin/export?token=${token}`, '_blank');
});

document.getElementById('fileRestoreJson').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!data.licenses || !Array.isArray(data.licenses)) {
        throw new Error('Invalid JSON structure. Must contain a licenses array.');
      }

      const res = await api('/api/admin/import', {
        method: 'POST',
        body: JSON.stringify({ licenses: data.licenses })
      });

      showToast(res.message);
      closeModal('modalBackup');
      loadStats();
      loadLicenses();
    } catch (err) {
      alert(`Import error: ${err.message}`);
    }
  };
  reader.readAsText(file);
});

// Helper utilities
function copyToClipboard(text, label = 'Copied') {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`${label} copied to clipboard!`);
  }).catch(() => {
    showToast('Failed to copy');
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
