"""Clerk JWT verification middleware for FastAPI.

Provides FastAPI dependencies for authenticating requests using Clerk JWTs.
Also handles lazy sync of Clerk users/orgs to Supabase on first API call.
"""
from __future__ import annotations

import os
import logging
from typing import Optional

import jwt
from jwt import PyJWKClient
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ClerkUser(BaseModel):
    """Authenticated user extracted from Clerk JWT."""
    user_id: str
    org_id: Optional[str] = None
    org_role: Optional[str] = None
    org_slug: Optional[str] = None


# Lazy-initialized JWKS client and Supabase client
_jwks_client: Optional[PyJWKClient] = None
_supabase_client = None
_security = HTTPBearer()


def _get_jwks_client() -> PyJWKClient:
    """Get or create the JWKS client (lazy init)."""
    global _jwks_client
    if _jwks_client is None:
        issuer = os.getenv("CLERK_ISSUER_URL")
        if not issuer:
            raise RuntimeError("CLERK_ISSUER_URL environment variable is not set")
        jwks_url = f"{issuer}/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client


def _get_supabase():
    """Get or create the Supabase admin client (service role key)."""
    global _supabase_client
    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if url and key and key != "REPLACE_WITH_SERVICE_ROLE_KEY":
            from supabase import create_client
            _supabase_client = create_client(url, key)
    return _supabase_client


async def _sync_user_to_supabase(user: ClerkUser) -> None:
    """Lazy sync: ensure Clerk user and org exist in Supabase.

    Creates profile and organization records if they don't exist yet.
    This runs on every authenticated request but short-circuits fast
    if records already exist (single SELECT query).
    """
    sb = _get_supabase()
    if sb is None:
        return  # Supabase not configured, skip sync

    try:
        # Check if profile exists
        result = sb.table("profiles").select("id").eq("id", user.user_id).maybe_single().execute()
        if not result.data:
            # Create profile
            sb.table("profiles").insert({
                "id": user.user_id,
                "organization_id": user.org_id,
            }).execute()
            logger.info(f"Created Supabase profile for Clerk user {user.user_id}")

            # Auto-provision free-tier billing
            from services.billing import CreditService
            billing = CreditService(sb)
            await billing.get_or_create_subscription(user.user_id)
            await billing.get_or_create_ledger(user.user_id)
            logger.info(f"Provisioned free-tier billing for user {user.user_id}")

        # Sync org if present
        if user.org_id:
            org_result = sb.table("organizations").select("id").eq("id", user.org_id).maybe_single().execute()
            if not org_result.data:
                sb.table("organizations").insert({
                    "id": user.org_id,
                    "name": user.org_slug or user.org_id,
                }).execute()
                logger.info(f"Created Supabase organization for Clerk org {user.org_id}")
    except Exception as e:
        # Don't fail the request if sync fails — log and continue
        logger.warning(f"Supabase sync failed (non-fatal): {e}")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(_security),
) -> ClerkUser:
    """FastAPI dependency: verify Clerk JWT and return user info.

    Raises HTTP 401 if token is missing, invalid, or expired.
    Also triggers lazy sync of user/org to Supabase.
    """
    token = credentials.credentials
    issuer = os.getenv("CLERK_ISSUER_URL")

    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {e}")

    # Clerk v2 session tokens use compact "o" object for org claims:
    #   { "o": { "id": "org_...", "slg": "slug", "rol": "admin", ... } }
    # Clerk v1 (deprecated) used top-level: org_id, org_slug, org_role
    org_claims = payload.get("o") or {}
    user = ClerkUser(
        user_id=payload.get("sub", ""),
        org_id=org_claims.get("id") or payload.get("org_id"),
        org_role=org_claims.get("rol") or payload.get("org_role"),
        org_slug=org_claims.get("slg") or payload.get("org_slug"),
    )

    logger.debug(
        "Clerk JWT — user=%s, org_id=%s, org_role=%s",
        user.user_id, user.org_id, user.org_role,
    )

    # Lazy sync to Supabase (fire-and-forget, non-blocking on failure)
    await _sync_user_to_supabase(user)

    return user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(
        HTTPBearer(auto_error=False)
    ),
) -> Optional[ClerkUser]:
    """FastAPI dependency: optionally verify Clerk JWT.

    Returns None instead of raising 401 if no token is present.
    """
    if credentials is None:
        return None
    return await get_current_user(credentials)
