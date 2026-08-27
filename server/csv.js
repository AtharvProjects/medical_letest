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

/**
 * Normalize human date strings (e.g. "12/27", "12/2027", "25-11-2027", "2027-12-31") into standard "YYYY-MM-DD".
 */
function normalizeDate(str, defaultDaysFromNow = 730) {
  if (!str) {
    if (!defaultDaysFromNow) return null;
    const d = new Date();
    d.setDate(d.getDate() + defaultDaysFromNow);
    return d.toISOString().slice(0, 10);
  }
  const s = String(str).trim();
  if (!s) return null;

  // 1. YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, '-');

  // 2. DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const mon = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${mon}-${day}`;
  }

  // 3. MM/YY or MM-YY (e.g. 12/27 -> 2027-12-31)
  const myShort = s.match(/^(\d{1,2})[-/](\d{2})$/);
  if (myShort) {
    const mon = parseInt(myShort[1], 10);
    const yr = 2000 + parseInt(myShort[2], 10);
    if (mon >= 1 && mon <= 12) {
      const lastDay = new Date(yr, mon, 0).getDate();
      return `${yr}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  // 4. MM/YYYY or MM-YYYY (e.g. 12/2027 -> 2027-12-31)
  const myLong = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (myLong) {
    const mon = parseInt(myLong[1], 10);
    const yr = parseInt(myLong[2], 10);
    if (mon >= 1 && mon <= 12) {
      const lastDay = new Date(yr, mon, 0).getDate();
      return `${yr}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  // 5. YYYY-MM or YYYY/MM (e.g. 2027-12 -> 2027-12-31)
  const ym = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ym) {
    const yr = parseInt(ym[1], 10);
    const mon = parseInt(ym[2], 10);
    if (mon >= 1 && mon <= 12) {
      const lastDay = new Date(yr, mon, 0).getDate();
      return `${yr}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  // Fallback
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  if (defaultDaysFromNow) {
    const d = new Date();
    d.setDate(d.getDate() + defaultDaysFromNow);
    return d.toISOString().slice(0, 10);
  }

  return null;
}

module.exports = { parseCSV, toCSV, normalizeDate };

