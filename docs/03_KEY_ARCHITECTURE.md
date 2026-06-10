# Key Design & Architecture
## Key Management, Key Sharing, and Data Flow
### AthassMediSync — ISE Activity 1 | Data Encryption (1ICPC312)

---

## 1. The Master Key

### Derivation

The AES-256 master key is derived from a secret string using SHA-256:

```javascript
// server/encryption.js

const RAW_SECRET = process.env.ENCRYPTION_SECRET
                   || 'AthassMediSync_SecretKey_2026_ISE';

const MASTER_KEY = crypto.createHash('sha256')
                          .update(RAW_SECRET)
                          .digest(); // 32 bytes = 256 bits
```

### Key Properties

| Property | Value |
|----------|-------|
| Algorithm | SHA-256 of a secret string |
| Length | 32 bytes (256 bits) |
| Lives in | **RAM only** during runtime |
| Written to disk? | **NEVER** |
| Written to logs? | **NEVER** |
| Source | Environment variable `ENCRYPTION_SECRET` |

---

## 2. Key Storage Architecture

### Development / College Demo

```
┌────────────────────────────────────────────────────────────────┐
│                   COLLEGE DEMO SETUP                           │
│                                                                │
│  Hardcoded fallback in source:                                 │
│  'AthassMediSync_SecretKey_2026_ISE'                      │
│          ↓                                                     │
│  SHA-256 → MASTER_KEY (32 bytes, held in memory)              │
│          ↓                                                     │
│  Used for AES-256-CBC + HMAC-SHA256                            │
│                                                                │
│  NOTE: Hardcoded keys are acceptable ONLY for demos.          │
└────────────────────────────────────────────────────────────────┘
```

### Production Setup (What a Real System Would Do)

```
┌────────────────────────────────────────────────────────────────┐
│                   PRODUCTION SETUP                             │
│                                                                │
│  OS Keychain / HSM (Hardware Security Module)                  │
│          ↓                                                     │
│  ENCRYPTION_SECRET=<128-char random secret>  (env variable)   │
│          ↓                                                     │
│  SHA-256 → MASTER_KEY (in memory, never serialised)           │
│          ↓                                                     │
│  Encryption at write, decryption at read                       │
│                                                                │
│  Key rotation: versioned keys with re-encryption jobs          │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Full Application Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        REACT FRONTEND                            │
│                                                                  │
│   Billing UI  │  Customer UI  │  Inventory UI  │  Reports UI    │
│                                                                  │
│   User sees plaintext: "9876543210"  "123 Gandhi Road, Pune"    │
└───────────────────────────┬──────────────────────────────────────┘
                            │  HTTP (localhost only)
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│                     NODE.JS EXPRESS API                          │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              server/encryption.js                       │   │
│   │                                                         │   │
│   │   MASTER_KEY  (in memory, from env var)                 │   │
│   │       ↓                                                 │   │
│   │   encrypt(phone)   →  "3f8a...:9b4e..."                │   │
│   │   decrypt("3f8a...:9b4e...")  →  "9876543210"           │   │
│   │   generateHMAC(data)  →  "a3c7f9b2..."                 │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   POST /api/customers  → encrypt → INSERT into DB               │
│   GET  /api/customers  → SELECT from DB → decrypt → respond     │
└───────────────────────────┬──────────────────────────────────────┘
                            │  better-sqlite3 (synchronous)
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│                    SQLITE DATABASE FILE                          │
│                    data/pharmacy.db                              │
│                                                                  │
│   customers table:                                               │
│   ┌────┬──────────────┬────────────────────────────────────┐    │
│   │ id │     name     │             phone                  │    │
│   ├────┼──────────────┼────────────────────────────────────┤    │
│   │  1 │ Ramesh Patil │ 3f8a2c1d1b4e9f7a:9b4e7f2a6c3d...  │    │
│   │  2 │ Sunita More  │ a1d4f9b3e2c5f8a1:5c8a1f3d7e9b...  │    │
│   └────┴──────────────┴────────────────────────────────────┘    │
│                                                                  │
│   An attacker who steals this file sees ONLY hex garbage.       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Write Path — Encrypting Customer Data

When a new customer is saved via the UI:

```
Step 1: User inputs
        name    = "Ramesh Patil"
        phone   = "9876543210"
        address = "123 Gandhi Road, Pune"

Step 2: API receives POST /api/customers

