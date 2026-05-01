# Concerns & Tech Debt
Date: 2026-04-30

## 1. Authentication & Security
- The backend relies on Supabase Auth for minting JWTs, but the `supabase_service.py` still operates via the `Service Role` API Key, bypassing Supabase Row Level Security (RLS) policies completely.
- Admin authentication is hardcoded into `auth.py` via a bypass token rather than utilizing a secure database `role` column or Supabase custom claims.

## 2. Infrastructure & Performance
- The `socket.getaddrinfo` override in the backend to force IPv4 globally works as a hotfix for `WinError 10060`, but it is fragile and could cause unexpected latency with services that require IPv6.
- The Admin Dashboard polling interval has been increased to **60 seconds**, which mitigates some database overhead. However, Supabase Realtime remains the ideal long-term target.
- **Scalability Concern:** The `get_users` endpoint now performs a live bucket scan and audit log aggregation for every user on every refresh. For thousands of users, this will become a major bottleneck and will require a caching layer or a "Total Storage" column in the `users` table.

## 3. Storage & Analytics State
- The Audit Trail now includes detailed `API_REQUEST` methods (GET/POST) and error statuses. However, inserting an `audit_logs` row on *every single* API request will eventually balloon the database size. We may need to implement a log rotation or batch-insert strategy.
- Total storage analytics on the Admin Dashboard are computed securely, but the UI is heavily coupled to the backend data structures.

## 4. Error Handling
- There are limited retries configured on the HTTP requests out to the Supabase REST and Storage APIs. A brief drop in connectivity during the large binary blob upload of encrypted files will crash the request.
