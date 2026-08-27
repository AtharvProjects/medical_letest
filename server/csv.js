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
 * High-Performance Single-Pass CSV Parser
 * Handles BOM, CRLF, embedded quotes, and multi-line fields in O(N) time with minimal allocations.
 * @param {string} text  Raw CSV text
 * @returns {{ headers: string[], rows: object[] }}
 */
function parseCSV(text) {
  if (typeof text !== 'string') return { headers: [], rows: [] };
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const len = text.length;
  if (!len) return { headers: [], rows: [] };

  const rawRows = [];
  let currentRow = [];
  let inQuotes = false;
  let fieldStart = 0;
  let isEscaped = false;

  for (let i = 0; i < len; i++) {
    const ch = text.charCodeAt(i);

    if (ch === 34) { // "
      if (inQuotes && text.charCodeAt(i + 1) === 34) {
        isEscaped = true;
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === 44 && !inQuotes) { // ,
      let val = text.slice(fieldStart, i).trim();
      if (val.charCodeAt(0) === 34 && val.charCodeAt(val.length - 1) === 34) {
        val = val.slice(1, -1);
      }
      if (isEscaped) val = val.replace(/""/g, '"');
      currentRow.push(val.trim());
      fieldStart = i + 1;
      isEscaped = false;
    } else if ((ch === 10 || ch === 13) && !inQuotes) { // \n or \r
      let val = text.slice(fieldStart, i).trim();
      if (val.charCodeAt(0) === 34 && val.charCodeAt(val.length - 1) === 34) {
        val = val.slice(1, -1);
      }
      if (isEscaped) val = val.replace(/""/g, '"');
      currentRow.push(val.trim());
      fieldStart = i + 1;
      isEscaped = false;

      if (ch === 13 && text.charCodeAt(i + 1) === 10) {
        i++;
        fieldStart = i + 1;
      }

      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
        rawRows.push(currentRow);
      }
      currentRow = [];
    }
  }

  // Handle trailing field
  if (fieldStart < len || currentRow.length > 0) {
    let val = text.slice(fieldStart).trim();
    if (val.charCodeAt(0) === 34 && val.charCodeAt(val.length - 1) === 34) {
      val = val.slice(1, -1);
    }
    if (isEscaped) val = val.replace(/""/g, '"');
    currentRow.push(val.trim());
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
      rawRows.push(currentRow);
    }
  }

  if (rawRows.length === 0) return { headers: [], rows: [] };

  const rawHeaders = rawRows[0];
  const headers = rawHeaders.map(normaliseHeader);
  const rows = [];

  for (let r = 1; r < rawRows.length; r++) {
    const vals = rawRows[r];
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = vals[c] ?? '';
    }
    rows.push(obj);
  }

  return { headers, rows };
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

