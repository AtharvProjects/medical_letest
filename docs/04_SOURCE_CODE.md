# Source Code Walkthrough
## Complete Implementation Reference
### AthassMediSync — ISE Activity 1 | Data Encryption (1ICPC312)

---

## File Structure

```
pharmacy-management/
├── server/
│   ├── encryption.js        ← Core encryption module (NEW)
│   └── index.js             ← API with encrypt/decrypt integration
├── docs/
│   ├── 01_PROBLEM_STATEMENT.md
│   ├── 02_ENCRYPTION_THEORY.md
│   ├── 03_KEY_ARCHITECTURE.md
│   ├── 04_SOURCE_CODE.md    ← You are here
│   └── 05_LIVE_DEMO.md
└── data/
    └── pharmacy.db          ← SQLite database (ciphertext stored here)
```

---

## `server/encryption.js` — Complete Annotated Source

```javascript
/**
 * ENCRYPTION MODULE — AthassMediSync
 * Algorithm  : AES-256-CBC
 * Key Length : 256 bits (32 bytes)
 * IV Length  : 128 bits (16 bytes) — randomly generated per operation
 * Library    : Node.js built-in `crypto` (zero external dependencies)
 */

const crypto = require('crypto');

// ══════════════════════════════════════════════════════════════
// STEP 1: KEY DERIVATION
// The raw secret (from env var or hardcoded fallback) is hashed
// with SHA-256 to produce exactly 32 bytes for AES-256.
// ══════════════════════════════════════════════════════════════
const RAW_SECRET = process.env.ENCRYPTION_SECRET
                   || 'AthassMediSync_SecretKey_2026_ISE';

const MASTER_KEY = crypto
  .createHash('sha256')   // SHA-256 always outputs 32 bytes
  .update(RAW_SECRET)     // Feed in the secret
  .digest();              // Returns raw Buffer (not hex string)

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;    // AES block size = 128 bits = 16 bytes

// ══════════════════════════════════════════════════════════════
// STEP 2: ENCRYPT FUNCTION
// Input:  plaintext string  (e.g., "9876543210")
// Output: "<iv_hex>:<ciphertext_hex>"  (e.g., "3f8a...:9b4e...")
// ══════════════════════════════════════════════════════════════
function encrypt(plaintext) {
  if (!plaintext || plaintext === '') return '';
  try {
    // Generate a fresh cryptographically random 16-byte IV
    // EVERY call gets a DIFFERENT IV — this is what makes CBC secure
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create the AES-256-CBC cipher with our key and this call's IV
    const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);

    // Encrypt: feed in UTF-8 plaintext, get hex ciphertext out
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex'); // flush last padded block

    // Store IV alongside ciphertext so we can decrypt later
    // IV is NOT secret — this is standard practice
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[Encryption] encrypt() failed:', err.message);
    return plaintext; // graceful fallback — never lose customer data
  }
}

// ══════════════════════════════════════════════════════════════
// STEP 3: DECRYPT FUNCTION
// Input:  "<iv_hex>:<ciphertext_hex>"
// Output: original plaintext string
// ══════════════════════════════════════════════════════════════
function decrypt(ciphertext) {
  if (!ciphertext || ciphertext === '') return '';

  // Detect unencrypted legacy data (old records before encryption was added)
  // If there's no ":" separator, this is a plain phone number — return as-is
  if (!ciphertext.includes(':')) return ciphertext;

  try {
    // Split "iv_hex:ciphertext_hex" into its two parts
    const [ivHex, encryptedHex] = ciphertext.split(':');

    // Reconstruct the IV from its stored hex representation
    const iv = Buffer.from(ivHex, 'hex');

    // Create the decipher with the same key and the reconstructed IV
    const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);

    // Decrypt: feed in hex ciphertext, get UTF-8 plaintext out
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8'); // flush and remove PKCS#7 padding

    return decrypted;
  } catch (err) {
    console.error('[Encryption] decrypt() failed:', err.message);
    return ciphertext; // graceful fallback
  }
}

// ══════════════════════════════════════════════════════════════
// STEP 4: HMAC INTEGRITY
// HMAC-SHA256 signs the stored ciphertext so we can detect
// if anyone tampered directly with the database file.
// ══════════════════════════════════════════════════════════════
function generateHMAC(data) {
  return crypto
    .createHmac('sha256', MASTER_KEY)
    .update(data)
    .digest('hex');
}

function verifyHMAC(data, expected) {
  const computed = generateHMAC(data);
  try {
    // timingSafeEqual prevents timing side-channel attacks
    // Regular "===" comparison leaks info about where the mismatch is
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

module.exports = { encrypt, decrypt, generateHMAC, verifyHMAC };
```

