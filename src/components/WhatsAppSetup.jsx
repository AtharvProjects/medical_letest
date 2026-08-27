import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import {
  Phone, CheckCircle2, RefreshCw, LogOut, QrCode, WifiOff, User, Loader2,
} from 'lucide-react';
import { Button, Badge, ConfirmDialog } from './ui';

// Status → design-system Badge tone + icon.
const STATUS_META = {
  READY:         { label: 'Connected',       tone: 'green',  Icon: CheckCircle2 },
  AUTHENTICATED: { label: 'Authenticating…', tone: 'purple', Icon: Loader2, spin: true },
  QR_READY:      { label: 'Scan QR Code',    tone: 'yellow', Icon: QrCode },
  INITIALIZING:  { label: 'Starting…',       tone: 'blue',   Icon: Loader2, spin: true },
  RECONNECTING:  { label: 'Reconnecting…',   tone: 'blue',   Icon: Loader2, spin: true },
  DISCONNECTED:  { label: 'Disconnected',    tone: 'red',    Icon: WifiOff },
  LOADING:       { label: 'Loading…',        tone: 'gray',   Icon: Loader2, spin: true },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.LOADING;
  const { Icon } = meta;
  return (
    <Badge tone={meta.tone}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Icon size={11} className={meta.spin ? 'animate-spin' : ''} />
        {meta.label}
      </span>
    </Badge>
  );
}

