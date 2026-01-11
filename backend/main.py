"""Lunara Backend - FastAPI Application."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.v1 import connection
from api.v1 import datasets
from api.v1 import semantic
from api.v1 import chat
from api.v1 import reports
from services.bigquery import BigQueryService


# Load environment variables
load_dotenv()


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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5500",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5500",
        "null",  # For file:// URLs
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(connection.router, prefix="/api/v1")
app.include_router(datasets.router, prefix="/api/v1")
app.include_router(semantic.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "lunara-backend"}


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Lunara API",
        "version": "0.1.0",
        "docs": "/docs",
    }
