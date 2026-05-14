from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
import requests
from services.supabase_service import db_get_all, db_get_all_paginated, USERS_TABLE, AUDIT_TABLE, SUPABASE_URL, HEADS, TIMEOUT

router = APIRouter(prefix="/admin", tags=["admin"])

from routes.auth import verify_supabase_token

def check_admin(authorization: str = "") -> str:
    if not authorization:
        raise HTTPException(401, "Not authenticated")
    token = authorization.replace("Bearer ", "")
    
    payload = verify_supabase_token(token)
    if payload.get("role") != "admin":
        raise HTTPException(403, "Access denied. Admins only.")
    return payload.get("username")

@router.get("/analytics")
def get_analytics(authorization: str = Header(default="")):
    check_admin(authorization)
    try:
        users = db_get_all(USERS_TABLE)
        total_storage = sum([u.get("storage_used", 0) or 0 for u in users])

        # Separate clean headers for count=exact (avoids conflict with return=representation)
        count_headers = {
            "apikey": HEADS["apikey"],
            "Authorization": HEADS["Authorization"],
            "Prefer": "count=exact",
            "Range-Unit": "items",
            "Range": "0-0"
        }
        total_audit = 0
        try:
            count_r = requests.get(
                f"{SUPABASE_URL}/rest/v1/audit_logs",
                headers=count_headers,
                timeout=TIMEOUT
            )
            if count_r.ok:
                content_range = count_r.headers.get("Content-Range", "")
                if "/" in content_range:
                    total_audit = int(content_range.split("/")[-1])
        except Exception:
            pass  # Non-critical: just return 0 if count fails

        # Also get auth user count (more accurate than local users table)
        total_auth_users = len(users)
        try:
            auth_r = requests.get(f"{SUPABASE_URL}/auth/v1/admin/users", headers=HEADS, timeout=TIMEOUT)
            if auth_r.status_code == 200:
                total_auth_users = len(auth_r.json().get("users", []))
        except Exception:
            pass

        return {
            "total_users": total_auth_users,
            "total_storage_bytes": total_storage,
            "total_audit_events": total_audit
        }
    except Exception as e:
        raise HTTPException(500, f"Error fetching analytics: {e}")

@router.get("/users")
def get_users(authorization: str = Header(default="")):
    check_admin(authorization)
    try:
        # 1. Fetch Supabase Auth data (This is our master list)
        auth_users = []
        try:
            r = requests.get(f"{SUPABASE_URL}/auth/v1/admin/users", headers=HEADS, timeout=TIMEOUT)
            if r.status_code == 200:
                auth_users = r.json().get("users", [])
            else:
                print(f"Auth fetch failed: {r.status_code} {r.text}")
        except Exception as e: 
            print(f"Auth exception: {e}")

        # 2. Fetch local profiles (for storage info)
        db_users = db_get_all(USERS_TABLE) or []
        db_map = { u.get("gmail") or u.get("email"): u for u in db_users }

        # 3. Fetch activity counts — paginated, exclude API_REQUEST noise, newest first
        audits = db_get_all_paginated(AUDIT_TABLE, order="timestamp.desc", filters="action=neq.API_REQUEST") or []
        user_stats = {}
        for a in audits:
            raw = a.get("username")
            if not raw: continue
            u = raw.split('@')[0].lower() if '@' in raw else raw.lower()
            if u not in user_stats: 
                user_stats[u] = {"total": 0, "uploads": 0, "downloads": 0, "files": 0}
            
            user_stats[u]["total"] += 1
            action = (a.get("action") or "").upper()
            details = (a.get("details") or "").lower()
            
            if "UPLOAD" in action or "/upload" in details:
                user_stats[u]["uploads"] += 1
                user_stats[u]["files"] += 1
            elif "DECRYPT" in action or "DOWNLOAD" in action or "/download" in details:
                user_stats[u]["downloads"] += 1

        # 4. Merge data (Loop through Auth users)
        from services.supabase_service import storage_list
        results = []
        for au in auth_users:
            email = au.get("email")
            if not email: continue
            
            # Extract metadata
            meta = au.get("user_metadata", {})
            # The "official" username used in audit logs and as bucket name
            official_uname = meta.get("username") or email.split('@')[0]
            official_uname_low = official_uname.lower()
            
            # Calculate REAL storage by listing the bucket's 'main' folder
            real_storage = 0
            real_files_count = 0
            try:
                # Bucket name is ALWAYS lowercase (matches upload path in files.py: bucket = username.lower())
                files = storage_list(official_uname.lower(), folder="main")
                if isinstance(files, list):
                    for f in files:
                        # Skip folders if any
                        if f.get("id"): 
                            real_files_count += 1
                            real_storage += f.get("metadata", {}).get("size", 0) or f.get("size", 0) or 0
            except:
                pass 
            
            # Get activity stats (match against official username)
            stats = user_stats.get(official_uname_low, {"total": 0, "uploads": 0, "downloads": 0, "files": 0})
            
            results.append({
                "id": au.get("id"),
                "username": official_uname,
                "email": email,
                "storage_used": real_storage,
                "storage_limit": 52428800, # 50MB
                "last_sign_in": au.get("last_sign_in_at"),
                "is_blocked": au.get("banned_until") is not None,
                "total_requests": stats["total"],
                "uploads": stats["uploads"],
                "downloads": stats["downloads"],
                "files_count": real_files_count # Use real file count from storage
            })
            
        return results
    except Exception as e:
        print(f"CRITICAL ERROR in get_users: {e}")
        return []

