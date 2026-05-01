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

# We now only use a unified users table and an audit_logs table
USERS_TABLE = "users"
AUDIT_TABLE = "audit_logs"

def db_select(table: str, field: str, value: str):
    r = requests.get(f"{BASE}/{table}?{field}=eq.{value}", headers=HEADS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def db_get_all(table: str, order: str = None, limit: int = 500, filters: str = None):
    params = f"?limit={limit}"
    if order:
        params += f"&order={order}"
    if filters:
        params += f"&{filters}"
    r = requests.get(f"{BASE}/{table}{params}", headers=HEADS, timeout=TIMEOUT)
    if r.status_code == 404 or r.status_code == 400:
        return []
    r.raise_for_status()
    return r.json()

def db_insert(table: str, data: dict):
    r = requests.post(f"{BASE}/{table}", headers=HEADS, json=data, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def db_update(table: str, field: str, value: str, data: dict):
    r = requests.patch(f"{BASE}/{table}?{field}=eq.{value}", headers=HEADS, json=data, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

import uuid
import json

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
        db_insert(AUDIT_TABLE, data)
    except Exception as e:
        print(f"[AUDIT LOG FAILED] {e}")

def storage_upload(bucket: str, path: str, data: bytes, content_type: str = "application/octet-stream"):
    url = f"{STORE}/object/{bucket}/{path}"
    h = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  content_type,
    }
    r = requests.post(url, headers=h, data=data, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def storage_list(bucket: str, folder: str = ""):
    url = f"{STORE}/object/list/{bucket}"
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
         "Content-Type": "application/json"}
    
    prefix = folder + "/" if folder else ""
    r = requests.post(url, headers=h, json={"prefix": prefix, "limit": 500}, timeout=TIMEOUT)
    if r.status_code == 404 or r.status_code == 400:
        return []
    r.raise_for_status()
    return r.json()

def storage_download(bucket: str, path: str) -> bytes:
    url = f"{STORE}/object/{bucket}/{path}"
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    r = requests.get(url, headers=h, timeout=TIMEOUT)
    r.raise_for_status()
    return r.content

def create_bucket_if_needed(bucket: str):
    """Create bucket if it doesn't exist yet."""
    url = f"{STORE}/bucket"
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
         "Content-Type": "application/json"}
    info = requests.get(f"{url}/{bucket}", headers=h, timeout=TIMEOUT)
    if info.status_code == 400 or info.status_code == 404:
        requests.post(url, headers=h, json={"id": bucket, "name": bucket, "public": False}, timeout=TIMEOUT)
