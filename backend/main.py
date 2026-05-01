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
    # Skip root and static files, but allow Admin traffic to be logged since the UI updates dynamically and we want to monitor Admin actions.
    SKIP_PATHS = ["/", "/favicon.ico"]
    if path in SKIP_PATHS:
        return response

    # Identify the user from the token if possible
    username = "Guest"
    auth_header = request.headers.get("Authorization", "")
    if auth_header:
        try:
            from routes.auth import verify_supabase_token
            token = auth_header.replace("Bearer ", "")
            user_info = verify_supabase_token(token)
            username = user_info.get("username", "Guest")
        except:
            pass

    import json
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
