# Project Budget Structure: AthassMediSync Management System

This document outlines the technical investment required for the implementation and maintenance of the AthassMediSync Management System. The following costs are exclusively for technical services and infrastructure required to make the project operational and premium for the client.

| Technical Component | Description | Amount (INR) |
| :--- | :--- | :--- |
| **Code Signing Certificate (Windows)** | Essential security credential to eliminate "Unknown Publisher" warnings and ensure Windows Defender trust for the .exe installer. | ₹3,200.00 |
| **Enterprise Database Encryption** | Security layer implementation to encrypt the local SQLite database, ensuring patient and financial data is protected even if the PC is accessed. | ₹1,450.00 |
| **Intelligent Expiry-Loss Prevention Shield** | A specialized protection layer that proactively flags nearing-expiry medicine and generates "Vendor Return" lists, saving the store thousands in potential losses from expired stock. | ₹1,200.00 |
| **Local Search Engine Optimization** | High-performance indexing and caching configuration specifically tuned for millisecond-speed "Fuzzy Search" on local hardware. | ₹989.00 |
| **WhatsApp-to-Local Bridge Setup** | Technical configuration required to bridge the offline database with the WhatsApp Web protocol for seamless, one-click PDF sharing. | ₹1,000.00 |
| **TOTAL TECHNICAL INVESTMENT** | | **₹7,839.00** |

## Technical Inclusions Summary

- **Zero-Latency Architecture**: Optimized for .exe execution, ensuring the system operates at maximum speed without any dependency on internet connectivity.
- **Secure Local-First Database**: Relational schema built on better-sqlite3 with custom-tuned indexing for batch-wise inventory tracking.
- **Installer Security Hardening**: The .exe is hardened against tampering and optimized for Windows 10/11 environments.
- **Local PDF Engine**: Integrated jsPDF high-fidelity rendering for offline invoice generation.

> [!NOTE]
> This budget focuses on technical architecture and required recurring/one-time platform costs. It does not include hardware (printers, PCs) or development labor.

---
**Prepared For:** AthassMediSync
**Project Status:** Production Ready
