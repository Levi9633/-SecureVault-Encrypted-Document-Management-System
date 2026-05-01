# Architecture
Date: 2026-04-30

## System Design
The application operates on a 3-tier architecture:
1. **Client (React):** Handles UI, Supabase Auth via `supabase-js`, and rendering Data-Science charts via `recharts`. Never talks to the database directly, EXCEPT for native Supabase Auth flow.
2. **Middleware/Server (FastAPI):** Central orchestrator. Validates auth tokens, encrypts/decrypts file bytes in memory (Zero-Knowledge), intercepts metrics using a Stopwatch Middleware, and acts as a proxy for the database and storage.
3. **Storage (Supabase):** The source of truth for user identities, enterprise JSON audit logs, and encrypted file blobs.

## Data Flow (File Upload & Encryption)
- **Client:** Reads file from OS, prompts user for a `file_password`, sends multipart `FormData` via HTTP POST.
- **FastAPI (`/files/upload`):** Reads bytes and password. Passes to `encryption.py`.
- **Encryption Service (Zero-Knowledge):** Derives a 32-byte AES key using `PBKDF2HMAC(password, random_salt)`. Encrypts the data using AES-256-GCM. Bundles Salt + IV + Tag + Ciphertext into a single `.enc` payload.
- **Supabase Service:** Uploads the single `.enc` ciphertext to `bucket/main/file.enc`. The cryptographic key is immediately destroyed from memory.

## Data Flow (Enterprise Auditing & Middleware)
- **FastAPI Middleware:** Intercepts every single HTTP request. Starts a stopwatch.
- **Logging:** After the request finishes, it captures the response time (ms), HTTP status, IP Address, and Device User-Agent.
- **Supabase Logs:** Pushes a structured JSON payload to the `audit_logs` table.
- **Admin Dashboard Logic:** 
  - **User Master List:** Fetches directly from Supabase Auth Admin API (`/auth/v1/admin/users`) to ensure 100% visibility of all registered accounts.
  - **Activity Merging:** Merges the last 3,000 audit logs with the Auth list by matching usernames and email prefixes.
  - **Dynamic Storage:** Calculates real-time usage by scanning each user's personal bucket (`bucket/main/`) and summing object sizes.
  - **Audit Trail:** Renders a high-fidelity log explorer with intelligent method inference (GET/POST) and error status color-coding.

## Abstractions
- **`supabase_service.py`**: Isolates all REST/Network calls to Supabase Storage and Database.
- **`encryption.py`**: A pure cryptographic service completely isolated from networking.
