import React, { useState, useEffect } from 'react';
import { ShieldAlert, Copy, Check, Key, Loader } from 'lucide-react';
import { api } from '../services/api';

export default function Activation({ onActivated }) {
  const [hwid, setHwid] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await api.get('/license/status');
      setHwid(data.hardwareId);
    } catch (err) {
      setError('Failed to load system Hardware ID from backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(hwid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      setError('Please enter a license key.');
      return;
    }
    setError('');
    setSuccess('');
    setActivating(true);
    try {
      const data = await api.post('/license/activate', { key: licenseKey.trim() });
      setSuccess(data.message);
      setTimeout(() => {
        onActivated();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Activation failed. Please check your license key.');
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div className="glass-card" style={styles.card}>
          <div style={styles.loadingBox}>
            <Loader className="animate-spin" size={32} style={{ color: 'var(--primary)' }} />
            <p style={{ marginTop: 12, color: 'var(--text)' }}>Loading hardware verification...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div className="glass-card" style={styles.card}>
        <div style={styles.header}>
          <div style={styles.iconCircle}>
            <ShieldAlert size={28} style={{ color: 'var(--primary)' }} />
          </div>
          <h2 style={styles.title}>AthassMediSync</h2>
          <p style={styles.subtitle}>Software Activation Required</p>
        </div>

        <div style={styles.body}>
          <p style={styles.description}>
            This copy of AthassMediSync is unregistered. Please copy the unique Hardware ID below and send it to your distributor/developer to receive a valid activation license key.
          </p>

          <div style={styles.hwidBox}>
            <div style={styles.hwidLabel}>YOUR HARDWARE ID</div>
            <div style={styles.hwidContainer}>
              <span style={styles.hwidValue}>{hwid || 'Generating...'}</span>
              <button 
                type="button" 
                onClick={handleCopy}
                style={styles.copyBtn}
                title="Copy to Clipboard"
                disabled={!hwid}
              >
                {copied ? <Check size={16} style={{ color: '#2e7d32' }} /> : <Copy size={16} />}
              </button>
            </div>
            {copied && <span style={styles.copiedText}>Copied successfully!</span>}
          </div>

          <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
            <div className="form-group">
              <label className="form-label" style={styles.formLabel}>ENTER ACTIVATION LICENSE KEY</label>
              <div style={styles.inputContainer}>
                <Key size={18} style={styles.inputIcon} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="AMS-LIC-ey..."
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  style={styles.keyInput}
                  disabled={activating || !!success}
                />
              </div>
            </div>

            {error && <div style={styles.errorAlert}>{error}</div>}
            {success && <div style={styles.successAlert}>{success}</div>}

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={styles.submitBtn}
              disabled={activating || !hwid || !!success}
            >
              {activating ? (
                <>
                  <Loader className="animate-spin" size={18} style={{ marginRight: 8 }} />
                  Activating...
                </>
              ) : (
                'Activate Software'
              )}
            </button>
          </form>
        </div>

        <div style={styles.footer}>
          <span>AthassMediSync Pharmacy Management System v1.2.0</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
    padding: '20px',
    boxSizing: 'border-box',
    fontFamily: '"SF Pro Display", "Inter", -apple-system, sans-serif'
  },
  card: {
    width: '100%',
    maxWidth: '500px',
    padding: '40px 32px 32px 32px',
    borderRadius: '24px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(255, 255, 255, 0.75)',
    boxSizing: 'border-box'
  },
  loadingBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0'
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: '24px'
  },
  iconCircle: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'rgba(59, 130, 246, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1e293b',
    margin: '0',
    letterSpacing: '-0.5px'
  },
  subtitle: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--primary)',
    margin: '4px 0 0 0',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  body: {
    display: 'flex',
    flexDirection: 'column'
  },
  description: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#64748b',
    margin: '0 0 24px 0',
    textAlign: 'center'
  },
  hwidBox: {
    background: 'rgba(0,0,0,0.03)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px dashed rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative'
  },
  hwidLabel: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: '0.5px',
    marginBottom: '6px'
  },
  hwidContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  hwidValue: {
    fontSize: '18px',
    fontWeight: '700',
    fontFamily: 'monospace',
    color: '#334155',
    letterSpacing: '0.5px'
  },
  copyBtn: {
    background: 'white',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: '8px',
    padding: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
  },
  copiedText: {
    fontSize: '11px',
    color: '#2e7d32',
    fontWeight: '500',
    marginTop: '6px',
    textAlign: 'left'
  },
  formLabel: {
    fontWeight: '700',
    fontSize: '11px',
    color: '#475569',
    letterSpacing: '0.5px',
    marginBottom: '8px'
  },
  inputContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  inputIcon: {
    position: 'absolute',
    left: '12px',
    color: '#94a3b8'
  },
  keyInput: {
    paddingLeft: '40px',
    width: '100%',
    boxSizing: 'border-box',
    fontSize: '13px',
    letterSpacing: '0.5px'
  },
  errorAlert: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#b91c1c',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '12px',
    fontWeight: '500',
    marginTop: '16px',
    lineHeight: '1.4'
  },
  successAlert: {
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    color: '#15803d',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '12px',
    fontWeight: '500',
    marginTop: '16px',
    lineHeight: '1.4'
  },
  submitBtn: {
    marginTop: '24px',
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    fontWeight: '600',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '44px',
    cursor: 'pointer'
  },
  footer: {
    marginTop: '32px',
    textAlign: 'center',
    fontSize: '10px',
    color: '#94a3b8',
    fontWeight: '500'
  }
};