@router.delete("/users/{user_id}")
def delete_user(user_id: str, authorization: str = Header(default="")):
    check_admin(authorization)
    errors = []

    # ── Step 1: Get user info BEFORE deleting (need email/username for DB + storage cleanup) ──
    user_email = None
    user_username = None
    try:
        r = requests.get(f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}", headers=HEADS, timeout=TIMEOUT)
        if r.status_code == 200:
            u = r.json()
            user_email = u.get("email")
            meta = u.get("user_metadata", {})
            user_username = meta.get("username") or (user_email.split("@")[0] if user_email else None)
    except Exception as e:
        errors.append(f"Info fetch failed: {e}")

    # ── Step 2: Delete from Supabase Auth (permanent — user cannot log in) ──
    try:
        r = requests.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers=HEADS, timeout=TIMEOUT
        )
        if not r.ok:
            errors.append(f"Auth delete failed: {r.status_code} {r.text}")
    except Exception as e:
        errors.append(f"Auth delete exception: {e}")

    # ── Step 3: Delete from local users table ──
    if user_email:
        try:
            # Try matching by email column (gmail or email field)
            r1 = requests.delete(
                f"{SUPABASE_URL}/rest/v1/users?gmail=eq.{user_email}",
                headers=HEADS, timeout=TIMEOUT
            )
            r2 = requests.delete(
                f"{SUPABASE_URL}/rest/v1/users?email=eq.{user_email}",
                headers=HEADS, timeout=TIMEOUT
            )
        except Exception as e:
            errors.append(f"DB delete exception: {e}")

    # ── Step 4: Purge all files from user's storage bucket ──
    if user_username:
        try:
            from services.supabase_service import storage_list, STORE, SUPABASE_KEY
            storage_heads = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json"
            }
            # List all files in their bucket/main folder
            files = storage_list(user_username, folder="main")
            if isinstance(files, list) and len(files) > 0:
                file_paths = [f"main/{f['name']}" for f in files if f.get("name")]
                if file_paths:
                    # Supabase Storage batch delete endpoint
                    del_r = requests.delete(
                        f"{STORE}/object/{user_username}",
                        headers=storage_heads,
                        json={"prefixes": file_paths},
                        timeout=TIMEOUT
                    )
                    if not del_r.ok:
                        errors.append(f"Storage delete failed: {del_r.status_code} {del_r.text}")
        except Exception as e:
            errors.append(f"Storage purge exception: {e}")

    # ── Step 5: Wipe audit_logs for this user ──
    if user_username:
        try:
            requests.delete(
                f"{SUPABASE_URL}/rest/v1/audit_logs?username=eq.{user_username}",
                headers=HEADS, timeout=TIMEOUT
            )
        except Exception as e:
            errors.append(f"Audit log wipe exception: {e}")

    if errors:
        print(f"[DELETE USER] Completed with warnings: {errors}")
    
    return {
        "message": "User permanently deleted",
        "user_id": user_id,
        "email": user_email,
        "warnings": errors
    }

@router.post("/users/{user_id}/toggle-block")
def toggle_user_block(user_id: str, block: bool, authorization: str = Header(default="")):
    check_admin(authorization)
    url = f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}"
    data = {"ban_duration": "none" if not block else "876000h"}
    r = requests.put(url, headers=HEADS, json=data, timeout=TIMEOUT)
    return {"status": "success", "blocked": block}

class BlockRequest(BaseModel):
    block: bool

@router.post("/users/{user_id}/block")
def block_user(user_id: str, body: BlockRequest, authorization: str = Header(default="")):
    check_admin(authorization)
    url = f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}"
    data = {"ban_duration": "none" if not body.block else "876000h"}
    r = requests.put(url, headers=HEADS, json=data, timeout=TIMEOUT)
    if not r.ok:
        raise HTTPException(r.status_code, f"Supabase error: {r.text}")
    return {"status": "success", "blocked": body.block}

@router.get("/audits")
def get_audits(authorization: str = Header(default="")):
    check_admin(authorization)
    try:
        # Paginated fetch — newest first for the audit trail display
        # Frontend sorts chronologically for charts
        audits = db_get_all_paginated(AUDIT_TABLE, order="timestamp.desc")
        return audits
    except Exception as e:
        return []

@router.get("/supabase-audits")
def get_supabase_audits(authorization: str = Header(default="")):
    check_admin(authorization)
    try:
        url = f"{SUPABASE_URL}/auth/v1/admin/audit"
        r = requests.get(url, headers=HEADS, timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
        return []
    except Exception as e:
        return []
