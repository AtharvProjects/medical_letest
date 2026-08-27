/**
 * Frontend CSV helpers for AthassMediSync.
 */

/**
 * Trigger a browser download of a CSV file.
 * @param {string} filename  e.g. "medicines_export.csv"
 * @param {string} csvText   Raw CSV content
 */
export function downloadCSV(filename, csvText) {
  // Add BOM so Excel opens with correct encoding
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Read a File object as text (Promise wrapper around FileReader).
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Generate a timestamped filename for exports.
 * @param {string} prefix  e.g. "medicines"
 * @returns {string}       e.g. "medicines_2026-08-27.csv"
 */
export function exportFilename(prefix) {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  return `${prefix}_${date}.csv`;
}
