# Live Demonstration Guide
## Step-by-Step Proof of Encryption Working
### AthassMediSync — ISE Activity 1 | Data Encryption (1ICPC312)

---

## Prerequisites

### Step 0 — Seed 1-Year of Demo Data (One Time)

> **Do this ONCE before the demo. Skip if data is already seeded.**

```powershell
# 1. Rebuild native module for Node.js
$env:PATH = "C:\Users\ashitosh\.gemini\antigravity-ide\scratch\node-v20.12.0-win-arm64;$env:PATH"
npm rebuild better-sqlite3

# 2. Clear old DB (if any)
Remove-Item data\pharmacy.db, data\pharmacy.db-shm, data\pharmacy.db-wal -Force -ErrorAction SilentlyContinue

# 3. Init schema + seed data (runs inside Electron for ARM64 SQLite support)
node_modules\electron\dist\electron.exe scripts/run-seed.js --no-sandbox

# 4. Rebuild for Node.js again (needed for npm run server)
npm rebuild better-sqlite3

# 5. Start the server and generate a license
npm run server   # starts on port 3001

# In another terminal, generate and activate license:
node scripts/generate-license.js <YOUR-HARDWARE-ID> never
# Then activate via PowerShell:
# Invoke-RestMethod -Uri http://127.0.0.1:3001/api/license/activate -Method Post -Body (@{key="<LICENSE_KEY>"} | ConvertTo-Json) -ContentType "application/json"
```

The seed inserts:
| Entity | Count |
|--------|-------|
| Medicines | 49 (Antibiotics, Cardiac, Diabetes, Vitamins, etc.) |
| Suppliers | 5 (Pune-based distributors) |
| Doctors | 8 (Specialists across Pune hospitals) |
| Customers | 25 (Pune residents with addresses) |
| Batches | 98 (dual batches per medicine) |
| Purchases | 24 (2 per month × 12 months) |
| Invoices | ~1,985 (3-8 bills/day × 365 days) |
| Revenue | ~₹6,96,601 |

> **Low-stock demo items**: Augmentin 625, Pantocid DSR, Thyronorm 50, Januvia 50, Montek LC
> **Expiry alerts**: Several batches near/past expiry date for demo

```bash
# Start the application
npm run dev

# The server will be running at:
# API:      http://localhost:3001
# Frontend: http://localhost:5173
```

---

## Demo 1 — Encrypt Any Text and See the Full Trace

This is the most impactful demo. Run this in a terminal:

```bash
curl -X POST http://localhost:3001/api/encryption-demo \
  -H "Content-Type: application/json" \
  -d '{"plaintext": "9876543210"}'
```

### Expected Output

```json
{
  "algorithm": "aes-256-cbc",
  "keyLength": "256 bits",
  "keyHex": "f151bba25c996c0b3cd4f6e0fcd59db2b...",
  "ivHex": "3f8a2c1d1b4e9f7a2b5c8d3e6f1a4b7c",
  "plaintext": "9876543210",
  "plaintextHex": "39383736353433323130",
  "ciphertextHex": "9b4e7f2a6c3d8f1e5b2a7c4d9e6f3a1b",
  "storedFormat": "3f8a2c1d1b4e9f7a2b5c8d3e6f1a4b7c:9b4e7f2a6c3d8f1e5b2a",
  "hmac": "a3c7f9b2e1d4c5b6a7f8e9d0c1b2a3f4...",
  "charCount": {
    "before": 10,
    "after": 97
  },
  "decryptedVerification": "9876543210",
  "securityNotes": [
    "IV is randomly generated for EVERY encryption call — same input → different output each time.",
    "AES-256 key space = 2^256 ≈ 1.16 × 10^77 — brute force is computationally infeasible.",
    "CBC mode chains blocks: each ciphertext block depends on the previous block.",
    "HMAC-SHA256 signature detects any tampering with the stored ciphertext.",
    "IV is NOT secret — it is safe to store alongside ciphertext."
  ]
}
```

### What to Explain to the Examiner

| Field | What it proves |
|-------|---------------|
| `algorithm` | AES-256-CBC is being used |
| `keyLength` | 256-bit key — gold standard |
| `ivHex` | Random IV — different every call |
| `plaintextHex` | The phone number in raw bytes |
| `ciphertextHex` | The encrypted, unreadable output |
| `storedFormat` | Exactly what is saved in the database |
| `decryptedVerification` | Proves decryption recovers the original value |

---

## Demo 2 — Prove CBC Randomness (Same Input → Different Output)

Run the **exact same command twice** and compare the output:

```bash
# First call
curl -X POST http://localhost:3001/api/encryption-demo \
  -H "Content-Type: application/json" \
  -d '{"plaintext": "9876543210"}'

# Second call (identical input)
curl -X POST http://localhost:3001/api/encryption-demo \
  -H "Content-Type: application/json" \
  -d '{"plaintext": "9876543210"}'
```

### Expected Result

| Call | ivHex | ciphertextHex |
|------|-------|---------------|
| First | `3f8a2c1d...` | `9b4e7f2a...` |
| Second | `a7c3f1e9...` | `4d2b8f6a...` |

