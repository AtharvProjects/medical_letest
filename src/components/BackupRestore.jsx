import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Database, Download, Trash2, RefreshCw, AlertTriangle, Folder } from 'lucide-react';
import { useToast } from '../App';

export default function BackupRestore() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const showToast = useToast();

  useEffect(() => {
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const data = await api.get('/backups');
      setBackups(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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

  const handleDeleteBackup = async (id) => {
    if (!window.confirm('Are you sure you want to delete this backup file?')) return;
    try {
      await api.delete(`/backups/${id}`);
      showToast('Backup deleted');
      fetchBackups();
    } catch (err) {
      showToast('Failed to delete backup', 'error');
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="glass-card">
      <div className="flex items-center justify-between mb-4 text-primary font-semibold border-b pb-2">
        <div className="flex items-center gap-2">
          <Database size={18} />
          <h3>Database Backup & Restore</h3>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            className="btn btn-secondary btn-sm" 
            onClick={() => api.get('/backups/locate').catch(e => showToast(e.message, 'error'))}
            title="Locate database file on your computer"
          >
            <Folder size={14} />
            Locate DB File
          </button>
          <button 
            type="button" 
            className="btn btn-primary btn-sm" 
            onClick={handleCreateBackup}
            disabled={creating}
          >
            {creating ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            Create Backup Now
          </button>
        </div>
      </div>

      <p className="text-sm text-muted mb-4">
        Regularly back up your data to prevent loss. Backups are stored locally in the application data folder.
      </p>

      {loading ? (
        <div className="text-center py-4 text-muted">Loading backups...</div>
      ) : backups.length === 0 ? (
        <div className="text-center py-8 bg-black/5 rounded-xl border border-dashed border-black/10">
          <p className="text-muted text-sm">No backups found.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {backups.map((b) => (
            <div key={b.id} className="flex items-center justify-between p-3 bg-white/40 rounded-lg border border-white/50 hover:bg-white/60 transition-all">
              <div className="flex flex-col">
                <span className="text-xs font-mono text-primary truncate max-w-[200px]">
                  {b.file_path.split('/').pop()}
                </span>
                <span className="text-[10px] text-muted">
                  {new Date(b.created_at).toLocaleString()} • {formatSize(b.file_size)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${b.status === 'Success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {b.status}
                </span>
                <button 
                  type="button" 
                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                  onClick={() => handleDeleteBackup(b.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200 flex gap-3">
        <AlertTriangle size={20} className="text-amber-500 shrink-0" />
        <p className="text-[11px] text-amber-800">
          <strong>Note:</strong> To restore a backup, please manually copy the backup file and replace the main <code>pharmacy.db</code> file while the application is closed.
        </p>
      </div>
    </div>
  );
}
