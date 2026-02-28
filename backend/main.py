"""Lunara Backend - FastAPI Application."""
from __future__ import annotations

import os
import base64
import tempfile
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables FIRST, before any app module imports.
# Service files read env vars at import time, so .env must be loaded before them.
load_dotenv()

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
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from api.v1 import connection
from api.v1 import datasets
from api.v1 import semantic
from api.v1 import chat
from api.v1 import reports
from api.v1 import auth
from services.bigquery import BigQueryService


# Global BigQuery service instance
_bq_service: Optional[BigQueryService] = None


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
    global _bq_service
    
    # Startup
    encryption_key = get_or_create_encryption_key()
    _bq_service = BigQueryService(encryption_key)
    
    # Override the dependency using FastAPI's proper mechanism
    app.dependency_overrides[connection.get_bigquery_service] = lambda: _bq_service
    
    print("🚀 Lunara backend started")
    
    yield
    
    # Shutdown
    app.dependency_overrides.clear()
    print("👋 Lunara backend shutting down")


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
    "null",  # For file:// URLs
]

# Add Render domain if set
render_url = os.getenv("RENDER_EXTERNAL_URL")
if render_url:
    cors_origins.append(render_url)
    cors_origins.append(render_url.replace("https://", "http://"))

# For development/demo - allow all origins
if IS_RENDER or os.getenv("ALLOW_ALL_ORIGINS") == "true":
    cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True if cors_origins != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(connection.router, prefix="/api/v1")
app.include_router(datasets.router, prefix="/api/v1")
app.include_router(semantic.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "lunara-backend"}


# Static file serving for frontend pages
FRONTEND_DIR = Path(__file__).parent.parent  # Parent of backend folder

@app.get("/")
async def serve_index():
    """Serve the landing page as homepage."""
    return FileResponse(FRONTEND_DIR / "landing.html")

@app.get("/landing.html")
async def serve_landing():
    """Serve landing page."""
    return FileResponse(FRONTEND_DIR / "landing.html")

@app.get("/bq_connection.html")
async def serve_bq_connection():
    """Serve BigQuery connection page."""
    return FileResponse(FRONTEND_DIR / "bq_connection.html")

@app.get("/schema_browser.html")
async def serve_schema_browser():
    """Serve schema browser page."""
    return FileResponse(FRONTEND_DIR / "schema_browser.html")

@app.get("/semantic_layer_setup.html")
async def serve_semantic_layer():
    """Serve semantic layer setup page."""
    return FileResponse(FRONTEND_DIR / "semantic_layer_setup.html")

@app.get("/chat_agent.html")
async def serve_chat_agent():
    """Serve chat agent page."""
    return FileResponse(FRONTEND_DIR / "chat_agent.html")

@app.get("/report_builder.html")
async def serve_report_builder():
    """Serve report builder page."""
    return FileResponse(FRONTEND_DIR / "report_builder.html")

@app.get("/dashboard.html")
async def serve_dashboard():
    """Serve dashboard page."""
    return FileResponse(FRONTEND_DIR / "dashboard.html")

@app.get("/auth/callback.html")
async def serve_auth_callback():
    """Serve auth callback page."""
    return FileResponse(FRONTEND_DIR / "auth" / "callback.html")

@app.get("/login.html")
async def serve_login():
    """Serve login page."""
    return FileResponse(FRONTEND_DIR / "login.html")

@app.get("/data_sources.html")
async def serve_data_sources():
    """Serve data sources page."""
    return FileResponse(FRONTEND_DIR / "data_sources.html")

# Serve static assets (images, etc.)
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")
