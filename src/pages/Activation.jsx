import React, { useState, useEffect } from 'react';
import { ShieldAlert, Copy, Check, Key, Loader2, Globe, FileKey, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import logoImg from '../assets/logo.png';
import { api } from '../services/api';
import { Button, Input, FormField, HandwritingSvg } from '../components/ui';

export default function Activation({ onActivated }) {
  const [hwid, setHwid] = useState('');
  const [activeTab, setActiveTab] = useState('online'); // 'online' or 'offline'
  const [onlineKey, setOnlineKey] = useState('');
  const [offlineKey, setOfflineKey] = useState('');
  const [serverUrl, setServerUrl] = useState('https://athass-license-manager.onrender.com');
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/license/status');
        setHwid(data.hardwareId);
        if (data.cloudServerUrl) {
          setServerUrl(data.cloudServerUrl);
        }
      } catch {
        setError('Failed to load system Hardware ID from the backend.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCopy = () => {
    if (!hwid) return;
    navigator.clipboard.writeText(hwid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOnlineSubmit = async (e) => {
    e.preventDefault();
    if (!onlineKey.trim()) {
      setError('Please enter your license key (e.g. AMS-PRO-XXXX-XXXX).');
      return;
    }
    setError('');
    setSuccess('');
    setActivating(true);

    try {
      const data = await api.post('/license/online-activate', {
        key: onlineKey.trim(),
        serverUrl: serverUrl.trim()
      });
      setSuccess(data.message || `Activated successfully for ${data.storeName || 'Store'}!`);
      setTimeout(() => onActivated(), 1500);
    } catch (err) {
      setError(err.message || 'Online activation failed. Check your internet connection or license key.');
    } finally {
      setActivating(false);
    }
  };

  const handleOfflineSubmit = async (e) => {
    e.preventDefault();
    if (!offlineKey.trim()) {
      setError('Please enter your offline cryptographic license key (AMS-LIC-...).');
      return;
    }
    setError('');
    setSuccess('');
    setActivating(true);

    try {
      const data = await api.post('/license/activate', { key: offlineKey.trim() });
      setSuccess(data.message || 'Offline license activated successfully.');
      setTimeout(() => onActivated(), 1500);
    } catch (err) {
      setError(err.message || 'Activation failed. Please check your offline license key.');
    } finally {
      setActivating(false);
    }
  };

  const container = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    padding: 20,
    boxSizing: 'border-box'
  };

  if (loading) {
    return (
      <div style={container}>
        <div className="glass-card" style={{ width: '100%', maxWidth: 480, textAlign: 'center', padding: '48px 40px' }}>
          <HandwritingSvg
            text="Welcome to AthassMediSync"
            width={420}
            height={100}
            fontSize={36}
            strokeWidth={1.5}
            duration={2.4}
            delay={0.15}
            style={{ display: 'block', margin: '0 auto', color: '#A94F2D' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 }}>
            <Loader2 size={15} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            <span className="text-muted" style={{ fontSize: 13 }}>Verifying hardware & license…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={container}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 480, padding: 32 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img
            src={logoImg}
            alt="Athass MediSync"
            style={{ width: 220, maxWidth: '80%', height: 'auto', margin: '0 auto 12px', display: 'block' }}
          />
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--primary-bg)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8
            }}
          >
            <ShieldAlert size={22} style={{ color: 'var(--primary)' }} />
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>
            Software Activation Required
          </p>
        </div>

        {/* Hardware ID Box */}
        <div style={{ background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-lg)', padding: '12px 16px', marginBottom: 18 }}>
          <div className="text-muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
            Your Machine Hardware ID
          </div>
          <div className="flex items-center justify-between gap-2">
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
              {hwid || 'Generating…'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon={copied ? Check : Copy}
              onClick={handleCopy}
              disabled={!hwid}
              title="Copy to clipboard"
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        {/* Activation Mode Switcher */}
        <div style={{ display: 'flex', background: 'var(--bg-subtle)', borderRadius: 8, padding: 3, marginBottom: 18, border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => { setActiveTab('online'); setError(''); }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              background: activeTab === 'online' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'online' ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s ease'
            }}
          >
            <Globe size={14} />
            Online Activation
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('offline'); setError(''); }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              background: activeTab === 'offline' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'offline' ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s ease'
            }}
          >
            <FileKey size={14} />
            Offline Key
          </button>
        </div>

        {/* Form: Online Activation */}
        {activeTab === 'online' && (
          <form onSubmit={handleOnlineSubmit}>
            <FormField label="Enter Online License Key">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Key size={16} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <Input
                  value={onlineKey}
                  onChange={(e) => setOnlineKey(e.target.value)}
                  placeholder="AMS-PRO-XXXX-XXXX"
                  disabled={activating || !!success}
                  style={{ paddingLeft: 36, fontFamily: 'monospace', fontWeight: 600, letterSpacing: 0.5 }}
                />
              </div>
            </FormField>

            {/* Cloud Server URL Accordion */}
            <div style={{ marginTop: 8, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setShowServerConfig(!showServerConfig)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <Settings size={12} />
                <span>License Server: {serverUrl ? new URL(serverUrl).hostname : 'Default'}</span>
                {showServerConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {showServerConfig && (
                <div style={{ marginTop: 8, background: 'var(--bg-subtle)', padding: 10, borderRadius: 8 }}>
                  <FormField label="Cloud License Server URL">
                    <Input
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="https://your-app.onrender.com"
                      style={{ fontSize: 12 }}
                    />
                  </FormField>
                </div>
              )}
            </div>

            {error && <div className="alert alert-red" style={{ marginTop: 6, marginBottom: 6 }}>{error}</div>}
            {success && <div className="alert alert-green" style={{ marginTop: 6, marginBottom: 6 }}>{success}</div>}

            <Button
              type="submit"
              variant="primary"
              loading={activating}
              disabled={activating || !hwid || !!success}
              style={{ width: '100%', marginTop: 12, height: 42 }}
            >
              {activating ? 'Connecting & Activating…' : 'Activate Online'}
            </Button>
          </form>
        )}

        {/* Form: Offline Activation */}
        {activeTab === 'offline' && (
          <form onSubmit={handleOfflineSubmit}>
            <p className="text-muted" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 12 }}>
              Copy the Hardware ID above, share it with your distributor, and paste the signed offline key below:
            </p>
            <FormField label="Enter Offline Signed License Key">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Key size={16} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <Input
                  value={offlineKey}
                  onChange={(e) => setOfflineKey(e.target.value)}
                  placeholder="AMS-LIC-ey…"
                  disabled={activating || !!success}
                  style={{ paddingLeft: 36, fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
            </FormField>

            {error && <div className="alert alert-red" style={{ marginTop: 6, marginBottom: 6 }}>{error}</div>}
            {success && <div className="alert alert-green" style={{ marginTop: 6, marginBottom: 6 }}>{success}</div>}

            <Button
              type="submit"
              variant="primary"
              loading={activating}
              disabled={activating || !hwid || !!success}
              style={{ width: '100%', marginTop: 12, height: 42 }}
            >
              {activating ? 'Verifying Key…' : 'Activate Offline'}
            </Button>
          </form>
        )}

        <div className="text-muted" style={{ textAlign: 'center', fontSize: 10, fontWeight: 500, marginTop: 20 }}>
          AthassMediSync Pharmacy Management System v1.2.0
        </div>
      </div>
    </div>
  );
}
