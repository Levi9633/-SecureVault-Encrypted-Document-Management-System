# VaultSync — Comprehensive Debugging & Lessons Log
History: 2026-04-27 to 2026-05-01

This log captures the evolution of VaultSync, the mistakes made during development, and the precise solutions implemented to ensure a stable, production-grade system.

---

## 🛠️ Phase 1: The "Desktop App" Era (Python/CustomTkinter)

### 1. Database Schema Mismatches
- **Mistake:** `user_id` was initially set as `int8` (bigint) in Supabase.
- **Error:** `invalid input syntax for type bigint: "admin"`.
- **Solution:** Altered the column type from `int8` to `text` in the Supabase Table Editor.
- **Lesson:** Always use `text` or `uuid` for usernames/IDs unless you are strictly using auto-incrementing integers.

### 2. UI Freezing (Blocking Main Thread)
- **Mistake:** Running Supabase network calls directly inside button click handlers.
- **Result:** Window title changed to "(Not Responding)" while waiting for the internet.
- **Solution:** Wrapped all network calls in `threading.Thread(daemon=True)` and used `self.after(0, callback)` to update the UI safely.

### 3. The Great IPv6 Timeout (WinError 10060)
- **Error:** `[WinError 10060] A connection attempt failed because the connected party did not properly respond`.
- **Discovery:** Some ISPs/WiFi networks fail to route IPv6 traffic to Supabase correctly.
- **Solution (The Socket Patch):**
  ```python
  import socket
  _orig = socket.getaddrinfo
  def _ipv4(h, p, family=0, type=0, proto=0, flags=0):
      return _orig(h, p, socket.AF_INET, type, proto, flags)
  socket.getaddrinfo = _ipv4
  ```
- **Further Solution:** Switched from `supabase-py` (which uses `httpx`) to direct `requests` because `httpx` sometimes ignores the global socket patch.

---

## 🌐 Phase 2: The "Modern Web" Era (React + FastAPI)

### 4. Encryption Alignment
- **Problem:** Files encrypted in the old Python app needed to be decrypted by the new FastAPI backend.
- **Resolution:** Re-implemented the exact AES-256-CBC padding and salt/iv prepending logic in the `encryption.py` service to maintain "Legacy Compatibility".

### 5. CORS Blocking
- **Error:** Frontend could not talk to backend (`Access-Control-Allow-Origin` missing).
- **Solution:** Configured `CORSMiddleware` in `main.py` to allow `http://localhost:5173`.

---

## 📊 Phase 3: Admin Dashboard & Observability

### 6. Missing Analytics Columns
- **Mistake:** Attempting to fetch `storage_used` from the `users` table.
- **Problem:** The table didn't have that column; storage was only in the Bucket.
- **Solution:** Implemented **Dynamic Storage Scanning**. The backend now recursively lists files in `bucket/main/` and sums their sizes in real-time.

### 7. Identity Fragmentation (The "Zero Stats" Bug)
- **Symptom:** Audit logs showed activity, but the User Table showed 0 requests.
- **Cause:** Audit logs used the username metadata (e.g., `Levi2`), but the system was searching by email prefix (e.g., `levi191229`).
- **Solution:** 
  1. Fetched master list from Supabase Auth Admin.
  2. Created a mapping function that normalizes identities.
  3. Matched audit logs against BOTH the metadata username and the email.

### 8. Audit Log Context Loss
- **Symptom:** Logs just said `API_REQUEST` without showing what file or action happened.
- **Solution:** 
  - Updated the Audit Trail to parse the `details` JSON field.
  - Added "Intelligent Method Inference" to detect `GET` vs `POST` vs `DELETE` based on the endpoint path.

### 9. Polling Load / Terminal Spam
- **Mistake:** Dashboard refreshing every 3 seconds.
- **Problem:** Backend terminal became unreadable; Supabase API was hit 20+ times per minute.
- **Solution:** Relaxed polling to **60 seconds**. This maintains awareness while keeping the system quiet and performant.

---

## 🛡️ Best Practices for Future Debugging
1. **Force IPv4 First:** If you see a timeout, apply the `socket.getaddrinfo` patch immediately.
2. **Check Auth Metadata:** When mapping logs to users, always check `user_metadata` in Supabase Auth before falling back to email.
3. **Scan, Don't Trust:** For storage, don't trust a database column. Always scan the bucket for the ground truth of file sizes.
4. **Inspect JSON Details:** If a log looks empty, check the `audit_logs.details` column in Supabase—the data is usually hidden there.
