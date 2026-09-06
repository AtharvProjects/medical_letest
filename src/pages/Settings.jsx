import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { INDIAN_STATES } from '../utils/states';
import { Save, Settings as SettingsIcon, Bell, Network, Building2, ShieldCheck, RefreshCw, Globe, Check, Copy } from 'lucide-react';
import WhatsAppSetup from '../components/WhatsAppSetup';
import BackupRestore from '../components/BackupRestore';
import { Button, FormField, Input, Select, Textarea, LoadingState } from '../components/ui';

/** A titled card section header (icon + title + divider). */
function SectionHead({ icon: Icon, title }) {
  return (
    <div
      className="flex items-center gap-2 mb-4"
      style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}
    >
      {Icon && <Icon size={17} style={{ color: 'var(--primary)' }} />}
      <span className="section-title" style={{ margin: 0 }}>{title}</span>
    </div>
  );
}

export default function Settings() {
  const showToast = useToast();
  const [settings, setSettings] = useState({
    shop_name: '',
    shop_address: '',
    shop_phone: '',
    shop_email: '',
    shop_gst: '',
    shop_dl: '',
    shop_state: '',
    low_stock_threshold: '10',
    expiry_alert_days: '90',
    whatsapp_enabled: 'true',
    whatsapp_auto_send: 'true',
    whatsapp_instance_id: '',
    whatsapp_access_token: '',
  });
  const [networkUrl, setNetworkUrl] = useState(localStorage.getItem('network_server_url') || '');
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [licenseServerUrl, setLicenseServerUrl] = useState('');
  const [syncingLicense, setSyncingLicense] = useState(false);
  const [copiedHwid, setCopiedHwid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchLicenseStatus = async () => {
    try {
      const data = await api.get('/license/status');
      setLicenseInfo(data);
      if (data.cloudServerUrl) {
        setLicenseServerUrl(data.cloudServerUrl);
      }
    } catch (e) {
      console.warn('Failed to load license status:', e.message);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [settingsData] = await Promise.all([
          api.get('/settings'),
          fetchLicenseStatus()
        ]);
        setSettings((prev) => ({ ...prev, ...settingsData }));
      } catch (err) {
        showToast('Failed to load settings', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSyncLicense = async () => {
    setSyncingLicense(true);
    try {
      const res = await api.post('/license/cloud-sync');
      if (res.valid) {
        showToast(`License verified with cloud! (Valid until ${res.expiresAt === '9999-12-31' ? 'Lifetime' : res.expiresAt})`, 'success');
      } else if (res.status === 'suspended') {
        showToast('License has been suspended by administrator!', 'error');
      } else {
        showToast(res.message || 'License sync completed.', 'info');
      }
      await fetchLicenseStatus();
    } catch (err) {
      showToast(err.message || 'Failed to sync with cloud license server.', 'error');
    } finally {
      setSyncingLicense(false);
    }
  };

  const handleCopyHwid = () => {
    if (!licenseInfo?.hardwareId) return;
    navigator.clipboard.writeText(licenseInfo.hardwareId);
    setCopiedHwid(true);
    setTimeout(() => setCopiedHwid(false), 2000);
    showToast('Hardware ID copied to clipboard!', 'success');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', settings);
      if (networkUrl) localStorage.setItem('network_server_url', networkUrl);
      else localStorage.removeItem('network_server_url');

      if (licenseServerUrl) {
        await api.post('/license/server-url', { serverUrl: licenseServerUrl.trim() });
      }

      showToast('Settings saved successfully.', 'success');
      await fetchLicenseStatus();
    } catch (err) {
      showToast(err.message || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading settings…" height={320} />;

  return (
    <form onSubmit={handleSubmit}>
      <div className="toolbar flex justify-between items-center mb-4">
        <h2 className="section-title flex items-center gap-2" style={{ margin: 0 }}>
          <SettingsIcon size={22} style={{ color: 'var(--primary)' }} />
          System Settings
        </h2>
        <Button type="submit" variant="primary" icon={Save} loading={saving}>
          {saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </div>

      <div className="two-col">
        {/* Left column: Shop Information, Alerts, Network */}
        <div className="flex flex-col" style={{ gap: 16 }}>
          <div className="glass-card">
            <SectionHead icon={Building2} title="Shop Information" />

            <FormField label="Shop Name">
              <Input name="shop_name" value={settings.shop_name} onChange={handleChange} />
            </FormField>

            <FormField label="Address">
              <Textarea name="shop_address" rows={3} value={settings.shop_address} onChange={handleChange} />
            </FormField>

            <div className="form-row">
              <FormField label="Phone Number">
                <Input name="shop_phone" value={settings.shop_phone} onChange={handleChange} />
              </FormField>
              <FormField label="Email Address">
                <Input type="email" name="shop_email" value={settings.shop_email} onChange={handleChange} />
              </FormField>
            </div>

            <div className="form-row">
              <FormField label="GST Number">
                <Input name="shop_gst" value={settings.shop_gst} onChange={handleChange} />
              </FormField>
              <FormField label="Drug License No.">
                <Input name="shop_dl" value={settings.shop_dl} onChange={handleChange} />
              </FormField>
            </div>

            <FormField
              label="Pharmacy State (Place of Supply)"
              hint="Used to decide the GST split on bills: same state as the customer → CGST + SGST, different state → IGST."
            >
              <Select name="shop_state" value={settings.shop_state || ''} onChange={handleChange}>
                <option value="">— Select state —</option>
                {INDIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
              </Select>
            </FormField>
          </div>

          <div className="glass-card">
            <SectionHead icon={Bell} title="Alerts & Notifications" />

            <FormField
              label="Low Stock Threshold (Qty)"
              hint="Medicines with quantity at or below this appear in Low Stock alerts."
            >
              <Input type="number" min="0" name="low_stock_threshold" value={settings.low_stock_threshold} onChange={handleChange} />
            </FormField>

            <FormField
              label="Expiry Alert (Days)"
              hint="Warn this many days before a batch expires."
            >
              <Input type="number" min="0" name="expiry_alert_days" value={settings.expiry_alert_days} onChange={handleChange} />
            </FormField>

            <FormField
              label="Automatic WhatsApp PDF Dispatch"
              hint="When enabled, every bill saved with a customer phone number automatically delivers the invoice PDF via WhatsApp."
            >
              <Select
                name="whatsapp_auto_send"
                value={settings.whatsapp_auto_send !== 'false' ? 'true' : 'false'}
                onChange={handleChange}
              >
                <option value="true">Enabled (Auto-send PDF on bill save)</option>
                <option value="false">Disabled (Manual send only via button)</option>
              </Select>
            </FormField>
          </div>

          <div className="glass-card">
            <SectionHead icon={Network} title="Network & Multi-Counter Sync" />
            <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
              To sync multiple counters, run the app on the main computer (server) and enter its IP address here on
              the other computers (clients). Leave blank to act as the main server.
            </p>
            <FormField label="Central Server URL" hint="Applies after an app restart.">
              <Input
                placeholder="e.g. http://192.168.1.100:3001"
                value={networkUrl}
                onChange={(e) => setNetworkUrl(e.target.value)}
              />
            </FormField>
          </div>
        </div>

        {/* Right column: License, WhatsApp Integration and Backup & Restore */}
        <div className="flex flex-col" style={{ gap: 16 }}>
          {/* Cloud License & Machine Card */}
          <div className="glass-card">
            <SectionHead icon={ShieldCheck} title="License & Cloud Access" />
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>License Status</span>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {licenseInfo?.cloudStoreName ? `Registered to: ${licenseInfo.cloudStoreName}` : 'Local Machine Activation'}
                </div>
              </div>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  background: licenseInfo?.licensed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: licenseInfo?.licensed ? '#10b981' : '#ef4444',
                  border: `1px solid ${licenseInfo?.licensed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                }}
              >
                {licenseInfo?.licensed ? 'ACTIVE' : 'UNLICENSED'}
              </span>
            </div>

            <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 14, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="text-muted" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Hardware ID</span>
                <button
                  type="button"
                  onClick={handleCopyHwid}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}
                >
                  {copiedHwid ? <Check size={12} /> : <Copy size={12} />}
                  {copiedHwid ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, wordBreak: 'break-all', color: 'var(--text-primary)' }}>
                {licenseInfo?.hardwareId || '—'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'var(--bg-subtle)', padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <span className="text-muted" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', display: 'block' }}>Expiry Date</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {licenseInfo?.expiry === '9999-12-31' ? 'Lifetime Access' : (licenseInfo?.expiry || 'N/A')}
                </span>
              </div>
              <div style={{ background: 'var(--bg-subtle)', padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <span className="text-muted" style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', display: 'block' }}>Cloud License Key</span>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>
                  {licenseInfo?.cloudLicenseKey || 'Offline Key'}
                </span>
              </div>
            </div>

            <FormField label="Cloud License Server URL" hint="Points to your Render cloud license manager.">
              <Input
                value={licenseServerUrl}
                onChange={(e) => setLicenseServerUrl(e.target.value)}
                placeholder="https://medical-lisence-key.onrender.com"
                style={{ fontSize: 12 }}
              />
            </FormField>

            <div style={{ marginTop: 14 }}>
              <Button
                type="button"
                variant="secondary"
                icon={RefreshCw}
                loading={syncingLicense}
                onClick={handleSyncLicense}
                style={{ width: '100%' }}
              >
                {syncingLicense ? 'Connecting to Cloud…' : 'Sync License Status with Cloud'}
              </Button>
            </div>
          </div>

          <WhatsAppSetup />
          <BackupRestore />
        </div>
      </div>
    </form>
  );
}
