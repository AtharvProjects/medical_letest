# Encryption Theory
## AES-256-CBC, CBC Mode, IV, and HMAC — Deep Dive
### AthassMediSync — ISE Activity 1 | Data Encryption (1ICPC312)

---

## 1. What is AES (Advanced Encryption Standard)?

AES is a **symmetric block cipher** standardised by the U.S. National Institute of Standards and Technology (NIST) in 2001 under FIPS Publication 197. It replaced DES and 3DES as the global standard for secure encryption.

### Key Properties

| Property | Value |
|----------|-------|
| Type | Symmetric (same key for encrypt and decrypt) |
| Block size | 128 bits (16 bytes) — always fixed |
| Key sizes | 128-bit, 192-bit, or **256-bit** (we use 256) |
| Structure | Substitution-Permutation Network (SPN) |
| Rounds | 14 rounds for AES-256 |

### Why AES-256 is Unbreakable (Practically)

The AES-256 key space has **2^256** possible keys:

```
2^256 = 115,792,089,237,316,195,423,570,985,008,687,907,853,
         269,984,665,640,564,039,457,584,007,913,129,639,936

≈ 1.16 × 10^77
```

Even if an attacker could test **10^18 keys per second** (faster than any supercomputer):

```
Time to brute-force = 2^256 / 10^18 seconds
                    ≈ 3.67 × 10^58 years
```

The universe is only **1.38 × 10^10 years** old. AES-256 is physically unbreakable by brute force.

---

## 2. AES Internal Structure — How One Block is Encrypted

AES operates on a 4×4 matrix of bytes called the **state**. Each of the 14 rounds (for AES-256) applies four transformations:

```
Plaintext Block (128 bits)
        ↓
  AddRoundKey  ← XOR with expanded key
        ↓
  SubBytes     ← Non-linear S-Box substitution (confusion)
        ↓
  ShiftRows    ← Cyclic row shift (diffusion)
        ↓
  MixColumns   ← Matrix multiplication in GF(2^8) (diffusion)
        ↓
  (repeat 13 more times)
        ↓
  Final AddRoundKey
        ↓
Ciphertext Block (128 bits)
```

**SubBytes** provides **confusion** — the relationship between key and ciphertext is obscured.
**ShiftRows + MixColumns** provide **diffusion** — one plaintext bit change affects many ciphertext bits.

---

## 3. CBC Mode (Cipher Block Chaining)

AES alone is a block cipher — it only encrypts one 128-bit block at a time. For longer data, we need a **mode of operation**. We use **CBC (Cipher Block Chaining)**.

### CBC Encryption

```
  IV (Random 128-bit)
        ↓
Plaintext Block 1 ──XOR──→ AES Encrypt(KEY) ──→ Ciphertext Block 1
                                                          ↓ (fed as input)
Plaintext Block 2 ──XOR──→ AES Encrypt(KEY) ──→ Ciphertext Block 2
                                                          ↓
Plaintext Block 3 ──XOR──→ AES Encrypt(KEY) ──→ Ciphertext Block 3
```

### CBC Decryption

```
Ciphertext Block 1 ──→ AES Decrypt(KEY) ──XOR──→ Plaintext Block 1
        ↓ (fed back)                  ↑ IV
Ciphertext Block 2 ──→ AES Decrypt(KEY) ──XOR──→ Plaintext Block 2
        ↓
Ciphertext Block 3 ──→ AES Decrypt(KEY) ──XOR──→ Plaintext Block 3
```

### Why CBC and Not ECB?

ECB (Electronic Codebook) — the naive mode — encrypts each block independently:

```
ECB Problem:
  "9876543210" (customer A) → X4F9A...  (always same ciphertext)
  "9876543210" (customer B) → X4F9A...  (always same ciphertext!)
```

An attacker can see that two customers share the same phone number — **pattern analysis attack**.

CBC solves this because the IV is random for every encryption call:

