# AthassMediSync — Pharmacy Management System

A production-ready pharmacy management system for small to medium Indian medical stores. Built with React, Node.js, Express, SQLite, and Electron.

---

## ISE Activity 1 — Data Encryption (1ICPC312)

**Subject:** ISE – Activity 1 Presentation Schedule
**Course:** Data Encryption (1ICPC312)
**Class:** T.Y. – Semester EVEN
**Topic:** Application-Driven Encryption Design and Implementation

---

## Documentation Index

| # | File | Contents |
|---|------|----------|
| 1 | [docs/01_PROBLEM_STATEMENT.md](docs/01_PROBLEM_STATEMENT.md) | Real-world threat model, why encryption is needed, scope of encryption in this app |
| 2 | [docs/02_ENCRYPTION_THEORY.md](docs/02_ENCRYPTION_THEORY.md) | AES theory, CBC mode, IV, HMAC-SHA256, SHA-256 key derivation — full theory |
| 3 | [docs/03_KEY_ARCHITECTURE.md](docs/03_KEY_ARCHITECTURE.md) | Key derivation, key storage, full system architecture diagram, data flow write/read paths |
| 4 | [docs/04_SOURCE_CODE.md](docs/04_SOURCE_CODE.md) | Fully annotated source code for `encryption.js` and integration in `index.js` |
| 5 | [docs/05_LIVE_DEMO.md](docs/05_LIVE_DEMO.md) | 6 step-by-step live demonstrations with exact curl commands and expected outputs |

---

## Quick Start

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (Vite), Lucide Icons, Recharts, jsPDF |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| Desktop | Electron |
| Encryption | Node.js built-in `crypto` — AES-256-CBC, HMAC-SHA256 |
