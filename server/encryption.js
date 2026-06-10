/**
 * ============================================================
 * ENCRYPTION MODULE — AthassMediSync
 * ============================================================
 * Algorithm  : AES-256-CBC (Advanced Encryption Standard)
 * Key Length : 256 bits (32 bytes)
 * IV Length  : 128 bits (16 bytes) — randomly generated per operation
 * Library    : Node.js built-in `crypto` (no external dependencies)
 *
 * Why AES-256-CBC?
 *  - AES is the gold standard symmetric encryption algorithm (NIST, FIPS 197)
 *  - 256-bit key = 2^256 possible keys — computationally infeasible to brute-force
 *  - CBC (Cipher Block Chaining) ensures identical plaintexts produce different
 *    ciphertexts due to the random IV, defeating pattern analysis attacks
 * ============================================================
 */

const crypto = require('crypto');

// ── KEY DERIVATION ────────────────────────────────────────────────────────────
// The raw secret is stretched into a 32-byte key using SHA-256.
// In production, load this from a secure vault / environment variable.
// For this college demo the key is embedded (clearly labelled as demo practice).
const RAW_SECRET  = process.env.ENCRYPTION_SECRET || 'AthassMediSync_SecretKey_2026_ISE';
const MASTER_KEY  = crypto.createHash('sha256').update(RAW_SECRET).digest(); // 32 bytes
const ALGORITHM   = 'aes-256-cbc';
const IV_LENGTH   = 16; // AES block size is always 128 bits = 16 bytes

// ── ENCRYPT ───────────────────────────────────────────────────────────────────
/**
 * Encrypts a UTF-8 string and returns a hex-encoded string in the format:
 *   <iv_hex>:<ciphertext_hex>
 *
 * The IV is prepended so the decrypt function can extract it.
 * Storing IV alongside ciphertext is standard practice — the IV is NOT secret.
 *
 * @param {string} plaintext - The raw string to encrypt
 * @returns {string}         - Encrypted string "<iv>:<ciphertext>" in hex
 */
function encrypt(plaintext) {
  if (!plaintext || plaintext === '') return '';
  try {
    const iv = crypto.randomBytes(IV_LENGTH);                    // fresh random IV every call
    const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[Encryption] encrypt() failed:', err.message);
    return plaintext; // graceful fallback — never lose data
  }
}

// ── DECRYPT ───────────────────────────────────────────────────────────────────
/**
 * Decrypts a string produced by encrypt().
 * Splits "<iv_hex>:<ciphertext_hex>", reconstructs the IV and key,
 * then returns the original plaintext.
 *
 * @param {string} ciphertext - Encrypted string from encrypt()
 * @returns {string}          - Original plaintext
 */
function decrypt(ciphertext) {
  if (!ciphertext || ciphertext === '') return '';
  // Detect whether this value was ever encrypted (format check)
  if (!ciphertext.includes(':')) return ciphertext; // plaintext passthrough (legacy data)
  try {
    const [ivHex, encryptedHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Encryption] decrypt() failed:', err.message);
    return ciphertext; // graceful fallback — return raw if decryption fails
  }
}

// ── HMAC INTEGRITY CHECK ──────────────────────────────────────────────────────
/**
 * Generates an HMAC-SHA256 signature for a given data string.
 * Used to verify that stored data has NOT been tampered with.
 *
 * @param {string} data - Data to sign
 * @returns {string}    - Hex-encoded HMAC digest
 */
function generateHMAC(data) {
  return crypto.createHmac('sha256', MASTER_KEY).update(data).digest('hex');
}

/**
 * Verifies an HMAC-SHA256 signature using timing-safe comparison
 * to prevent timing attacks.
 *
 * @param {string} data     - The data that was signed
 * @param {string} expected - The stored HMAC to verify against
 * @returns {boolean}       - true if the data is intact, false if tampered
 */
function verifyHMAC(data, expected) {
  const computed = generateHMAC(data);
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// ── DEMO TRACE (for college presentation) ────────────────────────────────────
/**
 * Returns a step-by-step encryption trace for a given plaintext.
 * Useful for showing exactly what happens inside the cipher at each stage.
 *
 * @param {string} plaintext - The string to trace
 * @returns {object}         - Full trace object with all intermediate values
 */
function encryptionTrace(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const ivHex = iv.toString('hex');
  const stored = `${ivHex}:${encrypted}`;
  const hmac = generateHMAC(stored);

  return {
    algorithm:        ALGORITHM,
    keyLength:        `${MASTER_KEY.length * 8} bits`,
    keyHex:           MASTER_KEY.toString('hex'),
    ivHex:            ivHex,
    ivBytes:          iv_length_bytes(iv),
    plaintext:        plaintext,
    plaintextHex:     Buffer.from(plaintext, 'utf8').toString('hex'),
    ciphertextHex:    encrypted,
    storedFormat:     stored,
    hmac:             hmac,
    charCount: {
      before: plaintext.length,
      after:  stored.length,
    },
    securityNotes: [
      'IV is randomly generated for EVERY encryption call — same input → different output each time.',
      'AES-256 key space = 2^256 ≈ 1.16 × 10^77 — brute force is computationally infeasible.',
      'CBC mode chains blocks: each ciphertext block depends on the previous block.',
      'HMAC-SHA256 signature detects any tampering with the stored ciphertext.',
      'IV is NOT secret — it is safe to store alongside ciphertext.',
    ],
    decryptedVerification: decrypt(stored),
  };
}

function iv_length_bytes(iv) {
  return Array.from(iv).map(b => b.toString(16).padStart(2,'0')).join(' ');
}

module.exports = { encrypt, decrypt, generateHMAC, verifyHMAC, encryptionTrace, MASTER_KEY, ALGORITHM };
