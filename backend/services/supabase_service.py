import socket
import datetime

# ── Force IPv4 (fix WinError 10060 on some networks) ─────────────────────────
_orig = socket.getaddrinfo
def _ipv4(host, port, family=0, type=0, proto=0, flags=0):
    return _orig(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _ipv4

import requests
import os
from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

BASE  = f"{SUPABASE_URL}/rest/v1"
STORE = f"{SUPABASE_URL}/storage/v1"

HEADS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}
TIMEOUT = 20

session = requests.Session()
session.headers.update(HEADS)

# We now only use a unified users table and an audit_logs table
USERS_TABLE = "users"
AUDIT_TABLE = "audit_logs"

def db_select(table: str, field: str, value: str):
    r = session.get(f"{BASE}/{table}?{field}=eq.{value}", timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def db_get_all(table: str, order: str = None, limit: int = 500, filters: str = None):
    params = f"?limit={limit}"
    if order:
        params += f"&order={order}"
    if filters:
        params += f"&{filters}"
    r = session.get(f"{BASE}/{table}{params}", timeout=TIMEOUT)
    if r.status_code == 404 or r.status_code == 400:
        return []
    r.raise_for_status()
    return r.json()

def db_get_all_paginated(table: str, order: str = "timestamp.desc", filters: str = None, page_size: int = 1000, max_records: int = 10000):
    """Fetch all rows using Supabase Range-based pagination to bypass the 1000-row server cap."""
    all_rows = []
    start = 0
    while len(all_rows) < max_records:
        end = start + page_size - 1
        params = f"?order={order}"
        if filters:
            params += f"&{filters}"
        headers = {
            **{k: v for k, v in session.headers.items()},
            "Range-Unit": "items",
            "Range": f"{start}-{end}",
            "Prefer": "count=exact"
        }
        r = session.get(f"{BASE}/{table}{params}", headers=headers, timeout=TIMEOUT)
        if r.status_code in (404, 400, 416):  # 416 = Range Not Satisfiable (past end)
            break
        if not r.ok:
            break
        batch = r.json()
        if not batch:
            break
        all_rows.extend(batch)
        if len(batch) < page_size:
            break  # Last page reached
        start += page_size
    return all_rows

def db_insert(table: str, data: dict):
    r = session.post(f"{BASE}/{table}", json=data, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def db_update(table: str, field: str, value: str, data: dict):
    r = session.patch(f"{BASE}/{table}?{field}=eq.{value}", json=data, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

import uuid
import json
import threading

def _insert_audit_log_async(data: dict):
    try:
        db_insert(AUDIT_TABLE, data)
    except Exception as e:
        print(f"[AUDIT LOG FAILED] {e}")

def log_audit_event(username: str, action: str, request=None, status: str = "SUCCESS", file_info: dict = None, extra: dict = None):
    try:
        details_dict = {
            "event_id": str(uuid.uuid4()),
            "status": status,
        }
        # Extract IP + device either from live Request object OR from pre-captured extra dict
        if request:
            details_dict["ip_address"] = request.client.host if request.client else "Unknown"
            details_dict["device"] = request.headers.get("user-agent", "Unknown")
        elif extra and "ip_address" in extra:
            details_dict["ip_address"] = extra.pop("ip_address")
            details_dict["device"] = extra.pop("device", "Unknown")

        if file_info:
            details_dict["file_info"] = file_info
        if extra:
            details_dict.update(extra)

        data = {
            "username": username,
            "action": action,
            "details": json.dumps(details_dict),
            "timestamp": datetime.datetime.utcnow().isoformat()
        }
        threading.Thread(target=_insert_audit_log_async, args=(data,), daemon=True).start()
    except Exception as e:
        print(f"[AUDIT LOG PREP FAILED] {e}")

def storage_upload(bucket: str, path: str, data: bytes, content_type: str = "application/octet-stream"):
    import urllib.parse
    # URL encode the path to handle spaces and special characters safely
    encoded_path = urllib.parse.quote(path)
    url = f"{STORE}/object/{bucket}/{encoded_path}"
    h = {
        "Content-Type":  content_type,
        "x-upsert":      "true",
    }
    r = session.post(url, headers=h, data=data, timeout=TIMEOUT)
    if r.status_code >= 400:
        print(f"[STORAGE UPLOAD ERROR] {r.status_code} {r.text}")
    r.raise_for_status()
    return r.json()

def storage_list(bucket: str, folder: str = ""):
    url = f"{STORE}/object/list/{bucket}"
    prefix = folder + "/" if folder else ""
    r = session.post(url, json={"prefix": prefix, "limit": 500}, timeout=TIMEOUT)
    if r.status_code == 404 or r.status_code == 400:
        return []
    r.raise_for_status()
    return r.json()

def storage_download(bucket: str, path: str) -> bytes:
    url = f"{STORE}/object/{bucket}/{path}"
    r = session.get(url, timeout=TIMEOUT)
    r.raise_for_status()
    return r.content

def create_bucket_if_needed(bucket: str):
    """Create bucket if it doesn't exist yet."""
    url = f"{STORE}/bucket"
    info = session.get(f"{url}/{bucket}", timeout=TIMEOUT)
    if info.status_code == 400 or info.status_code == 404:
        session.post(url, json={"id": bucket, "name": bucket, "public": False}, timeout=TIMEOUT)
