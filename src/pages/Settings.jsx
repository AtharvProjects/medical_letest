import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { INDIAN_STATES } from '../utils/states';
import { Save, Settings as SettingsIcon, Bell, Network, Building2 } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/settings');
        setSettings((prev) => ({ ...prev, ...data }));
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', settings);
      if (networkUrl) localStorage.setItem('network_server_url', networkUrl);
      else localStorage.removeItem('network_server_url');
      showToast('Settings saved. If you changed the Network Server URL, restart the app to apply.', 'success');
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

        {/* Right column: WhatsApp Integration and Backup & Restore */}
        <div className="flex flex-col" style={{ gap: 16 }}>
          <WhatsAppSetup />
          <BackupRestore />
        </div>
      </div>
    </form>
  );
}
