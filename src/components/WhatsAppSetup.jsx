import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import {
  Phone, CheckCircle2, RefreshCw, LogOut, QrCode, WifiOff, User, Loader2,
  Trash2, Send, AlertTriangle, MessageSquare, ShieldAlert
} from 'lucide-react';
import { Button, Badge, ConfirmDialog } from './ui';

// Status styling and metadata
const STATUS_CONFIG = {
  READY:         { label: 'Connected',        tone: 'green',  Icon: CheckCircle2, spin: false },
  AUTHENTICATED: { label: 'Authenticating…',  tone: 'purple', Icon: Loader2,      spin: true },
  QR_READY:      { label: 'Scan QR Code',     tone: 'yellow', Icon: QrCode,       spin: false },
  INITIALIZING:  { label: 'Starting Engine…', tone: 'blue',   Icon: Loader2,      spin: true },
  RECONNECTING:  { label: 'Reconnecting…',    tone: 'blue',   Icon: Loader2,      spin: true },
  FAILED:        { label: 'Connection Error', tone: 'red',    Icon: AlertTriangle, spin: false },
  DISCONNECTED:  { label: 'Disconnected',     tone: 'red',    Icon: WifiOff,      spin: false },
  LOADING:       { label: 'Checking…',        tone: 'gray',   Icon: Loader2,      spin: true },
};

function StatusBadge({ status }) {
  const meta = STATUS_CONFIG[status] || STATUS_CONFIG.LOADING;
  const { Icon } = meta;
  return (
    <Badge tone={meta.tone}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Icon size={12} className={meta.spin ? 'animate-spin' : ''} />
        {meta.label}
      </span>
    </Badge>
  );
}

