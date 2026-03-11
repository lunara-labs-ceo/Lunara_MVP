"""Lunara Backend - FastAPI Application."""
from __future__ import annotations

import os
import base64
import tempfile
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables FIRST, before any app module imports.
# Service files read env vars at import time, so .env must be loaded before them.
# Use explicit path — CWD may differ from backend/ when launched via launch.json
load_dotenv(Path(__file__).resolve().parent / ".env")

IS_RENDER = os.getenv("RENDER") == "true"


def setup_gcp_credentials() -> None:
    """Set up GCP credentials from environment. Raises on misconfiguration.

    Two modes:
    - Production (Render/CI): set GOOGLE_APPLICATION_CREDENTIALS_JSON to the
      base64-encoded contents of the service account JSON key file.
    - Local dev: set GOOGLE_APPLICATION_CREDENTIALS to the path of the service
      account JSON key file in backend/.env.
    """
    # Mode 1: base64-encoded JSON string (Render, CI)
    creds_json_b64 = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if creds_json_b64:
        try:
            creds_json = base64.b64decode(creds_json_b64).decode("utf-8")
            creds_path = Path(tempfile.gettempdir()) / "gcp_credentials.json"
            creds_path.write_text(creds_json)
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(creds_path)
            print("✓ GCP credentials loaded from GOOGLE_APPLICATION_CREDENTIALS_JSON")
            return
        except Exception as e:
            raise RuntimeError(
                f"Failed to decode GOOGLE_APPLICATION_CREDENTIALS_JSON: {e}"
            ) from e

    # Mode 2: path to local JSON key file (set GOOGLE_APPLICATION_CREDENTIALS in .env)
    creds_path_str = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path_str:
        if Path(creds_path_str).exists():
            print(f"✓ GCP credentials loaded from {creds_path_str}")
            return
        raise RuntimeError(
            f"GOOGLE_APPLICATION_CREDENTIALS points to a file that does not exist: {creds_path_str}"
        )

    raise RuntimeError(
        "No GCP credentials configured.\n"
        "  Local dev : set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json in backend/.env\n"
        "  Production: set GOOGLE_APPLICATION_CREDENTIALS_JSON=<base64 JSON> in Render"
    )


def validate_gcp_config() -> None:
    """Validate required Vertex AI env vars are present. Raises on missing vars."""
    required = {
        "GOOGLE_CLOUD_PROJECT": "your GCP project ID",
        "GOOGLE_CLOUD_LOCATION": "Vertex AI region, e.g. us-central1",
        "GOOGLE_GENAI_USE_VERTEXAI": "must be TRUE",
    }
    missing = [f"{k} ({hint})" for k, hint in required.items() if not os.getenv(k)]
    if missing:
        raise RuntimeError(
            "Missing required GCP config env vars — add these to backend/.env:\n  "
            + "\n  ".join(missing)
        )
    print(
        f"✓ GCP config: project={os.getenv('GOOGLE_CLOUD_PROJECT')}, "
        f"location={os.getenv('GOOGLE_CLOUD_LOCATION')}"
    )


setup_gcp_credentials()
validate_gcp_config()


# App imports come AFTER env vars and credentials are fully configured.
from contextlib import asynccontextmanager
from typing import Optional

from cryptography.fernet import Fernet
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from supabase import create_client as create_supabase_client
from google.adk.sessions import DatabaseSessionService

from api.v1 import connection
from api.v1 import datasets
from api.v1 import projects
from api.v1 import semantic
from api.v1 import chat
try:
    from api.v1 import reports
except Exception as e:
    reports = None  # type: ignore[assignment]
    print(f"⚠ Reports module failed to load (non-critical): {e}")
from services.connection_manager import ConnectionManager


# Global singletons initialised at startup
_connection_manager: Optional[ConnectionManager] = None
_supabase_client = None
_fernet: Optional[Fernet] = None
_adk_session_service: Optional[DatabaseSessionService] = None


