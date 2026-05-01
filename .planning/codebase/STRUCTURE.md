# Directory Structure
Date: 2026-04-30

## Layout
The project is strictly split into backend and frontend. The legacy `files/` directory was deleted.

```
supabase-banglore/
├── backend/
│   ├── main.py                     # Entry point for FastAPI / Uvicorn
│   ├── requirements.txt            # Python dependencies
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth.py                 # Endpoint: /auth/login, /auth/signup
│   │   ├── files.py                # Endpoint: /files/upload, /files/list, /files/download
│   │   └── admin.py                # NEW: Endpoint: /admin/users, /admin/analytics, /admin/audits
│   └── services/
│       ├── __init__.py
│       ├── encryption.py           # AES-256-CBC implementation
│       └── supabase_service.py     # Network layer for Supabase
│
└── frontend/
    └── src/
        ├── App.jsx                 # Routing logic
        ├── index.css               # Global theme and styles
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Files.jsx
        │   ├── Login.jsx
        │   ├── Signup.jsx
        │   ├── Upload.jsx
        │   └── AdminDashboard.jsx  # NEW: Consolidated Admin observability & management
        └── services/
            └── api.js              # Axios hooks
```
