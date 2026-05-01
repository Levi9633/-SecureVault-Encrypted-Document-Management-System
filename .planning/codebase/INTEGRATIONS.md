# External Integrations
Date: 2026-04-30

## Database & Storage: Supabase
- **URL:** `https://vztqywaounouhaxnpmzg.supabase.co`
- **Authentication (Client-Side):** `supabase-js` is used purely by React to manage secure login/signup flows and issue JWTs.
- **Authentication (Server-Side):** FastAPI verifies the Supabase JWT using the `/auth/v1/user` REST endpoint to securely resolve identities.
- **Admin Management:** Uses the Supabase Auth Admin API (`/auth/v1/admin/users`) with the `service_role` key to manage user status (Blocking/Unblocking/Deletion).
- **REST API Integration:**
  - Connects to `/rest/v1/users` and `/rest/v1/audit_logs` via standard HTTP requests instead of the official `supabase-py` SDK due to network issues (IPv6 `WinError 10060`).
- **Storage Integration:**
  - Creates dynamic, isolated user buckets via `/storage/v1/bucket`.
  - Pushes files using `application/octet-stream` to `bucket/main/`.
  - **Dynamic Size Calculation:** Uses `/storage/v1/object/list/{bucket}` with a recursive search through the `main/` prefix to calculate real-time user storage quotas.

## No Third-Party Analytics / Webhooks
Currently, there are no third-party email services or external webhooks. Email confirmations in Supabase Auth are DISABLED for development. All metrics and auditing are handled 100% in-house via the custom API Middleware and React Recharts Dashboard.
