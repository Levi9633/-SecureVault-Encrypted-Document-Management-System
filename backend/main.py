import socket

# Force IPv4 globally
_orig = socket.getaddrinfo
def _ipv4(host, port, family=0, type=0, proto=0, flags=0):
    return _orig(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _ipv4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.auth import router as auth_router
from routes.files import router as files_router
from routes.admin import router as admin_router
from services.supabase_service import log_audit_event
import time
import json
import asyncio
from fastapi import Request

app = FastAPI(title="VaultSync API", version="2.0")

# Allow React frontend to call this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def api_monitoring_middleware(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time_ms = int((time.time() - start_time) * 1000)

    path = request.url.path
    # Skip root, static files, and auth endpoints (login/signup must be instant)
    SKIP_PATHS = ["/", "/favicon.ico"]
    SKIP_PREFIXES = ["/auth/"]
    if path in SKIP_PATHS or any(path.startswith(p) for p in SKIP_PREFIXES):
        return response

    # Cheaply extract username from JWT payload WITHOUT making a network call
    username = "Guest"
    auth_header = request.headers.get("Authorization", "")
    if auth_header:
        try:
            import base64
            token = auth_header.replace("Bearer ", "")
            if token == "admin_bypass_token_999":
                username = "Admin"
            else:
                payload_b64 = token.split(".")[1]
                padding = 4 - len(payload_b64) % 4
                payload_json = base64.b64decode(payload_b64 + "=" * padding).decode("utf-8")
                payload = json.loads(payload_json)
                meta = payload.get("user_metadata", {})
                username = meta.get("username") or payload.get("email", "Guest").split("@")[0]
        except Exception:
            pass

    metadata = {
        "method": request.method,
        "endpoint": path,
        "status": response.status_code,
        "ms": process_time_ms,
        "ip_address": request.client.host if request.client else "unknown",
        "device": request.headers.get("user-agent", "unknown")
    }

    loop = asyncio.get_running_loop()
    import functools
    loop.run_in_executor(
        None,
        functools.partial(
            log_audit_event,
            username,
            "API_REQUEST",
            None,
            "SUCCESS" if response.status_code < 400 else "FAILURE",
            None,
            metadata
        )
    )
    return response

app.include_router(auth_router)
app.include_router(files_router)
app.include_router(admin_router)


@app.get("/")
def root():
    return {"message": "VaultSync API 2.0 is running ✅"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
