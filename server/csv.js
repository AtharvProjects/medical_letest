/**
 * CSV Parser & Serializer — zero-dependency utility for AthassMediSync.
 *
 * Handles:
 *  • Quoted fields (commas, newlines inside quotes)
 *  • Double-quote escaping ("")
 *  • CRLF / LF line endings
 *  • BOM stripping (Excel likes to add a BOM)
 *  • Header normalisation (e.g. "Brand Name" → "brand_name")
 */

// ── Parse ────────────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into an array of plain objects keyed by normalised headers.
 * @param {string} text  Raw CSV text
 * @returns {{ headers: string[], rows: object[] }}
 */
function parseCSV(text) {
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const lines = splitCSVLines(text);
  if (lines.length === 0) return { headers: [], rows: [] };

  const rawHeaders = parseCSVRow(lines[0]);
  const headers = rawHeaders.map(normaliseHeader);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVRow(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (values[idx] ?? '').trim();
    });
    rows.push(obj);
  }

  return { headers, rows };
}

/**
 * Split raw CSV text into logical lines (respecting quoted fields that span
 * multiple lines).
 */
function splitCSVLines(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      lines.push(current);
      current = '';
      // Skip \r\n pair
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

/**
 * Parse a single CSV row into an array of field values.
 */
function parseCSVRow(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Normalise a header label:  "Brand Name" → "brand_name", "GST %" → "gst_percent"
 */
function normaliseHeader(h) {
  return h
    .trim()
    .toLowerCase()
    .replace(/%/g, 'percent')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ── Serialise ────────────────────────────────────────────────────────────────

/**
 * Convert an array of objects to a CSV string.
 * @param {object[]} rows
 * @param {string[]} columns  Column keys in desired order
 * @param {object}   [labels] Optional map of key → display header
 * @returns {string}
 */
function toCSV(rows, columns, labels = {}) {
  const header = columns.map(c => escapeCSVField(labels[c] || c));
  const body = rows.map(row =>
    columns.map(c => escapeCSVField(row[c] ?? '')).join(',')
  );
  return [header.join(','), ...body].join('\r\n');
}

function escapeCSVField(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

module.exports = { parseCSV, toCSV };