**The IV is different. The ciphertext is different. The input was identical.**

This proves CBC mode with random IVs is working correctly. An ECB cipher would produce identical ciphertext for identical inputs — CBC does not.

---

## Demo 3 — Add a Customer and See It Encrypted in the DB

### Step 1: Add a customer via the UI

1. Open `http://localhost:5173` in the browser
2. Navigate to the **Customers** tab
3. Click **Add Customer**
4. Enter:
   - Name: `Demo Patient`
   - Phone: `9876543210`
   - Address: `123 Gandhi Road, Pune`
5. Click **Save**

### Step 2: Get the customer's ID

```bash
curl http://localhost:3001/api/customers
```

Find the `id` for `Demo Patient` in the response. Assume it is `1`.

### Step 3: See raw DB value vs decrypted value

```bash
curl http://localhost:3001/api/encryption-demo/customer/1
```

### Expected Output

```json
{
  "demonstration": "AES-256-CBC Encryption in Action",
  "name": "Demo Patient",
  "phone": {
    "raw_in_database": "3f8a2c1d1b4e9f7a2b5c8d3e6f1a4b7c:9b4e7f2a6c3d8f1e",
    "decrypted_value": "9876543210",
    "hmac_signature":  "a3c7f9b2e1d4c5b6a7f8...",
    "is_encrypted": true
  },
  "address": {
    "raw_in_database": "a1d4f9b3e2c5f8a12b3c4d5e6f7a8b9c:5c8a1f3d7e9b2c4d",
    "decrypted_value": "123 Gandhi Road, Pune",
    "is_encrypted": true
  },
  "security_proof": {
    "what_attacker_sees":     "3f8a2c1d1b4e9f7a:9b4e7f2a6c3d8f1e",
    "what_application_shows": "9876543210",
    "algorithm":              "AES-256-CBC",
    "key_length":             "256-bit"
  }
}
```

**This is the most powerful demo slide.** Side-by-side: what the database stores vs what the user sees.

---

## Demo 4 — Open the Database File Directly (Proof of Unreadability)

### Step 1: Download DB Browser for SQLite

- Free download: https://sqlitebrowser.org/dl/

### Step 2: Open the database file

- File path: `/Users/ashitosh/orchids-projects/pharmacy-management/data/pharmacy.db`

### Step 3: Navigate to the `customers` table

Click **Browse Data** → select `customers` table.

### What You Will See

| id | name | phone | address |
|----|------|-------|---------|
| 1 | Demo Patient | `3f8a2c1d1b4e9f7a:9b4e7f2a6c3d...` | `a1d4f9b3:5c8a1f3d...` |

**The name column is readable.** This is intentional — it's needed for search.
**The phone and address columns are completely unreadable hex strings.**

Even with full access to the database file, an attacker cannot recover the phone number without the master key.

---

## Demo 5 — HMAC Tamper Detection

This demo proves that direct database manipulation is detected.

### Step 1: Get the current HMAC of a stored value

```bash
curl http://localhost:3001/api/encryption-demo/customer/1
# Note the "hmac_signature" value from the phone field
```

### Step 2: Manually edit the database (simulate an attack)

Using DB Browser for SQLite:
1. Open `pharmacy.db`
2. Browse Data → `customers` table
3. Double-click on the `phone` field for customer 1
4. Change a few characters in the hex string
5. Click **Write Changes**

### Step 3: Verify tamper detection

```bash
curl http://localhost:3001/api/encryption-demo/customer/1
```

The decrypt will either:
- Return a garbage string (if ciphertext bytes were changed)
- Throw a "bad decrypt" error (if the PKCS#7 padding is corrupted)

The HMAC signature will no longer match — proving integrity verification works.

---

## Demo 6 — Security Consideration: Pattern Analysis Prevention

Run the same phone number for two different customers:

```bash
# Customer A with phone 9876543210
curl -X POST http://localhost:3001/api/encryption-demo \
  -H "Content-Type: application/json" \
  -d '{"plaintext": "9876543210"}'

# Customer B with the SAME phone 9876543210
curl -X POST http://localhost:3001/api/encryption-demo \
  -H "Content-Type: application/json" \
  -d '{"plaintext": "9876543210"}'
```

Both produce **completely different** stored values. An attacker looking at the database **cannot tell** that two customers share the same phone number.

This is the CBC mode pattern protection working as designed.

---

## Summary Table for Presentation Slide

| What Was Proved | How | Result |
|-----------------|-----|--------|
| Data is encrypted in DB | DB Browser — open pharmacy.db | Phone shows hex garbage |
| Decryption works | `/api/encryption-demo/customer/1` | Original number restored |
| Same input → different ciphertext | Run demo endpoint twice | Different IV + ciphertext each time |
| Tamper detection | Edit DB directly, re-read | HMAC mismatch / bad decrypt |
| Pattern hiding | Two customers, same phone | DB shows completely different values |
| Zero external libraries | `server/encryption.js` | Only `require('crypto')` used |
