# Codebase Tech Stack
Date: 2026-04-30

## Overview
VaultSync 2.0 is an enterprise-grade healthcare file management system utilizing a React frontend, FastAPI Python backend, and Zero-Knowledge encryption.

## Frontend Stack
- **Framework:** React (via Vite)
- **Routing:** React Router v6
- **Styling:** Vanilla CSS (`index.css` with dark mode, glassmorphism, and neon dashboard theme)
- **Auth SDK:** `supabase-js` (Native authentication, JWT persistence)
- **Data Visualization:** `recharts` (BarChart, PieChart, Stacked Bar Charts, LineCharts)
- **HTTP Client:** Axios (configured with intercepts/bearer tokens)
- **State/Time:** `react-idle-timer` (12-minute auto-logout)

## Backend Stack
- **Framework:** FastAPI (Python 3.12+)
- **Server:** Uvicorn
- **Cryptography:** `cryptography` library (AES-256-GCM with PBKDF2HMAC key derivation)
- **Requests:** `requests` for REST calls
- **Concurrency:** `asyncio` for non-blocking Audit Log database insertions

## Development & Runtime Environment
- **Node.js:** v18+ (for Vite/React)
- **Python:** 3.12+ 
- **OS Compatibility:** Windows (with a forced socket IPv4 fix due to WinError 10060)
