import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import {
    Phone, CheckCircle2, XCircle, RefreshCw, LogOut, QrCode,
    WifiOff, AlertTriangle, User, Loader2
} from 'lucide-react';

// ── Status display map ────────────────────────────────────────────────────────
const STATUS_META = {
    READY:           { label: 'Connected',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  icon: 'check' },
    AUTHENTICATED:   { label: 'Authenticating…',color: '#a78bfa', bg: 'rgba(167,139,250,0.12)',icon: 'spin'  },
    QR_READY:        { label: 'Scan QR Code',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: 'qr'   },
    INITIALIZING:    { label: 'Starting…',      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', icon: 'spin' },
    RECONNECTING:    { label: 'Reconnecting…',  color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', icon: 'spin' },
    DISCONNECTED:    { label: 'Disconnected',   color: '#f87171', bg: 'rgba(248,113,113,0.12)',icon: 'off'  },
    LOADING:         { label: 'Loading…',       color: '#94a3b8', bg: 'rgba(148,163,184,0.12)',icon: 'spin' },
};

function StatusBadge({ status }) {
    const meta = STATUS_META[status] || STATUS_META.LOADING;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 100,
            background: meta.bg, color: meta.color,
            fontSize: 12, fontWeight: 600, letterSpacing: 0.3,
            border: `1px solid ${meta.color}33`,
        }}>
            {meta.icon === 'check' && <CheckCircle2 size={11} />}
            {meta.icon === 'spin'  && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
            {meta.icon === 'qr'   && <QrCode size={11} />}
            {meta.icon === 'off'  && <WifiOff size={11} />}
            {meta.label}
        </span>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function WhatsAppSetup() {
    const [status, setStatus] = useState('LOADING');
    const [qr, setQr] = useState(null);
    const [info, setInfo] = useState(null);          // { name, number }
    const [reconnectAttempt, setReconnectAttempt] = useState(0);
    const [maxAttempts, setMaxAttempts] = useState(5);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState('');
    const [toast, setToast] = useState('');

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    };

    const poll = useCallback(async () => {
        try {
            const data = await api.getWhatsAppStatus();
            setStatus(data.status);
            setQr(data.qr);
            setInfo(data.info || null);
            setReconnectAttempt(data.reconnectAttempt || 0);
            setMaxAttempts(data.maxAttempts || 5);
        } catch {
            // Server might be starting up — ignore silently
        }
    }, []);

    useEffect(() => {
        poll();
        // Poll fast while not yet ready, slower when stable
        const interval = setInterval(poll, status === 'READY' ? 15000 : 4000);
        return () => clearInterval(interval);
    }, [poll, status]);

    const handleRestart = async () => {
        setActionError('');
        setActionLoading(true);
        try {
            await api.restartWhatsApp();
            showToast('Reconnecting — this may take 30 seconds…');
            setTimeout(poll, 2000);
        } catch (e) {
            setActionError('Could not restart. Try again.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleLogout = async () => {
        if (!window.confirm('Disconnect WhatsApp? You will need to scan a QR code again to reconnect.')) return;
        setActionError('');
        setActionLoading(true);
        try {
            await api.logoutWhatsApp();
            showToast('Logged out. Please scan the new QR code.');
            setTimeout(poll, 3000);
        } catch {
            setActionError('Logout failed. Try again.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleConnect = async () => {
        setActionError('');
        setActionLoading(true);
        try {
            await api.connectWhatsApp();
            showToast('Starting WhatsApp — this may take 30 seconds…');
            setTimeout(poll, 3000);
        } catch (e) {
            setActionError('Could not start WhatsApp. Make sure Chrome is installed.');
        } finally {
            setActionLoading(false);
        }
    };

    // ── Connected State ──────────────────────────────────────────────────────
    if (status === 'READY') {
        return (
            <div className="glass-card" style={{ position: 'relative' }}>
                <CardHeader status={status} />

                <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)',
                    borderRadius: 14, padding: '14px 16px', marginBottom: 16,
                }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: '50%',
                        background: 'linear-gradient(135deg,#22c55e,#16a34a)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <User size={20} color="#fff" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                            {info?.name || 'Your WhatsApp'}
                        </div>
                        {info?.number && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                +{info.number}
                            </div>
                        )}
                        <div style={{ fontSize: 11, color: '#22c55e', marginTop: 2, fontWeight: 600 }}>
                            ● Invoices will be sent directly without opening a browser
                        </div>
                    </div>
                </div>

                {actionError && <ErrorBox msg={actionError} />}

                <button
                    onClick={handleLogout}
                    disabled={actionLoading}
                    style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 8, padding: '10px 0', borderRadius: 12, border: '1px solid rgba(248,113,113,0.4)',
                        background: 'rgba(248,113,113,0.08)', color: '#f87171', fontWeight: 600,
                        fontSize: 13, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.6 : 1,
                    }}
                >
                    {actionLoading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <LogOut size={15} />}
                    {actionLoading ? 'Disconnecting…' : 'Disconnect WhatsApp'}
                </button>
            </div>
        );
    }

    // ── QR Ready State ───────────────────────────────────────────────────────
    if (status === 'QR_READY' && qr) {
        return (
            <div className="glass-card">
                <CardHeader status={status} />

                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, textAlign: 'center' }}>
                    Scan this QR code with your WhatsApp to connect
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <div style={{
                        background: '#fff', padding: 12, borderRadius: 16,
                        boxShadow: '0 4px 24px rgba(0,0,0,0.1)', display: 'inline-block'
                    }}>
                        <img src={qr} alt="WhatsApp QR Code" style={{ width: 200, height: 200, display: 'block' }} />
                    </div>

                    <ol style={{
                        textAlign: 'left', fontSize: 12, color: 'var(--text-muted)',
                        listStyle: 'decimal', paddingLeft: 20, margin: 0, lineHeight: 1.9,
                    }}>
                        <li>Open WhatsApp on your phone</li>
                        <li>Tap <strong>Menu (⋮)</strong> → <strong>Linked Devices</strong></li>
                        <li>Tap <strong>Link a Device</strong></li>
                        <li>Point your phone camera at this screen</li>
                    </ol>

                    <button
                        onClick={poll}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 16px', borderRadius: 10,
                            border: '1px solid var(--border)', background: 'transparent',
                            color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                        }}
                    >
                        <RefreshCw size={12} /> Refresh Status
                    </button>
                </div>
            </div>
        );
    }

    // ── Disconnected State ───────────────────────────────────────────────────
    if (status === 'DISCONNECTED') {
        return (
            <div className="glass-card">
                <CardHeader status={status} />

                <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
                    }}>
                        <Phone size={24} color="#60a5fa" />
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>WhatsApp Not Connected</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        Connect WhatsApp to send invoices directly to customers without opening a browser.
                    </p>
                </div>

                {actionError && <ErrorBox msg={actionError} />}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                        onClick={handleConnect}
                        disabled={actionLoading}
                        style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 8, padding: '11px 0', borderRadius: 12,
                            background: 'linear-gradient(135deg, #25d366, #128c7e)',
                            color: '#fff', fontWeight: 700, fontSize: 14,
                            border: 'none', cursor: actionLoading ? 'not-allowed' : 'pointer',
                            opacity: actionLoading ? 0.7 : 1,
                        }}
                    >
                        {actionLoading
                            ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                            : <Phone size={16} />}
                        {actionLoading ? 'Starting…' : 'Connect WhatsApp'}
                    </button>
                </div>
            </div>
        );
    }

    // ── Loading / Connecting / Reconnecting States ───────────────────────────
    const isReconnecting = status === 'RECONNECTING';
    return (
        <div className="glass-card">
            <CardHeader status={status} />

            <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
                <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
                }}>
                    <Loader2 size={26} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>
                    {status === 'INITIALIZING' && 'Starting WhatsApp Engine…'}
                    {status === 'AUTHENTICATED' && 'Authenticating…'}
                    {status === 'RECONNECTING' && `Auto-reconnect ${reconnectAttempt} of ${maxAttempts}…`}
                    {status === 'LOADING' && 'Loading…'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    {isReconnecting
                        ? 'Previous session detected — trying to restore without re-scanning'
                        : 'This may take up to 30 seconds on first launch'}
                </p>
            </div>

            {isReconnecting && (
                <button
                    onClick={handleRestart}
                    disabled={actionLoading}
                    style={{
                        width: '100%', padding: '9px 0', borderRadius: 10,
                        border: '1px solid var(--border)', background: 'transparent',
                        color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                    }}
                >
                    Force Reconnect Now
                </button>
            )}

            {/* Toast notification */}
            {toast && (
                <div style={{
                    marginTop: 12, padding: '8px 12px', borderRadius: 10,
                    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                    color: '#22c55e', fontSize: 12, textAlign: 'center',
                }}>
                    {toast}
                </div>
            )}
        </div>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function CardHeader({ status }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16, paddingBottom: 12,
            borderBottom: '1px solid var(--border)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #25d366, #128c7e)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Phone size={15} color="#fff" />
                </div>
                <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>WhatsApp Direct Send</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Send invoices without browser</div>
                </div>
            </div>
            <StatusBadge status={status} />
        </div>
    );
}

function ErrorBox({ msg }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
            borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#f87171',
        }}>
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            {msg}
        </div>
    );
}