export default function WhatsAppSetup() {
  const showToast = useToast();
  const [status, setStatus] = useState('LOADING');
  const [qr, setQr] = useState(null);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(4);

  const [actionLoading, setActionLoading] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);

  // Test Message Form
  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const pollStatus = useCallback(async () => {
    try {
      const data = await api.getWhatsAppStatus();
      if (data) {
        setStatus(data.status || 'DISCONNECTED');
        setQr(data.qr || null);
        setInfo(data.info || null);
        setError(data.error || null);
        setReconnectAttempt(data.reconnectAttempt || 0);
        setMaxAttempts(data.maxAttempts || 4);
      }
    } catch {
      // Backend may be reloading
    }
  }, []);

  useEffect(() => {
    pollStatus();
    // Fast polling when negotiating connection / QR, relaxed polling when ready
    const intervalMs = (status === 'QR_READY' || status === 'INITIALIZING' || status === 'AUTHENTICATED' || status === 'RECONNECTING') ? 2500 : 10000;
    const interval = setInterval(pollStatus, intervalMs);
    return () => clearInterval(interval);
  }, [pollStatus, status]);

  // Connect WhatsApp
  const handleConnect = async () => {
    setActionLoading(true);
    try {
      await api.connectWhatsApp();
      showToast('Starting WhatsApp engine… Please wait for QR code', 'info');
      setTimeout(pollStatus, 1500);
    } catch (err) {
      showToast(err.message || 'Could not start WhatsApp', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Reconnect WhatsApp
  const handleReconnect = async () => {
    setActionLoading(true);
    try {
      await api.restartWhatsApp();
      showToast('Attempting to reconnect WhatsApp session…', 'info');
      setTimeout(pollStatus, 1500);
    } catch (err) {
      showToast(err.message || 'Could not restart WhatsApp', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Graceful Logout
  const handleLogout = async () => {
    setConfirmLogout(false);
    setActionLoading(true);
    try {
      await api.logoutWhatsApp();
      showToast('Logged out of WhatsApp successfully', 'success');
      setTimeout(pollStatus, 1500);
    } catch (err) {
      showToast(err.message || 'Logout failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Session & Reconnect from scratch
  const handleDeleteSession = async () => {
    setConfirmDeleteSession(false);
    setActionLoading(true);
    try {
      await api.deleteWhatsAppSession();
      showToast('Session data deleted. Starting fresh QR scan…', 'info');
      setTimeout(pollStatus, 2000);
    } catch (err) {
      showToast(err.message || 'Failed to delete session', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Send Test Ping
  const handleSendTestMessage = async (e) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      showToast('Please enter a phone number', 'error');
      return;
    }
    setSendingTest(true);
    try {
      const res = await api.sendWhatsAppTestMessage(testPhone.trim());
      showToast(res.message || 'Test message sent successfully!', 'success');
      setTestPhone('');
    } catch (err) {
      showToast(err.message || 'Failed to send test message', 'error');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="glass-card" style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between mb-4"
        style={{ paddingBottom: 14, borderBottom: '1px solid var(--border, rgba(0,0,0,0.08))' }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: status === 'READY' ? 'var(--success, #16a34a)' : 'var(--primary, #0284c7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
            }}
          >
            <Phone size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
              WhatsApp Direct Integration
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Send invoices directly to customers without opening an external browser
            </div>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Error / Alert banner if present */}
      {error && (
        <div
          className="alert alert-red mb-4"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13 }}>{error}</span>
          </div>
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            onClick={() => setConfirmDeleteSession(true)}
          >
            Reset Session
          </Button>
        </div>
      )}

      {/* ── 1. READY (Connected) State ── */}
      {status === 'READY' && (
        <div>
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              borderRadius: 14,
              padding: '16px 20px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'var(--success, #16a34a)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                <User size={22} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                  {info?.name || 'Athass Pharmacy Account'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {info?.number ? `+${info.number}` : 'Connected Device'}
                </div>
                <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600, marginTop: 4 }}>
                  ● Active & ready for instant 1-click invoice dispatch
                </div>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              loading={actionLoading}
              onClick={pollStatus}
              title="Refresh connection state"
            >
              Check
            </Button>
          </div>

          {/* Test Message Panel */}
          <div
            style={{
              background: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border, rgba(0,0,0,0.08))',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 20,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={15} style={{ color: 'var(--primary)' }} />
              Test WhatsApp Delivery
            </div>
            <form onSubmit={handleSendTestMessage} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="Enter 10-digit mobile number…"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border, #cbd5e1)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <Button variant="primary" size="sm" icon={Send} loading={sendingTest} type="submit">
                Send Ping
              </Button>
            </form>
          </div>

          {/* Connected Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--border, rgba(0,0,0,0.06))' }}>
            <Button
              variant="danger"
              icon={LogOut}
              loading={actionLoading}
              onClick={() => setConfirmLogout(true)}
            >
              Log Out
            </Button>
            <Button
              variant="ghost"
              icon={Trash2}
              onClick={() => setConfirmDeleteSession(true)}
              style={{ color: 'var(--danger, #dc2626)' }}
            >
              Delete Session & Reconnect
            </Button>
          </div>
        </div>
      )}

      {/* ── 2. QR Code State ── */}
      {status === 'QR_READY' && qr && (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Scan this QR code with WhatsApp on your mobile phone to link the system:
          </p>

          <div
            style={{
              display: 'inline-block',
              background: '#ffffff',
              padding: 16,
              borderRadius: 16,
              border: '2px solid var(--primary, #0284c7)',
              boxShadow: '0 10px 25px rgba(2, 132, 199, 0.15)',
              marginBottom: 16,
            }}
          >
            <img
              src={qr}
              alt="WhatsApp QR Code"
              style={{ width: 220, height: 220, display: 'block', borderRadius: 8 }}
            />
          </div>

          <div
            style={{
              maxWidth: 400,
              margin: '0 auto 20px',
              textAlign: 'left',
              background: 'var(--bg-glass, rgba(0,0,0,0.02))',
              padding: '12px 18px',
              borderRadius: 10,
              border: '1px solid var(--border, rgba(0,0,0,0.06))',
            }}
          >
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <li>Open <strong>WhatsApp</strong> on your phone</li>
              <li>Tap <strong>Settings / Menu (⋮)</strong> → <strong>Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong></li>
              <li>Point camera at the QR code above</li>
            </ol>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button variant="secondary" icon={RefreshCw} loading={actionLoading} onClick={pollStatus}>
              Refresh QR
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => setConfirmDeleteSession(true)}
            >
              Delete Session & Reset
            </Button>
          </div>
        </div>
      )}

      {/* ── 3. Initializing / Authenticating / Reconnecting State ── */}
      {(status === 'INITIALIZING' || status === 'AUTHENTICATED' || status === 'RECONNECTING' || status === 'LOADING') && (
        <div style={{ textAlign: 'center', padding: '30px 10px' }}>
          <Loader2
            size={36}
            style={{ color: 'var(--primary, #0284c7)', margin: '0 auto 16px' }}
            className="animate-spin"
          />
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>
            {status === 'INITIALIZING' && 'Launching WhatsApp Browser Engine…'}
            {status === 'AUTHENTICATED' && 'Authenticated! Syncing chats and account details…'}
            {status === 'RECONNECTING' && `Reconnecting (Attempt ${reconnectAttempt} of ${maxAttempts})…`}
            {status === 'LOADING' && 'Connecting to WhatsApp service…'}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 440, margin: '0 auto 20px' }}>
            {status === 'INITIALIZING'
              ? 'Starting background browser. The QR code will appear in a few seconds.'
              : 'Please keep this window open while the session establishes.'}
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={pollStatus}>
              Refresh Status
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              style={{ color: 'var(--danger, #dc2626)' }}
              onClick={() => setConfirmDeleteSession(true)}
            >
              Cancel & Reset Session
            </Button>
          </div>
        </div>
      )}

      {/* ── 4. Disconnected / Failed State ── */}
      {(status === 'DISCONNECTED' || status === 'FAILED') && (
        <div style={{ textAlign: 'center', padding: '24px 10px' }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <WifiOff size={26} style={{ color: 'var(--danger, #ef4444)' }} />
          </div>

          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>
            WhatsApp is Currently Disconnected
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, margin: '0 auto 24px' }}>
            Connect your pharmacy's WhatsApp account to automatically send PDF invoices and payment receipts directly to customer mobile numbers.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              icon={Phone}
              loading={actionLoading}
              onClick={handleConnect}
              style={{ padding: '10px 24px', fontSize: 14 }}
            >
              Connect WhatsApp (Scan QR)
            </Button>

            <Button
              variant="secondary"
              icon={RefreshCw}
              loading={actionLoading}
              onClick={handleReconnect}
            >
              Reconnect Saved Session
            </Button>

            <Button
              variant="danger"
              icon={Trash2}
              loading={actionLoading}
              onClick={() => setConfirmDeleteSession(true)}
              title="Wipes any corrupted session files and generates a fresh QR code"
            >
              Delete Session & Reconnect Fresh
            </Button>
          </div>
        </div>
      )}

      {/* Logout Confirmation Dialog */}
      {confirmLogout && (
        <ConfirmDialog
          title="Disconnect WhatsApp?"
          message="Are you sure you want to log out? You will need to scan the QR code again from your phone to reconnect."
          confirmLabel="Log Out"
          tone="danger"
          onConfirm={handleLogout}
          onClose={() => setConfirmLogout(false)}
        />
      )}

      {/* Delete Session & Reconnect Confirmation Dialog */}
      {confirmDeleteSession && (
        <ConfirmDialog
          title="Delete Session & Reset WhatsApp?"
          message="This will completely remove stored session files, close background browser instances, and generate a brand-new QR code for you to scan. Use this if WhatsApp is stuck or not responding."
          confirmLabel="Delete Session & Reset"
          tone="danger"
          onConfirm={handleDeleteSession}
          onClose={() => setConfirmDeleteSession(false)}
        />
      )}
    </div>
  );
}
