# Coding Conventions
Date: 2026-04-30

## Python (FastAPI)
- **Error Handling:** Usage of `fastapi.HTTPException` mapped back to HTTP status codes (`401`, `404`, `409`, `503`) within routing layers.
- **Dependency Injection:** Headers and Query variables extracted primarily via FastAPI's `Header()` injections (e.g. `authorization: str = Header(default="")`).
- **Data Schemas:** Standard Pydantic `BaseModel` for parsing incoming JSON inputs.

## JavaScript (React)
- **Functional Components:** Exclusive use of React functional components with Hooks (`useState`, `useEffect`, `useRef`).
- **Styles:** Custom CSS classes instead of Tailwind. Global utility classes mapped to `.btn`, `.btn-primary`, `.card`, `.page`, `.header`.
- **API Calls:** Axios is abstracted inside `src/services/api.js`. No inline fetch requests within React components.

## Security Conventions
- **Passwords:** Must be >= 8 characters for account creation. File encryption passwords must be >= 6 chars, with at least one letter, one number, and one special character.
- **Encryption Format:** Zero-Knowledge PBKDF2. Encrypted files always contain the `salt` (16 bytes) and `iv` (16 bytes) prepended to the ciphertext.
- **Role-Based Access Control (RBAC):** There are two roles: `user` and `admin`.
- **Hardcoded Admin:** The `Admin` account is hardcoded directly in `auth.py` and bypasses the database completely. Registration of the username "Admin" or "admin" is strictly blocked in the `/signup` route.

## Dashboard & Monitoring
- **Polling Interval:** The Admin Dashboard refreshes its global state every **60 seconds** to balance real-time awareness with server performance.
- **Audit Consistency:** All audit events MUST include a structured JSON `details` field containing `endpoint`, `ip`, `status`, and `file_info` when applicable to support high-fidelity visualization.