```
CBC Solution:
  "9876543210" (customer A, IV=R1) → 3f8a2c1d...9b4e...  (unique)
  "9876543210" (customer B, IV=R2) → a1d4f9b3...5c8a...  (completely different!)
```

---

## 4. Initialization Vector (IV)

### What is an IV?

An IV is a **random 128-bit (16-byte) value** generated fresh for every single encryption operation using a cryptographically secure random number generator.

```javascript
const iv = crypto.randomBytes(16); // 128 bits of cryptographic randomness
```

### IV Properties

| Property | Value |
|----------|-------|
| Size | 128 bits (16 bytes) — must equal AES block size |
| Randomness source | OS CSPRNG (`/dev/urandom` on Linux/macOS) |
| Secret? | **NO** — the IV is public and stored alongside ciphertext |
| Purpose | Ensures probabilistic encryption (same input → different output) |
| Required for decryption? | **YES** — must be stored and transmitted with ciphertext |

### IV Storage in This App

The IV is stored as a hex prefix, separated by a colon:

```
Format: <iv_hex>:<ciphertext_hex>

Example stored in DB:
3f8a2c1d1b4e9f7a2b5c8d3e6f1a4b7c:9b4e7f2a6c3d8f1e5b2a7c4d9e6f3a1b2c5d

↑ IV (32 hex chars = 16 bytes = 128 bits)   ↑ Ciphertext (variable length)
```

This is the standard industry practice used by tools like OpenSSL.

---

## 5. HMAC-SHA256 (Data Integrity)

### What is HMAC?

**HMAC (Hash-based Message Authentication Code)** is a cryptographic signature that proves data integrity. If the stored ciphertext is modified by an attacker, the HMAC signature will not match.

### Formula

```
HMAC-SHA256(key, message) = H( (key XOR opad) || H( (key XOR ipad) || message ) )

Where:
  H   = SHA-256 hash function
  ||  = concatenation
  opad = outer padding (0x5c repeated)
  ipad = inner padding (0x36 repeated)
```

### HMAC in This App

```javascript
// Sign the stored ciphertext
const signature = crypto.createHmac('sha256', MASTER_KEY)
                         .update(storedCiphertext)
                         .digest('hex');

// Verify — using timing-safe comparison to prevent timing attacks
crypto.timingSafeEqual(
  Buffer.from(computed_hmac, 'hex'),
  Buffer.from(stored_hmac, 'hex')
);
```

### Why `timingSafeEqual`?

A regular string comparison (`===`) short-circuits on the first mismatched character. An attacker can measure response times to determine how many characters of the HMAC they've guessed correctly — a **timing side-channel attack**. `timingSafeEqual` always takes the same time regardless of where the mismatch occurs.

---

## 6. SHA-256 (Key Derivation)

We use SHA-256 to derive the AES master key from a secret string:

```javascript
// Input: arbitrary-length string secret
// Output: exactly 32 bytes (256 bits) — the AES-256 key
const MASTER_KEY = crypto.createHash('sha256')
                          .update('AthassMediSync_SecretKey_2026_ISE')
                          .digest(); // returns raw bytes (Buffer)
```

**Why hash the key?**
AES-256 requires exactly 32 bytes. SHA-256 always produces exactly 32 bytes regardless of input length. This is called **key stretching** (simplified form).

---

## 7. Summary: Cryptographic Primitives Used

| Primitive | Algorithm | Purpose | Output Size |
|-----------|-----------|---------|-------------|
| Symmetric cipher | AES-256-CBC | Encrypt/decrypt PII | Variable |
| Key derivation | SHA-256 | Stretch secret → 32-byte key | 32 bytes |
| Random IV | OS CSPRNG | Ensure probabilistic encryption | 16 bytes |
| Integrity check | HMAC-SHA256 | Detect database tampering | 32 bytes |
| Safe comparison | `timingSafeEqual` | Prevent timing side-channel attacks | Boolean |