def get_or_create_encryption_key() -> str:
    """Get encryption key from environment or generate a new one.
    
    Returns:
        The encryption key string.
    """
    key = os.getenv("ENCRYPTION_KEY")
    
    if not key or key == "your-fernet-key-here":
        # Generate a new key and save it
        key = Fernet.generate_key().decode()
        env_path = Path(__file__).parent / ".env"
        
        # Write or update the .env file
        if env_path.exists():
            content = env_path.read_text()
            if "ENCRYPTION_KEY=" in content:
                lines = content.split("\n")
                lines = [
                    f"ENCRYPTION_KEY={key}" if line.startswith("ENCRYPTION_KEY=") else line
                    for line in lines
                ]
                env_path.write_text("\n".join(lines))
            else:
                with open(env_path, "a") as f:
                    f.write(f"\nENCRYPTION_KEY={key}\n")
        else:
            env_path.write_text(f"ENCRYPTION_KEY={key}\n")
        
        print(f"Generated new encryption key and saved to .env")
    
    return key


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    global _connection_manager, _supabase_client, _fernet

    # Startup
    encryption_key = get_or_create_encryption_key()
    _fernet = Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)
    _connection_manager = ConnectionManager(encryption_key)

    # Initialise Supabase admin client (service role)
    sb_url = os.getenv("SUPABASE_URL")
    sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if sb_url and sb_key and sb_key != "REPLACE_WITH_SERVICE_ROLE_KEY":
        _supabase_client = create_supabase_client(sb_url, sb_key)
    else:
        print("WARNING: Supabase not configured — connection/schema APIs will fail")
        _supabase_client = None

    # Initialise ADK session service (PostgreSQL in prod, SQLite fallback locally)
    global _adk_session_service
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        _adk_session_service = DatabaseSessionService(db_url=database_url)
        print("✓ ADK session persistence: PostgreSQL")
    else:
        from pathlib import Path as _Path
        _fallback_db = _Path(__file__).parent / "lunara.db"
        _adk_session_service = DatabaseSessionService(
            db_url=f"sqlite:///{_fallback_db}"
        )
        print("⚠ DATABASE_URL not set — using SQLite fallback (not for production)")

    # Wire shared dependencies for connection + datasets routers
    app.dependency_overrides[connection.get_connection_manager] = lambda: _connection_manager
    app.dependency_overrides[connection.get_supabase] = lambda: _supabase_client
    app.dependency_overrides[connection.get_fernet] = lambda: _fernet
    app.dependency_overrides[datasets.get_connection_manager] = lambda: _connection_manager
    app.dependency_overrides[datasets.get_supabase] = lambda: _supabase_client
    app.dependency_overrides[projects.get_supabase] = lambda: _supabase_client
    # Wire ADK session service for chat + reports
    app.dependency_overrides[chat.get_adk_session_service] = lambda: _adk_session_service
    if reports is not None:
        app.dependency_overrides[reports.get_adk_session_service] = lambda: _adk_session_service

    print("Lunara backend started")

    yield

    # Shutdown
    if _connection_manager:
        await _connection_manager.close_all()
    app.dependency_overrides.clear()
    print("Lunara backend shutting down")


# Create FastAPI application
app = FastAPI(
    title="Lunara API",
    description="Backend API for Lunara - AI-Powered Business Intelligence",
    version="0.1.0",
    lifespan=lifespan,
)


# Configure CORS
cors_origins = [
    "http://localhost:3000",
    "http://localhost:5500",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:8000",
]

# Add Render domain if set
render_url = os.getenv("RENDER_EXTERNAL_URL")
if render_url:
    cors_origins.append(render_url)

# Add frontend URL (for Next.js frontend on separate domain)
frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    cors_origins.append(frontend_url)

print(f"CORS allowed origins: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(projects.router, prefix="/api/v1")
app.include_router(connection.router, prefix="/api/v1")
app.include_router(datasets.router, prefix="/api/v1")
app.include_router(semantic.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
if reports is not None:
    app.include_router(reports.router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "lunara-backend"}
