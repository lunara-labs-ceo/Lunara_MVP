"""Auth API endpoints for Lunara."""
from __future__ import annotations

import os
from typing import Optional
from pydantic import BaseModel

from fastapi import APIRouter, HTTPException, Header
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

router = APIRouter(tags=["auth"])


# Get Supabase config
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


class CreateOrgRequest(BaseModel):
    """Request model for creating an organization."""
    org_name: str
    user_id: str


class CreateOrgResponse(BaseModel):
    """Response model for created organization."""
    success: bool
    org_id: Optional[str] = None
    error: Optional[str] = None


@router.post("/auth/create-org", response_model=CreateOrgResponse)
async def create_organization(
    request: CreateOrgRequest,
    authorization: str = Header(None)
):
    """Create a new organization for a user.
    
    This endpoint uses the service_role key to bypass RLS,
    allowing org creation even when client-side RLS isn't working.
    """
    try:
        # Verify we have service role key
        if not SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(
                status_code=500,
                detail="Server not configured with service role key"
            )
        
        # Import supabase here to avoid import errors if not installed
        from supabase import create_client
        
        # Create admin client with service role key (bypasses RLS)
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        
        # Create the organization
        org_result = supabase.table("organizations").insert({
            "name": request.org_name
        }).execute()
        
        if not org_result.data or len(org_result.data) == 0:
            raise Exception("Failed to create organization")
        
        org_id = org_result.data[0]["id"]
        
        # Update the user's profile with the organization_id
        profile_result = supabase.table("profiles").update({
            "organization_id": org_id
        }).eq("id", request.user_id).execute()
        
        return CreateOrgResponse(
            success=True,
            org_id=org_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        return CreateOrgResponse(
            success=False,
            error=str(e)
        )
