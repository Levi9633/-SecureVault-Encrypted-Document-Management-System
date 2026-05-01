# Testing
Date: 2026-04-30

## Overview
Currently, there is no formal automated test suite implemented for this application. Verification relies heavily on manual end-to-end testing of the critical pathways: Signup → Login → Upload → List → Download.

## Environments
All testing takes place exclusively on the `localhost:5173` frontend communicating with `localhost:8000` backend.
A specific networking environment is required: due to `WinError 10060`, Supabase connections are verified functional only on a hotspot/IPv4-forced stack, as certain local WiFi configs blocked port 443 connectivity to Supabase previously.
