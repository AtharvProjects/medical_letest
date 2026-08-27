import React, { useState, useEffect } from 'react';
import { ShieldAlert, Copy, Check, Key, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { Button, Input, FormField } from '../components/ui';

export default function Activation({ onActivated }) {
  const [hwid, setHwid] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!licenseKey.trim()) { setError('Please enter a license key.'); return; }
    setError('');
    setSuccess('');
    setActivating(true);
    try {
      const data = await api.post('/license/activate', { key: licenseKey.trim() });
      setSuccess(data.message || 'Activated successfully.');
      setTimeout(() => onActivated(), 1500);
    } catch (err) {
      setError(err.message || 'Activation failed. Please check your license key.');
    } finally {
      setActivating(false);
    }
  };

  const container = {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    minHeight: '100vh', background: 'var(--bg-primary)', padding: 20, boxSizing: 'border-box',
  };

  if (loading) {
    return (
      <div style={container}>
        <div className="glass-card" style={{ width: '100%', maxWidth: 460, textAlign: 'center', padding: 40 }}>
          <Loader2 size={30} className="animate-spin" style={{ color: 'var(--primary)' }} />
          <p className="text-muted" style={{ marginTop: 12 }}>Loading hardware verification…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={container}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 460, padding: 32 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 60, height: 60, borderRadius: '50%', background: 'var(--primary-bg)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
            }}
          >
            <ShieldAlert size={28} style={{ color: 'var(--primary)' }} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.3px' }}>
            AthassMediSync
          </h2>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: 1 }}>
            Software Activation Required
          </p>
        </div>

        <p className="text-secondary text-sm" style={{ textAlign: 'center', lineHeight: 1.6, margin: '0 0 22px' }}>
          This copy is unregistered. Copy the unique Hardware ID below and send it to your distributor to receive a
          valid activation key.
        </p>

        {/* Hardware ID */}
        <div style={{ background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
          <div className="text-muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
            Your Hardware ID
          </div>
          <div className="flex items-center justify-between gap-2">
            <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
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

        {/* License key */}
        <form onSubmit={handleSubmit} style={{ marginTop: 22 }}>
          <FormField label="Enter Activation License Key">
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Key size={16} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <Input
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="AMS-LIC-ey…"
                disabled={activating || !!success}
                style={{ paddingLeft: 36, fontFamily: 'monospace' }}
              />
            </div>
          </FormField>

          {error && <div className="alert alert-red" style={{ marginTop: 4, marginBottom: 4 }}>{error}</div>}
          {success && <div className="alert alert-green" style={{ marginTop: 4, marginBottom: 4 }}>{success}</div>}

          <Button
            type="submit"
            variant="primary"
            loading={activating}
            disabled={activating || !hwid || !!success}
            style={{ width: '100%', marginTop: 18, height: 42 }}
          >
            {activating ? 'Activating…' : 'Activate Software'}
          </Button>
        </form>

        <div className="text-muted" style={{ textAlign: 'center', fontSize: 10, fontWeight: 500, marginTop: 24 }}>
          AthassMediSync Pharmacy Management System v1.2.0
        </div>
      </div>
    </div>
  );
}
