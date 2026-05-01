from fastapi import APIRouter, HTTPException, Header
import requests
from services.supabase_service import db_get_all, USERS_TABLE, AUDIT_TABLE, SUPABASE_URL, HEADS, TIMEOUT

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
        
        # Use Supabase count=exact to get total audit event count efficiently
        count_headers = {
            **HEADS,
            "Prefer": "count=exact",
            "Range-Unit": "items",
            "Range": "0-0"
        }
        count_r = requests.get(f"{SUPABASE_URL}/rest/v1/audit_logs", headers=count_headers, timeout=TIMEOUT)
        total_audit = 0
        if count_r.ok:
            content_range = count_r.headers.get("Content-Range", "0/0")
            total_audit = int(content_range.split("/")[-1]) if "/" in content_range else 0
        
        return {
            "total_users": len(users),
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

        # 3. Fetch activity counts
        audits = db_get_all(AUDIT_TABLE, limit=3000) or []
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
                # Bucket name is the username, folder is 'main'
                files = storage_list(official_uname, folder="main")
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
    # 1. Delete from Supabase Auth
    try:
        requests.delete(f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}", headers=HEADS, timeout=TIMEOUT)
    except: pass
    
    # 2. Delete from our users table is handled by the user (or we could find by email)
    return {"message": "User deletion requested"}

@router.post("/users/{user_id}/toggle-block")
def toggle_user_block(user_id: str, block: bool, authorization: str = Header(default="")):
    check_admin(authorization)
    # Update Supabase Auth user metadata or ban status
    url = f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}"
    data = {"ban_duration": "none" if not block else "876000h"} # 100 years
    r = requests.put(url, headers=HEADS, json=data, timeout=TIMEOUT)
    return {"status": "success", "blocked": block}

@router.get("/audits")
def get_audits(authorization: str = Header(default="")):
    check_admin(authorization)
    try:
        # Fetch all audit logs ordered oldest first so charts display the full timeline
        audits = db_get_all(AUDIT_TABLE, order="timestamp.asc", limit=5000)
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
