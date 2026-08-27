import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useToast } from '../App';
import { Database, Download, Trash2, Folder, AlertTriangle } from 'lucide-react';
import { Button, Badge, DataTable, EmptyState, ConfirmDialog } from './ui';

const fileName = (b) => String(b?.file_path || '').split(/[/\\]/).pop();

const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function BackupRestore() {
  const showToast = useToast();
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      setBackups(await api.get('/backups'));
    } catch (err) {
      showToast('Failed to load backups', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      await api.post('/backups');
      showToast('Backup created successfully');
      fetchBackups();
    } catch (err) {
      showToast('Failed to create backup', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleLocate = () => {
    api.get('/backups/locate').catch((e) => showToast(e.message, 'error'));
  };

  const handleDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/backups/${confirmTarget.id}`);
      showToast('Backup deleted');
      setConfirmTarget(null);
      fetchBackups();
    } catch (err) {
      showToast('Failed to delete backup', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { header: 'Backup File', render: (b) => <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 500 }}>{fileName(b)}</span> },
    { header: 'Created', render: (b) => <span className="text-muted text-xs">{new Date(b.created_at).toLocaleString()}</span> },
    { header: 'Size', align: 'right', render: (b) => <span className="text-xs">{formatSize(b.file_size)}</span> },
    { header: 'Status', align: 'center', render: (b) => <Badge tone={b.status === 'Success' ? 'green' : 'red'}>{b.status}</Badge> },
    {
      header: '',
      align: 'right',
      width: 56,
      render: (b) => <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmTarget(b)} title="Delete backup" />,
    },
  ];

  return (
    <div className="glass-card">
      <div
        className="flex items-center justify-between mb-4"
        style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}
      >
        <div className="flex items-center gap-2">
          <Database size={17} style={{ color: 'var(--primary)' }} />
          <span className="section-title" style={{ margin: 0 }}>Database Backup &amp; Restore</span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={Folder} onClick={handleLocate} title="Locate database file on your computer">
            Locate DB
          </Button>
          <Button variant="primary" size="sm" icon={Download} loading={creating} onClick={handleCreateBackup}>
            Create Backup
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted mb-4">
        Regularly back up your data to prevent loss. Backups are stored locally in the application data folder.
      </p>

      <DataTable
        loading={loading}
        columns={columns}
        rows={backups}
        empty={<EmptyState icon={Database} title="No backups yet" message="Create a backup to protect your data." height={140} />}
      />

      <div className="alert alert-yellow" style={{ marginTop: 16 }}>
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>To restore:</strong> close the application, then manually copy a backup file over the main{' '}
          <code>pharmacy.db</code> file.
        </span>
      </div>

      {confirmTarget && (
        <ConfirmDialog
          title="Delete backup?"
          message={`Delete "${fileName(confirmTarget)}"? This cannot be undone.`}
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
