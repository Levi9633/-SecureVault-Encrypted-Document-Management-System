from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel
import requests

# We import SUPABASE_URL from supabase_service
from services.supabase_service import SUPABASE_URL, SUPABASE_KEY, log_audit_event, db_insert, USERS_TABLE, db_update, storage_list

router = APIRouter(prefix="/auth", tags=["auth"])

class AdminLoginRequest(BaseModel):
    password: str

class SyncUserRequest(BaseModel):
    username: str
    email: str
    password: str

@router.post("/sync-user")
def sync_user(req: SyncUserRequest, request: Request):
    try:
        db_insert(USERS_TABLE, {
            "user_id": req.username,
            "gmail": req.email,
            "password": req.password
        })
        log_audit_event(req.username, "signup", request=request, extra={"auth_method": "Supabase Auth"})
        return {"message": "User synced successfully"}
    except Exception as e:
        # Ignore if it already exists
        return {"message": "User might already exist"}

@router.post("/admin-login")
def admin_login(req: AdminLoginRequest, request: Request):
    if req.password == "P@##WORD*":
        log_audit_event("Admin", "login", request=request, extra={"auth_method": "Bypass Password"})
        return {
            "username":   "Admin",
            "email":      "admin@vaultsync.com",
            "role":       "admin",
            "token":      "admin_bypass_token_999",
        }
    else:
        log_audit_event("Unknown", "login", request=request, status="FAILURE", extra={"reason": "Wrong admin password"})
        raise HTTPException(401, "Wrong password")

def verify_supabase_token(token: str) -> dict:
    if not token:
        raise HTTPException(401, "No token provided")
    
    if token == "admin_bypass_token_999":
        return {"sub": "Admin", "role": "admin", "username": "Admin"}
    
    try:
        r = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_KEY
            },
            timeout=10
        )
        if r.status_code != 200:
            raise HTTPException(401, "Invalid or expired Supabase token")
        
        user_data = r.json()
        metadata = user_data.get("user_metadata", {})
        username = metadata.get("username", user_data.get("email", "").split("@")[0])
        role = metadata.get("role", "user")
        
        return {"sub": user_data.get("id"), "role": role, "username": username, "email": user_data.get("email")}
    except requests.exceptions.RequestException as e:
        raise HTTPException(503, f"Failed to verify token with Supabase: {e}")

class ChangePasswordRequest(BaseModel):
    new_password: str

@router.get("/profile")
def get_profile(authorization: str = Header(default="")):
    user_info = verify_supabase_token(authorization.replace("Bearer ", ""))
    username = user_info["username"]
    
    real_storage = 0
    real_files_count = 0
    if user_info["role"] != "admin":
        try:
            files = storage_list(username.lower(), folder="main")
            if isinstance(files, list):
                for f in files:
                    if f.get("id"):
                        real_files_count += 1
                        real_storage += f.get("metadata", {}).get("size", 0) or f.get("size", 0) or 0
        except:
            pass
            
    return {
        "username": username,
        "email": user_info.get("email"),
        "role": user_info.get("role"),
        "storage_used": real_storage,
        "storage_limit": 52428800, # 50MB
        "files_count": real_files_count
    }

@router.post("/change-password")
def change_password(req: ChangePasswordRequest, authorization: str = Header(default=""), request: Request = None):
    user_info = verify_supabase_token(authorization.replace("Bearer ", ""))
    username = user_info["username"]
    
    if user_info["role"] == "admin":
        raise HTTPException(400, "Admin password bypass logic is fixed and cannot be changed here")
        
    try:
        db_update(USERS_TABLE, "user_id", username, {"password": req.new_password})
        log_audit_event(username, "change_password", request=request, extra={"details": "User changed their password successfully"})
        return {"message": "Password updated successfully"}
    except Exception as e:
        raise HTTPException(500, f"Failed to sync password to database: {e}")
