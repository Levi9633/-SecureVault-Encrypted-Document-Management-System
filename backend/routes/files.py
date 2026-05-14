import asyncio
import time
from fastapi import APIRouter, UploadFile, File, Header, HTTPException, Form, Request, BackgroundTasks
from fastapi.responses import Response
from services.supabase_service import storage_upload, storage_list, storage_download, create_bucket_if_needed, log_audit_event, db_select, db_update, USERS_TABLE
from services.encryption import encrypt_file, decrypt_file
from services.email_service import send_encryption_key_email
from routes.auth import verify_supabase_token

router = APIRouter(prefix="/files", tags=["files"])

def get_username_from_token(authorization: str = "") -> str:
    if not authorization:
        raise HTTPException(401, "Not authenticated")
    token = authorization.replace("Bearer ", "")
    payload = verify_supabase_token(token)
    return payload.get("username")

def get_user_info_from_token(authorization: str = "") -> tuple:
    if not authorization:
        raise HTTPException(401, "Not authenticated")
    token = authorization.replace("Bearer ", "")
    payload = verify_supabase_token(token)
    return payload.get("username"), payload.get("email")

@router.post("/upload")
async def upload_file(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    file_password: str = Form(...),
    authorization: str = Header(default=""),
):
    username, user_email = get_user_info_from_token(authorization)
    bucket = username.lower()

    start_time = time.time()
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")

    if len(file_password) < 6:
        raise HTTPException(400, "Encryption password must be at least 6 characters.")

    # Encrypt (Zero-Knowledge PBKDF2)
    try:
        encrypted = await asyncio.to_thread(encrypt_file, data, file_password)
    except Exception as e:
        raise HTTPException(500, f"Encryption failed: {e}")

    try:
        await asyncio.to_thread(create_bucket_if_needed, bucket)
    except Exception as e:
        pass

    import re
    safe_filename = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', file.filename)
    # We only upload the .enc file now. The salt/IV are inside the .enc file.
    enc_path = f"main/{safe_filename}.enc"

    try:
        await asyncio.to_thread(storage_upload, bucket, enc_path, encrypted)
    except Exception as e:
        raise HTTPException(503, f"Upload failed: {e}")

    file_size = len(encrypted)
    client_host = request.client.host if request.client else "Unknown"
    user_agent = request.headers.get("user-agent", "Unknown")
    process_time_ms = int((time.time() - start_time) * 1000)

    # ── 1. Update storage usage in DB (best-effort, don't block audit log) ──
    try:
        user_rows = await asyncio.to_thread(db_select, USERS_TABLE, "user_id", username)
        if user_rows:
            current_storage = user_rows[0].get("storage_used", 0) or 0
            new_storage = current_storage + file_size
            await asyncio.to_thread(db_update, USERS_TABLE, "user_id", username, {"storage_used": new_storage})
    except Exception as e:
        print(f"[STORAGE TRACKING FAILED] {e}")

    # ── 2. Always write audit log — independent of DB update ──
    try:
        await asyncio.to_thread(
            log_audit_event,
            username,
            "FILE_ENCRYPT_UPLOAD",
            None,
            "SUCCESS",
            {"file_name": file.filename, "file_size_bytes": file_size, "encryption": "AES-256-GCM"},
            {"ip_address": client_host, "device": user_agent, "ms": process_time_ms}
        )
    except Exception as e:
        print(f"[AUDIT LOG FAILED - UPLOAD] {e}")

    # Send email notification asynchronously
    if user_email:
        background_tasks.add_task(
            send_encryption_key_email, 
            user_email, 
            username, 
            file.filename, 
            file_password
        )

    return {"message": "File encrypted and uploaded securely. Encryption key sent to your email.", "filename": safe_filename}

@router.get("/list")
def list_files(authorization: str = Header(default="")):
    username = get_username_from_token(authorization)
    try:
        items = storage_list(username.lower(), "main")
        files = [{"name": i["name"]} for i in items if i.get("name", "").endswith(".enc")]
        return files
    except Exception as e:
        return []

@router.post("/download/{filename}")
def download_file(
    filename: str, 
    request: Request,
    file_password: str = Header(..., alias="x-file-password"), 
    authorization: str = Header(default="")
):
    start_time = time.time()
    """ Note: Using POST to securely send the file password, or custom header """
    username = get_username_from_token(authorization)
    bucket = username.lower()

    try:
        enc_data = storage_download(bucket, f"main/{filename}")
    except Exception as e:
        raise HTTPException(404, "File not found")

    try:
        decrypted = decrypt_file(enc_data, file_password)
    except Exception as e:
        log_audit_event(
            username, 
            "FILE_DECRYPT", 
            request=request, 
            status="FAILURE", 
            file_info={"file_name": filename, "encryption": "AES-256-GCM"}, 
            extra={"reason": "Incorrect password. Decryption failed."}
        )
        raise HTTPException(401, "Incorrect file password. Decryption failed.")

    original_name = filename.replace(".enc", "")
    process_time_ms = int((time.time() - start_time) * 1000)
    log_audit_event(
        username, 
        "FILE_DECRYPT", 
        request=request, 
        file_info={"file_name": original_name, "encryption": "AES-256-GCM"},
        extra={"ms": process_time_ms}
    )

    return Response(
        content=decrypted,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{original_name}"'},
    )
