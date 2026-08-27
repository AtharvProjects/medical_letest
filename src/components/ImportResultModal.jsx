import React from 'react';
import { Modal, Button, Badge } from './ui';
import { CheckCircle2, AlertTriangle, XCircle, Download } from 'lucide-react';
import { downloadCSV, exportFilename } from '../utils/csv';

/**
 * ImportResultModal — shown after any CSV import/update operation.
 *
 * Props:
 *   result  — { created, updated, skipped, errors: [{ row, message }] }
 *   entity  — "medicines" | "customers" | "doctors" | "suppliers"
 *   mode    — "import" | "update"
 *   onClose — close handler
 */
export default function ImportResultModal({ result, entity, mode, onClose }) {
  if (!result) return null;

  const { created = 0, updated = 0, skipped = 0, errors = [] } = result;
  const total = created + updated + skipped + errors.length;
  const success = created + updated;
  const hasErrors = errors.length > 0;

  const downloadErrors = () => {
    if (!errors.length) return;
    const header = 'Row,Error';
    const body = errors.map(e => `${e.row},"${String(e.message).replace(/"/g, '""')}"`).join('\r\n');
    downloadCSV(exportFilename(`${entity}_errors`), header + '\r\n' + body);
  };

  return (
    <Modal
      title={`CSV ${mode === 'update' ? 'Update' : 'Import'} Result`}
      onClose={onClose}
      width={520}
    >
      <div style={{ padding: '8px 0' }}>
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <SummaryCard icon={CheckCircle2} label="Created" value={created} color="var(--green-600, #16a34a)" />
          <SummaryCard icon={CheckCircle2} label="Updated" value={updated} color="var(--blue-600, #2563eb)" />
          <SummaryCard icon={AlertTriangle} label="Skipped" value={skipped} color="var(--amber-600, #d97706)" />
          <SummaryCard icon={XCircle} label="Errors" value={errors.length} color="var(--red-600, #dc2626)" />
        </div>

        {/* Success banner */}
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: hasErrors ? 'rgba(234, 179, 8, 0.08)' : 'rgba(34, 197, 94, 0.08)',
          border: `1px solid ${hasErrors ? 'rgba(234, 179, 8, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
          marginBottom: hasErrors ? 16 : 0,
          fontSize: 14,
        }}>
          {hasErrors
            ? `Processed ${total} rows: ${success} succeeded, ${errors.length} failed.`
            : `All ${total} rows processed successfully!`
          }
        </div>

        {/* Error Details */}
        {hasErrors && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Error Details</span>
              <Button variant="ghost" size="sm" icon={Download} onClick={downloadErrors}>
                Download Errors
              </Button>
            </div>
            <div style={{
              maxHeight: 200,
              overflowY: 'auto',
              border: '1px solid var(--border, rgba(0,0,0,0.08))',
              borderRadius: 8,
              fontSize: 13,
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.03)', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, width: 60 }}>Row</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border, rgba(0,0,0,0.06))' }}>
                      <td style={{ padding: '6px 12px' }}>
                        <Badge tone="red">{e.row}</Badge>
                      </td>
                      <td style={{ padding: '6px 12px', color: 'var(--red-600, #dc2626)' }}>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '12px 8px',
      borderRadius: 10,
      background: 'rgba(0,0,0,0.02)',
      border: '1px solid var(--border, rgba(0,0,0,0.06))',
    }}>
      <Icon size={18} style={{ color, marginBottom: 4 }} />
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  );
}
