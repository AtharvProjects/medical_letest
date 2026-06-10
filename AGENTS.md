## Project Summary
AthassMediSync is a fully functional, production-ready pharmacy management system designed for small to medium-sized medical stores in India. It features an Apple-style modern interface with glassmorphism effects and pastel themes. The system is built for Windows but developed using web technologies (Electron + React + Node.js) with a persistent SQLite database for offline-first usage.

## Tech Stack
- **Frontend**: React (Vite), Lucide Icons, Recharts, jsPDF
- **Backend**: Node.js (Express), better-sqlite3
- **Database**: SQLite (local persistence)
- **Desktop**: Electron
- **Style**: Custom CSS with Glassmorphism and SF Pro/Inter typography

## Architecture
- **UI Layer**: React components organized by feature (Billing, Inventory, etc.)
- **Service Layer**: Express API endpoints for business logic
- **Data Layer**: SQLite with relational schema for persistent storage
- **Service Interface**: `src/services/api.js` connects frontend to backend

## User Preferences
- Apple-style modern interface (Glassmorphism, rounded corners)
- Pastel color palette (Blue, Lavender, Mint, Peach)
- Single-page fast billing interface
- Fuzzy search for medicines and customers
- Offline-first approach

## Project Guidelines
- No placeholders or mock data; everything must connect to the database
- GST calculation and stock reduction must be real-time
- WhatsApp integration via web protocol
- PDF generation for invoices using jsPDF

## Common Patterns
- **Transactional Billing**: Stock is validated and reduced within a database transaction to prevent negative stock.
- **Batch-wise Inventory**: Medicines are tracked by batch, expiry, and MRP.
- **Credit (Udhaari) Tracking**: Customers can have outstanding balances tracked and paid off.
