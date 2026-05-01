from fastapi import APIRouter, UploadFile, File, Header, HTTPException, Form, Request
from fastapi.responses import Response
from services.supabase_service import storage_upload, storage_list, storage_download, create_bucket_if_needed, log_audit_event, db_select, db_update, USERS_TABLE
from services.encryption import encrypt_file, decrypt_file
from routes.auth import verify_supabase_token

router = APIRouter(prefix="/files", tags=["files"])

def get_username_from_token(authorization: str = "") -> str:
    if not authorization:
        raise HTTPException(401, "Not authenticated")
    token = authorization.replace("Bearer ", "")
    
    payload = verify_supabase_token(token)
    return payload.get("username")

@router.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    file_password: str = Form(...),
    authorization: str = Header(default=""),
):
    username = get_username_from_token(authorization)
    bucket = username

    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")

    if len(file_password) < 6:
        raise HTTPException(400, "Encryption password must be at least 6 characters.")

    # Encrypt (Zero-Knowledge PBKDF2)
    try:
        encrypted = encrypt_file(data, file_password)
    except Exception as e:
        raise HTTPException(500, f"Encryption failed: {e}")

    try:
        create_bucket_if_needed(bucket)
    except Exception as e:
        pass

    # We only upload the .enc file now. The salt/IV are inside the .enc file.
    enc_path = f"main/{file.filename}.enc"

    try:
        storage_upload(bucket, enc_path, encrypted)
    except Exception as e:
        raise HTTPException(503, f"Upload failed: {e}")

    # Track storage and log audit
    try:
        file_size = len(encrypted)
        user_rows = db_select(USERS_TABLE, "user_id", username)
        if user_rows:
            current_storage = user_rows[0].get("storage_used", 0) or 0
            new_storage = current_storage + file_size
            db_update(USERS_TABLE, "user_id", username, {"storage_used": new_storage})
            
        log_audit_event(
            username, 
            "FILE_ENCRYPT_UPLOAD", 
            request=request, 
            file_info={"file_name": file.filename, "file_size_bytes": file_size, "encryption": "AES-256-GCM"}
        )
    except Exception as e:
        print(f"[METADATA TRACKING FAILED] {e}")

    return {"message": "File encrypted and uploaded securely.", "filename": file.filename}

@router.get("/list")
def list_files(authorization: str = Header(default="")):
    username = get_username_from_token(authorization)
    try:
        items = storage_list(username, "main")
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
    """ Note: Using POST to securely send the file password, or custom header """
    username = get_username_from_token(authorization)
    bucket = username

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
    log_audit_event(
        username, 
        "FILE_DECRYPT", 
        request=request, 
        file_info={"file_name": original_name, "encryption": "AES-256-GCM"}
    )

    return Response(
        content=decrypted,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{original_name}"'},
    )
