# 🛡️ AthassMediSync — Cloud License Manager (Render Free Tier)

A modern, cloud-hosted remote license manager and client access control panel for **AthassMediSync Pharmacy Management System**.

---

## 🌟 Features
- **Host Free on Render**: 100% free tier web service, accessible from anywhere worldwide.
- **Admin Control Panel**: Works on smartphones, tablets, and desktop computers.
- **1-Click WhatsApp Share**: Send license activation details directly to client medical store owners via WhatsApp.
- **Instant Remote Revocation & Extension**:
  - Extend client subscriptions in 1 click (+7d, +30d, +90d, +1yr, Lifetime).
  - Remotely block or suspend unpaid clients instantly.
  - Reset Hardware ID binding if client bought a new PC or reinstalled Windows.
- **Dual Activation & Dual Verification**:
  - **Online 1-Click Activation**: Client inputs a short key (e.g. `AMS-PRO-XXXX-XXXX`) in the desktop app.
  - **Offline Cryptographic Fallback**: Issues genuine RSA-2048 SHA-256 signed `AMS-LIC-...` offline keys for PCs without internet.
- **Persistent Database**:
  - Zero-setup local SQLite.
  - Or connect a **100% Free PostgreSQL** database from [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com).
  - Built-in **1-Click JSON Backup & Restore**.

---

## 🚀 Quick 3-Minute Deployment to Render (Free)

### Step 1: Push to GitHub
1. Commit and push this repository to your GitHub account:
   ```bash
   git add .
   git commit -m "Add AthassMediSync cloud license manager"
   git push origin main
   ```

### Step 2: Create Web Service on Render
1. Go to [https://render.com](https://render.com) and log in (or sign up for free).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Fill in the settings:
   - **Name**: `athass-license-manager` (or your preferred name)
   - **Region**: Any (e.g. Singapore, Oregon, Frankfurt)
   - **Root Directory**: `license-manager`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

### Step 3: Add Environment Variables
Scroll down to **Environment Variables** and add:
| Key | Value | Description |
| :--- | :--- | :--- |
| `ADMIN_USER` | `admin` | Your admin login username |
| `ADMIN_PASSWORD` | `your_secure_password` | Your admin login password |
| `JWT_SECRET` | `any_long_random_string` | Secret key for login tokens |
| `DATABASE_URL` *(Optional)* | `postgresql://...` | Free cloud PostgreSQL from [Neon.tech](https://neon.tech) or Supabase (Recommended so client data is saved forever!) |

5. Click **Create Web Service**!
Render will deploy the service and provide you with a free HTTPS URL:
`https://athass-license-manager.onrender.com`

---

## 💡 How to Get Permanent Free PostgreSQL (Neon.tech - 30 Seconds)
Render's free web service has an ephemeral disk (resets on fresh code deploys). To ensure your client licenses are **never lost**, use Neon's free serverless Postgres:
1. Go to [https://neon.tech](https://neon.tech) and sign up with GitHub/Google (100% Free).
2. Click **Create Project** (takes 5 seconds).
3. Copy the **Connection String** (e.g. `postgresql://alex:password@ep-cool-frog.us-east-2.aws.neon.tech/neondb?sslmode=require`).
4. In Render dashboard → Environment Variables → Add `DATABASE_URL` and paste that connection string.
Done! All your client licenses are permanently saved in the cloud.

---

## 📱 How to Use from Your Phone or Laptop
1. Open `https://athass-license-manager.onrender.com` in your browser.
2. Sign in with your `ADMIN_USER` and `ADMIN_PASSWORD`.
3. Click **"+ Issue New License"**:
   - Enter Doctor / Chemist Name (e.g. `Dr. Suresh Patil`).
   - Enter Pharmacy Name (e.g. `Patil Medico`).
   - Enter WhatsApp number.
   - Choose Plan: 7-Day Trial, 1 Month, 1 Year, Lifetime, etc.
4. Click **Generate**.
5. Click the **📱 WhatsApp** button: it opens WhatsApp with a pre-filled message containing the license code and activation instructions!
6. The client opens AthassMediSync on their PC, enters the key, and clicks **"Activate Online"**.

---

## 🔌 API Reference for Desktop App Integration
- `POST /api/v1/client/activate`:
  - Body: `{ "licenseKey": "AMS-PRO-XXXX-XXXX", "hwid": "AMS-1A2B-3C4D-5E6F", "storeName": "Store", "appVersion": "1.2.0" }`
  - Returns: `{ "success": true, "status": "active", "expiresAt": "2027-12-31", "offlineLicenseKey": "AMS-LIC-..." }`
- `POST /api/v1/client/verify`:
  - Body: `{ "licenseKey": "AMS-PRO-XXXX-XXXX", "hwid": "AMS-1A2B-3C4D-5E6F", "appVersion": "1.2.0" }`
  - Returns: `{ "valid": true, "status": "active", "expiresAt": "2027-12-31" }`
