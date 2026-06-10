import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Save, Settings as SettingsIcon, Bell, Printer, Phone } from 'lucide-react';
import WhatsAppSetup from '../components/WhatsAppSetup';
import BackupRestore from '../components/BackupRestore';

export default function Settings() {
  const [settings, setSettings] = useState({
      shop_name: '',
      shop_address: '',
      shop_phone: '',
      shop_email: '',
      shop_gst: '',
      shop_dl: '',

    low_stock_threshold: '10',
    expiry_alert_days: '90',
    whatsapp_enabled: 'true',
    whatsapp_instance_id: '',
    whatsapp_access_token: ''
  });
  const [networkUrl, setNetworkUrl] = useState(localStorage.getItem('network_server_url') || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await api.get('/settings');
      setSettings(prev => ({ ...prev, ...data }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', settings);
      
      // Save network URL locally
      if (networkUrl) {
        localStorage.setItem('network_server_url', networkUrl);
      } else {
        localStorage.removeItem('network_server_url');
      }
      
      alert('Settings saved successfully! If you changed the Network Server URL, please restart the app for changes to take effect.');
    } catch (err) {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="toolbar">
        <h2 className="section-title">System Settings</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Shop Details */}
          <div className="glass-card">
            <div className="flex items-center gap-2 mb-4 text-primary font-semibold border-b pb-2">
              <SettingsIcon size={18} />
              <h3>Shop Information</h3>
            </div>
            
            <div className="form-group">
              <label className="form-label">Shop Name</label>
              <input 
                type="text" name="shop_name" 
                className="form-input" 
                value={settings.shop_name} 
                onChange={handleChange} 
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea 
                name="shop_address" 
                className="form-textarea" 
                rows="3"
                value={settings.shop_address} 
                onChange={handleChange} 
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input 
                type="text" name="shop_phone" 
                className="form-input" 
                value={settings.shop_phone} 
                onChange={handleChange} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input 
                type="email" name="shop_email" 
                className="form-input" 
                value={settings.shop_email} 
                onChange={handleChange} 
              />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">GST Number</label>
                <input 
                  type="text" name="shop_gst" 
                  className="form-input" 
                  value={settings.shop_gst} 
                  onChange={handleChange} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Drug License No.</label>
                <input 
                  type="text" name="shop_dl" 
                  className="form-input" 
                  value={settings.shop_dl} 
                  onChange={handleChange} 
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {/* Alerts */}
            <div className="glass-card">
              <div className="flex items-center gap-2 mb-4 text-primary font-semibold border-b pb-2">
                <Bell size={18} />
                <h3>Alerts & Notifications</h3>
              </div>
              
              <div className="form-group">
                <label className="form-label">Low Stock Threshold (Qty)</label>
                <input 
                  type="number" name="low_stock_threshold" 
                  className="form-input" 
                  value={settings.low_stock_threshold} 
                  onChange={handleChange} 
                />
                <p className="text-xs text-muted mt-1">Medicines with quantity below this will appear in Low Stock alerts</p>
              </div>
              
              <div className="form-group">
                <label className="form-label">Expiry Alert (Days)</label>
                <input 
                  type="number" name="expiry_alert_days" 
                  className="form-input" 
                  value={settings.expiry_alert_days} 
                  onChange={handleChange} 
                />
                <p className="text-xs text-muted mt-1">Warn before these many days of expiry</p>
              </div>
            </div>

            {/* Network Setup (Multi-Counter Sync) */}
            <div className="glass-card">
              <div className="flex items-center gap-2 mb-4 text-primary font-semibold border-b pb-2">
                <SettingsIcon size={18} />
                <h3>Network & Multi-Counter Sync</h3>
              </div>
              <p className="text-sm text-muted mb-4">
                To sync multiple counters, run the app on the main computer (Server) and enter its IP address here on the other computers (Clients). Leave blank to act as the main server.
              </p>
              
              <div className="form-group">
                <label className="form-label">Central Server URL</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. http://192.168.1.100:3001"
                  value={networkUrl} 
                  onChange={(e) => setNetworkUrl(e.target.value)} 
                />
              </div>
            </div>

              {/* WhatsApp Integration */}
              <WhatsAppSetup />

              {/* Data Safety */}
              <BackupRestore />
            </div>
          </div>


        <div className="flex justify-end mt-6 pb-10">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