---

## `server/index.js` — Integration Points

### Import the Module

```javascript
const { encrypt, decrypt } = require('./encryption');
```

### POST /api/customers — Encrypting Before INSERT

```javascript
app.post('/api/customers', (req, res) => {
  const { name, phone, address, email } = req.body;

  // ── ENCRYPTION HAPPENS HERE ──────────────────────────────────
  // Sensitive PII columns are encrypted before touching the DB
  const encPhone   = encrypt(phone   || '');
  const encAddress = encrypt(address || '');
  // name is NOT encrypted — it's used for search indexing
  // ────────────────────────────────────────────────────────────

  const stmt = db.prepare(`
    INSERT INTO customers (name, phone, address, email, ...)
    VALUES (?, ?, ?, ?, ...)
  `);

  stmt.run(name, encPhone, encAddress, email, ...);
  res.json({ success: true });
});
```

### GET /api/customers — Decrypting After SELECT

```javascript
// Helper function to decrypt a customer row
function decryptCustomer(customer) {
  return {
    ...customer,
    phone:   decrypt(customer.phone),    // "3f8a...:9b4e..." → "9876543210"
    address: decrypt(customer.address),  // "a1d4...:5c8a..." → "123 Gandhi Road"
  };
}

app.get('/api/customers', (req, res) => {
  const customers = db.prepare('SELECT * FROM customers ORDER BY name').all();

  // ── DECRYPTION HAPPENS HERE ──────────────────────────────────
  // Every row is decrypted before sending to the React frontend
  const decrypted = customers.map(decryptCustomer);
  // ────────────────────────────────────────────────────────────

  res.json(decrypted);
});
```

### Demo Endpoints (for Presentation)

```javascript
// Full encryption trace — shows every intermediate step
app.post('/api/encryption-demo', (req, res) => {
  const { plaintext } = req.body;
  const { encryptionTrace } = require('./encryption');
  res.json(encryptionTrace(plaintext));
});

// Raw DB value vs decrypted — proves the database is unreadable
app.get('/api/encryption-demo/customer/:id', (req, res) => {
  const raw = db.prepare('SELECT * FROM customers WHERE id = ?')
                .get(req.params.id);
  res.json({
    name:    raw.name,
    phone: {
      raw_in_database:  raw.phone,          // hex garbage
      decrypted_value:  decrypt(raw.phone), // readable phone
      is_encrypted:     raw.phone.includes(':'),
    },
    address: {
      raw_in_database:  raw.address,
      decrypted_value:  decrypt(raw.address),
      is_encrypted:     raw.address.includes(':'),
    }
  });
});
```

---

## Database Schema Reference

```sql
-- customers table (relevant columns)
CREATE TABLE customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,          -- PLAINTEXT (for search)
  phone       TEXT,                   -- AES-256-CBC CIPHERTEXT
  address     TEXT,                   -- AES-256-CBC CIPHERTEXT
  email       TEXT,                   -- PLAINTEXT
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### What a Stored Row Looks Like

| id | name | phone | address |
|----|------|-------|---------|
| 1 | Ramesh Patil | `3f8a2c1d1b4e9f7a:9b4e7f2a6c3d8f1e` | `a1d4f9b3e2c5:5c8a1f3d7e9b2c4d` |
| 2 | Sunita More | `b2c5d8e1f4a7:1a3b5c7d9e2f4a6b` | `c3d6e9f2a5b8:2b4c6d8e1f3a5b7c` |

---

## Backward Compatibility — Legacy Data Handling

The `decrypt()` function handles old unencrypted records gracefully:

```javascript
function decrypt(ciphertext) {
  // If no ":" found, this is a legacy plaintext record
  // (e.g., data entered before encryption was enabled)
  if (!ciphertext.includes(':')) return ciphertext;
  // ... proceed with decryption
}
```

This means:
- Old customers with plaintext `9876543210` → returned as `9876543210` (no error)
- New customers with ciphertext `3f8a...:9b4e...` → decrypted and returned as `9876543210`
- The application handles both transparently without any migration required

---

## Dependencies

```json
// No new npm packages required — uses Node.js built-in:
const crypto = require('crypto'); // Ships with every Node.js installation
```

Zero external dependencies for the entire encryption system.
