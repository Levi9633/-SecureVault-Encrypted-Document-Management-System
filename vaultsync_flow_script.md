# VaultSync 2.0 — Complete Technical Flow Script

## The Full Story: From Browser to Encrypted Cloud and Back

---

# 🧱 THE ARCHITECTURE (Current State)

```
YOU (Browser at localhost:5173)
        ↓  Native Auth (Supabase JS) + HTTP Request (Axios)
FASTAPI BACKEND (localhost:8000)  ← Python server + Stopwatch Middleware
        ↓  HTTP Request (REST API)
SUPABASE CLOUD (https://vztqywaounouhaxnpmzg.supabase.co)
        ├── Auth (auth.users)    → Secure JWT Provider
        ├── Database (public)    → users (metadata/quotas) + audit_logs (Enterprise JSON)
        └── Storage Buckets      → Encrypted files (.enc)
```

**Key rule:** Your browser talks to Supabase Auth for security, but EVERYTHING else (Upload, Download, Auditing) goes through the FastAPI backend.

---

# 🚀 "GET SHIT DONE" TRACKER (Recently Completed)

Here is everything we successfully built and implemented in the recent sprints to professionalize VaultSync:

1. **Supabase Auth Migration**
   - Ripped out custom JWT logic; integrated `supabase-js` native auth.
   - Built `/auth/sync-user` to bridge `auth.users` with `public.users`.
   - Built Global `IdleTimer` in React (auto-logout after 12 mins).

2. **Zero-Knowledge Encryption**
   - Uploads now require a user-provided encryption password.
   - Files are encrypted using AES-256-GCM (via PBKDF2 derived keys) on the backend.
   - Neither the Admin nor Supabase can read the files without the user's password.

3. **Data-Science Admin Dashboard**
   - High-fidelity Dark Mode / Neon Green styling.
   - **Global Analytics**: Recharts integrated for System Activity (Last 14 days), Top Users, and Event Composition.
   - Polling engine implemented (refreshes data every 3 seconds).

4. **API Gateway & Stopwatch Middleware**
   - Injected `@app.middleware("http")` into FastAPI to measure exact execution time (ms) and capture HTTP Status Codes for every request.
   - Built the **Endpoints List** mimicking the custom Supabase UI (Green=2xx, Yellow=3xx, Blue=4xx, Red=5xx).
   - Built Success Rate and latency (LQ, Median, UQ) visualizers.

5. **Enterprise Audit Logging**
   - Overhauled `audit_logs` to capture a rich JSON schema natively.
   - Automatically tracks **IP Address**, **Device/Browser** (User-Agent), **File Meta** (Size/Cipher), and **Status** (SUCCESS/FAILURE).
   - Built the **Supabase-style Log Explorer** at the bottom of the API tab (Stacked Frequency Chart + Monospaced Log Table).

---

# 📖 CHAPTER 1: SIGNUP & LOGIN (Supabase Auth)

## Step 1.1 — You Fill the Form (Browser)

React calls the Supabase JS client directly:
```js
const { data, error } = await supabase.auth.signUp({ email, password })
```
Supabase securely creates the user in `auth.users` and returns a JWT session.

## Step 1.2 — Syncing to Public Users

Immediately after signup, React sends the credentials to FastAPI:
```http
POST http://localhost:8000/auth/sync-user
```
FastAPI creates a mirrored record in `public.users` (to track quotas/roles) and logs the `signup` event into the Enterprise Audit Log (recording IP and Device).

---

# 📖 CHAPTER 2: FILE UPLOAD + ZERO-KNOWLEDGE ENCRYPTION

## Step 2.1 — You Click "Encrypt & Upload"

React sends a `multipart/form-data` request with the file and the custom encryption password:
```http
POST http://localhost:8000/files/upload
Authorization: Bearer <supabase_jwt>
file_password: "MySecretPassword123"
```

## Step 2.2 — AES-256-GCM ENCRYPTION

FastAPI processes the encryption:
1. **Derive Key**: PBKDF2HMAC derives a strong 32-byte AES key from your `file_password` and a random salt.
2. **Encrypt**: AES-GCM encrypts the file bytes, producing the ciphertext and an authentication tag.
3. **Package**: The Salt + IV + Tag + Ciphertext are bundled into a single binary payload.

## Step 2.3 — Upload to Supabase

FastAPI uploads the bundled `.enc` file to Supabase Storage:
```http
POST https://vztqywaounouhaxnpmzg.supabase.co/storage/v1/object/abcd/main/Resume.pdf.enc
```
FastAPI logs `FILE_ENCRYPT_UPLOAD` to the audit log, capturing the file size and encryption cipher.

---

# 📖 CHAPTER 3: FILE DOWNLOAD + DECRYPTION

## Step 3.1 — You Click Download

React sends the required custom password in the headers:
```http
POST http://localhost:8000/files/download/Resume.pdf.enc
x-file-password: "MySecretPassword123"
```

## Step 3.2 — Decryption & Verification

FastAPI downloads the `.enc` file from Supabase Storage.
1. It extracts the Salt, IV, and Tag.
2. It attempts to derive the key using your provided `x-file-password`.
3. It runs AES-GCM decryption.

If the password is wrong, the Tag validation fails. FastAPI throws an HTTP 401 error and logs `FILE_DECRYPT_FAILED` (Status: FAILURE) to the audit log.

If successful, it returns the raw bytes and logs `FILE_DECRYPT_SUCCESS`.

---

# 📖 CHAPTER 4: ENTERPRISE AUDIT LOGGING

## Step 4.1 — The Stopwatch Middleware

Every single request hitting FastAPI triggers the `api_monitoring_middleware`.
1. It starts a timer (`time.time()`).
2. The endpoint executes.
3. It stops the timer and calculates `process_time_ms`.
4. It asynchronously logs the `API_REQUEST` with the exact endpoint and HTTP Status to the `audit_logs` table using the new JSON schema.

## Step 4.2 — The JSON Log Schema

FastAPI pushes this rich JSON object into Supabase:
```json
{
  "event_id": "8b5a...-...",
  "status": "SUCCESS",
  "ip_address": "127.0.0.1",
  "device": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
  "file_info": {
    "file_name": "Resume.pdf",
    "file_size_bytes": 512000,
    "encryption": "AES-256-GCM"
  }
}
```

## Step 4.3 — Admin Dashboard Rendering

The React Admin Panel (`AdminDashboard.jsx`) fetches this JSON and renders it natively:
- **API Gateway**: Renders Endpoints, Success Rates, and the Supabase-style Log Explorer.
- **Enterprise Audits**: Parses the JSON to display badges, IP addresses, and Context files.