function CardHeader({ status }) {
  return (
    <div
      className="flex items-center justify-between mb-4"
      style={{ paddingBottom: 12, borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2">
        <div
          style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Phone size={15} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>WhatsApp Direct Send</div>
          <div className="text-xs text-muted">Send invoices without opening a browser</div>
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

export default function WhatsAppSetup() {
  const showToast = useToast();
  const [status, setStatus] = useState('LOADING');
  const [qr, setQr] = useState(null);
  const [info, setInfo] = useState(null);            // { name, number }
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);

  const poll = useCallback(async () => {
    try {
      const data = await api.getWhatsAppStatus();
      setStatus(data.status);
      setQr(data.qr);
      setInfo(data.info || null);
      setReconnectAttempt(data.reconnectAttempt || 0);
      setMaxAttempts(data.maxAttempts || 5);
    } catch {
      // Server might be starting up — ignore silently.
    }
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, status === 'READY' ? 15000 : 4000);
    return () => clearInterval(interval);
  }, [poll, status]);

  const handleRestart = async () => {
    setActionError('');
    setActionLoading(true);
    try {
      await api.restartWhatsApp();
      showToast('Reconnecting — this may take up to 30 seconds…', 'info');
      setTimeout(poll, 2000);
    } catch {
      setActionError('Could not restart. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const doLogout = async () => {
    setConfirmLogout(false);
    setActionError('');
    setActionLoading(true);
    try {
      await api.logoutWhatsApp();
      showToast('Logged out. Please scan the new QR code to reconnect.', 'info');
      setTimeout(poll, 3000);
    } catch {
      setActionError('Logout failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConnect = async () => {
    setActionError('');
    setActionLoading(true);
    try {
      await api.connectWhatsApp();
      showToast('Starting WhatsApp — this may take up to 30 seconds…', 'info');
      setTimeout(poll, 3000);
    } catch {
      setActionError('Could not start WhatsApp. Make sure Chrome is installed.');
    } finally {
      setActionLoading(false);
    }
  };

  const logoutDialog = confirmLogout && (
    <ConfirmDialog
      title="Disconnect WhatsApp?"
      message="You will need to scan a QR code again to reconnect."
      confirmLabel="Disconnect"
      onConfirm={doLogout}
      onClose={() => setConfirmLogout(false)}
    />
  );

  /* ── Connected ─────────────────────────────────────────────────────────── */
  if (status === 'READY') {
    return (
      <div className="glass-card">
        <CardHeader status={status} />

        <div
          className="flex items-center gap-3 mb-4"
          style={{ background: 'var(--success-bg)', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 16px' }}
        >
          <div
            style={{
              width: 44, height: 44, borderRadius: '50%', background: 'var(--success)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <User size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{info?.name || 'Your WhatsApp'}</div>
            {info?.number && <div className="text-xs text-muted" style={{ marginTop: 2 }}>+{info.number}</div>}
            <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 2, fontWeight: 600 }}>
              ● Invoices are sent directly, without opening a browser
            </div>
          </div>
        </div>

        {actionError && <div className="alert alert-red mb-4">{actionError}</div>}

        <Button variant="danger" icon={LogOut} loading={actionLoading} onClick={() => setConfirmLogout(true)} style={{ width: '100%' }}>
          Disconnect WhatsApp
        </Button>
        {logoutDialog}
      </div>
    );
  }

  /* ── QR ready ──────────────────────────────────────────────────────────── */
  if (status === 'QR_READY' && qr) {
    return (
      <div className="glass-card">
        <CardHeader status={status} />
        <p className="text-sm text-muted mb-4" style={{ textAlign: 'center' }}>
          Scan this QR code with WhatsApp on your phone to connect.
        </p>
        <div className="flex flex-col items-center" style={{ gap: 16 }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
            <img src={qr} alt="WhatsApp QR Code" style={{ width: 200, height: 200, display: 'block' }} />
          </div>
          <ol className="text-xs text-muted" style={{ textAlign: 'left', listStyle: 'decimal', paddingLeft: 20, margin: 0, lineHeight: 1.9 }}>
            <li>Open WhatsApp on your phone</li>
            <li>Tap <strong>Menu (⋮)</strong> → <strong>Linked Devices</strong></li>
            <li>Tap <strong>Link a Device</strong></li>
            <li>Point your phone camera at this screen</li>
          </ol>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={poll}>Refresh Status</Button>
        </div>
      </div>
    );
  }

  /* ── Disconnected ──────────────────────────────────────────────────────── */
  if (status === 'DISCONNECTED') {
    return (
      <div className="glass-card">
        <CardHeader status={status} />
        <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: '50%', background: 'var(--primary-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
            }}
          >
            <Phone size={24} style={{ color: 'var(--primary)' }} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>WhatsApp Not Connected</p>
          <p className="text-xs text-muted" style={{ margin: 0 }}>
            Connect WhatsApp to send invoices directly to customers without opening a browser.
          </p>
        </div>

        {actionError && <div className="alert alert-red mb-4">{actionError}</div>}

        <Button variant="success" icon={Phone} loading={actionLoading} onClick={handleConnect} style={{ width: '100%' }}>
          {actionLoading ? 'Starting…' : 'Connect WhatsApp'}
        </Button>
      </div>
    );
  }

  /* ── Loading / connecting / reconnecting ───────────────────────────────── */
  const isReconnecting = status === 'RECONNECTING';
  return (
    <div className="glass-card">
      <CardHeader status={status} />
      <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%', background: 'var(--primary-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}
        >
          <Loader2 size={26} style={{ color: 'var(--primary)' }} className="animate-spin" />
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>
          {status === 'INITIALIZING' && 'Starting WhatsApp engine…'}
          {status === 'AUTHENTICATED' && 'Authenticating…'}
          {status === 'RECONNECTING' && `Auto-reconnect ${reconnectAttempt} of ${maxAttempts}…`}
          {status === 'LOADING' && 'Loading…'}
        </p>
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          {isReconnecting
            ? 'Previous session detected — trying to restore without re-scanning.'
            : 'This may take up to 30 seconds on first launch.'}
        </p>
      </div>

      {actionError && <div className="alert alert-red mb-4">{actionError}</div>}

      {isReconnecting && (
        <Button variant="secondary" size="sm" loading={actionLoading} onClick={handleRestart} style={{ width: '100%' }}>
          Force Reconnect Now
        </Button>
      )}
    </div>
  );
}
