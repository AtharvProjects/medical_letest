# Problem Statement
## ISE Activity 1 — Data Encryption (1ICPC312) | T.Y. Semester EVEN
### AthassMediSync — Pharmacy Management System

---

## The Real-World Problem

Medical stores handle some of the most sensitive personal data in existence:

- Patient **phone numbers** and **home addresses**
- Purchase history of **controlled medicines** (antibiotics, painkillers, schedule H drugs)
- **Financial credit records** (Udhaari / outstanding balances)

### The Threat

A typical small pharmacy stores all this data in a local database file (e.g., `pharmacy.db`). This file sits on a desktop computer with no encryption. Consider these realistic attack scenarios:

| Scenario | How it Happens | Data Exposed |
|----------|---------------|--------------|
| **Stolen Laptop / PC** | Theft of the billing computer | ALL customer PII instantly readable |
| **Disgruntled Employee** | Opens the DB file with a free SQLite browser | Phone numbers, addresses, credit balances |
| **Malware / Ransomware** | Attacker exfiltrates the DB before encrypting it | Full patient purchase history |
| **SQL Injection** | If exposed to a network, attacker runs `SELECT * FROM customers` | Complete customer table in plaintext |
| **Database Backup Theft** | Backup drive stolen or cloud backup compromised | Historical data of all patients |

**Without encryption, even a non-technical thief can open a SQLite file and read everything in seconds.**

---

## The Solution

> **"Securing Sensitive Pharmaceutical Data: Designing an Encryption-Driven Pharmacy Management System to Protect Patient Privacy and Transactional Integrity."**

Implement **AES-256-CBC symmetric encryption** at the application layer so that sensitive columns are encrypted **before** being written to the database and decrypted **after** being read — completely transparently to the user.

---

## Scope of Encryption in This Application

| Table | Column | Encrypted? | Reason |
|-------|--------|:----------:|--------|
| `customers` | `phone` | **YES** | PII — directly identifies the patient |
| `customers` | `address` | **YES** | PII — patient home location |
| `customers` | `name` | No | Required for search indexing and display |
| `invoices` | All columns | No | Financial records — not direct PII |
| `medicines` | All columns | No | Public product catalogue |
| `inventory` | All columns | No | Stock management — not sensitive |

---

## Why AES-256 and Not Simpler Methods?

| Method | Problem |
|--------|---------|
| **No encryption** | Any file access = full data breach |
| **Base64 encoding** | Not encryption — trivially reversible, no key required |
| **MD5 / SHA-1 hash** | One-way — cannot recover the original phone number for display |
| **Simple XOR cipher** | Trivially broken with known-plaintext attack |
| **AES-128** | Secure but superseded; AES-256 is the current gold standard |
| **AES-256-CBC** ✅ | Military-grade, standardised (NIST FIPS 197), computationally infeasible to break |

---

## What Success Looks Like

After implementation:

1. **Before (Insecure):** Opening `pharmacy.db` in DB Browser for SQLite shows:
   ```
   customers table → phone column → 9876543210
   ```

2. **After (Secure):** Opening the same file shows:
   ```
   customers table → phone column → 3f8a2c1d1b4e9f7a:9b4e7f2a6c3d8f1e5b2a...
   ```

The application continues to work exactly as before — users see `9876543210` on screen. But the database file is now useless to an attacker without the master key.