Step 3: Encryption module called
        iv_phone    = crypto.randomBytes(16)     → e.g., 3f8a2c1d1b4e9f7a2b5c8d3e6f1a4b7c
        cipher_phone = AES-256-CBC(MASTER_KEY, iv_phone, "9876543210")
        stored_phone = "3f8a2c1d1b4e9f7a2b5c8d3e6f1a4b7c:9b4e7f2a6c3d8f1e5b2a"

        iv_addr      = crypto.randomBytes(16)     → e.g., a1d4f9b3e2c5f8a12b3c4d5e6f7a8b9c
        cipher_addr  = AES-256-CBC(MASTER_KEY, iv_addr, "123 Gandhi Road, Pune")
        stored_addr  = "a1d4f9b3e2c5f8a12b3c4d5e6f7a8b9c:5c8a1f3d7e9b2c4d6e..."

Step 4: SQLite INSERT
        INSERT INTO customers (name, phone, address)
        VALUES ("Ramesh Patil", "3f8a...:9b4e...", "a1d4...:5c8a...")

        name stays plaintext (needed for search)
        phone and address stored as ciphertext
```

---

## 5. Read Path — Decrypting for Display

When the customer list is fetched:

```
Step 1: API receives GET /api/customers

Step 2: SQLite SELECT
        Returns rows with encrypted phone and address

Step 3: Decryption module called for each row
        stored_phone = "3f8a2c1d1b4e9f7a2b5c8d3e6f1a4b7c:9b4e7f2a..."

        Split by ":":
          iv_hex         = "3f8a2c1d1b4e9f7a2b5c8d3e6f1a4b7c"
          ciphertext_hex = "9b4e7f2a..."

        iv      = Buffer.from(iv_hex, 'hex')           → 16 bytes
        decipher = AES-256-CBC-Decrypt(MASTER_KEY, iv)
        phone    = "9876543210"  ← original plaintext restored

Step 4: API responds with plaintext values
        React UI displays "9876543210" to the user
```

---

## 6. IV Lifecycle

```
                    WRITE TIME
                        │
              crypto.randomBytes(16)
                        │
                   Random IV
                  (unique every call)
                        │
            ┌───────────┴──────────────┐
            │                          │
     Used as cipher input        Stored in DB
     (first 16 bytes of key      as hex prefix
      stream setup)              before ciphertext
            │                          │
            └───────────┬──────────────┘
                        │
                    READ TIME
                        │
              Extract IV from
              stored "iv:ciphertext"
                        │
              Use IV + MASTER_KEY
              to initialise decipher
                        │
                  Plaintext
```

---

## 7. Key Sharing in a Multi-User Scenario

In a real production pharmacy with multiple terminals:

```
┌──────────────────────────────────────────────────────────────┐
│                     KEY SHARING MODEL                        │
│                                                              │
│  Central Server (Backend)                                    │
│  ├── Holds MASTER_KEY in memory                              │
│  ├── All API requests go through this server                 │
│  └── Key NEVER leaves the server process                     │
│                                                              │
│  Terminal 1 (Billing Counter)                                │
│  └── Sends API requests → server decrypts → returns data     │
│                                                              │
│  Terminal 2 (Inventory Counter)                              │
│  └── Sends API requests → server decrypts → returns data     │
│                                                              │
│  Database File (pharmacy.db)                                 │
│  └── Stores ONLY ciphertext — useless without the server    │
│                                                              │
│  KEY PRINCIPLE: The key never touches the database layer.   │
│  The database only ever sees and stores ciphertext.          │
└──────────────────────────────────────────────────────────────┘
```

This is called **centralised key management** — the gold standard for application-layer encryption.

---

## 8. What Happens If the Key is Lost?

This is the critical trade-off of encryption:

| Scenario | Consequence |
|----------|-------------|
| Key lost, DB intact | All encrypted data is **permanently unrecoverable** |
| Key safe, DB corrupted | Data is lost (DB corruption, not encryption issue) |
| Key changed | All existing ciphertext must be re-encrypted with the new key |

**Recommendation:** In production, the master key must be backed up to a separate, physically secure location (printed QR code in a safe, encrypted USB in a bank vault, etc.) — completely separate from where the database backup is stored.

---

## 9. Security Boundary Summary

```
┌─────────────────────────────────────────┐
│  TRUSTED ZONE (Application + Key)       │
│                                         │
│  Node.js process memory                 │
│  → MASTER_KEY lives here                │
│  → encrypt() / decrypt() run here       │
│                                         │
│  Environment variable (ENCRYPTION_SECRET)│
│  → Source of the key material           │
└─────────────────────────────────────────┘
            │ BOUNDARY (application layer encryption)
            ↓
┌─────────────────────────────────────────┐
│  UNTRUSTED ZONE (Database File)         │
│                                         │
│  pharmacy.db                            │
│  → Contains ONLY ciphertext             │
│  → Useless to any attacker              │
│  → Can be safely backed up to cloud     │
│                                         │
└─────────────────────────────────────────┘
```
