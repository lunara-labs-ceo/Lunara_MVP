"""API endpoints for project management.

Provides CRUD operations for projects.  Each endpoint requires Clerk JWT
authentication, and projects are scoped to the user's Clerk organization.
"""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from middleware.clerk_auth import ClerkUser, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class CreateProjectRequest(BaseModel):
    name: str
    description: Optional[str] = None


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    organization_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str
    updated_at: str
    data_source_count: int = 0


# ---------------------------------------------------------------------------
# Dependency stubs — overridden in main.py via dependency_overrides
# ---------------------------------------------------------------------------


def get_supabase():
    """Dependency to get the Supabase admin client.

    Overridden in main.py at startup.
    """
    raise NotImplementedError("Supabase client not initialized")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
) -> List[ProjectResponse]:
    """List all projects for the user's organization."""
    try:
        query = supabase.table("projects").select(
            "id, name, description, organization_id, created_by, created_at, updated_at"
        )

        # Scope to organization if available, otherwise scope to user
        if user.org_id:
            query = query.eq("organization_id", user.org_id)
        else:
            query = query.eq("created_by", user.user_id)

        result = query.order("created_at", desc=True).execute()

        projects = []
        for row in result.data or []:
            # Count data sources for each project
            ds_result = (
                supabase.table("data_sources")
                .select("id", count="exact")
                .eq("project_id", row["id"])
                .execute()
            )
            ds_count = ds_result.count if ds_result.count is not None else 0

            projects.append(
                ProjectResponse(
                    id=str(row["id"]),
                    name=row["name"],
                    description=row.get("description"),
                    organization_id=row.get("organization_id"),
                    created_by=row.get("created_by"),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    data_source_count=ds_count,
                )
            )

        return projects

    except Exception as e:
        logger.error("Failed to list projects: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    request: CreateProjectRequest,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
) -> ProjectResponse:
    """Create a new project."""
    try:
        insert_data = {
            "name": request.name,
            "description": request.description,
            "created_by": user.user_id,
        }

        # Associate with org if available
        if user.org_id:
            insert_data["organization_id"] = user.org_id

        result = supabase.table("projects").insert(insert_data).execute()
        row = result.data[0] if result.data else None
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create project")

        return ProjectResponse(
            id=str(row["id"]),
            name=row["name"],
            description=row.get("description"),
            organization_id=row.get("organization_id"),
            created_by=row.get("created_by"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            data_source_count=0,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create project: %s", e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
) -> ProjectResponse:
    """Get a single project by ID."""
    try:
        result = (
            supabase.table("projects")
            .select("id, name, description, organization_id, created_by, created_at, updated_at")
            .eq("id", project_id)
            .maybe_single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Project not found")

        row = result.data

        # Verify access: user must be in the same org or be the creator
        if user.org_id and row.get("organization_id") != user.org_id:
            if row.get("created_by") != user.user_id:
                raise HTTPException(status_code=404, detail="Project not found")
        elif not user.org_id and row.get("created_by") != user.user_id:
            raise HTTPException(status_code=404, detail="Project not found")

        # Count data sources
        ds_result = (
            supabase.table("data_sources")
            .select("id", count="exact")
            .eq("project_id", project_id)
            .execute()
        )
        ds_count = ds_result.count if ds_result.count is not None else 0

        return ProjectResponse(
            id=str(row["id"]),
            name=row["name"],
            description=row.get("description"),
            organization_id=row.get("organization_id"),
            created_by=row.get("created_by"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            data_source_count=ds_count,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get project %s: %s", project_id, e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    request: UpdateProjectRequest,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
) -> ProjectResponse:
    """Update a project's name or description."""
    # Build update dict with only non-None fields
    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.description is not None:
        update_data["description"] = request.description

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        # Verify project exists and user has access
        existing = (
            supabase.table("projects")
            .select("id, organization_id, created_by")
            .eq("id", project_id)
            .maybe_single()
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Project not found")

        row = existing.data
        if user.org_id and row.get("organization_id") != user.org_id:
            if row.get("created_by") != user.user_id:
                raise HTTPException(status_code=404, detail="Project not found")
        elif not user.org_id and row.get("created_by") != user.user_id:
            raise HTTPException(status_code=404, detail="Project not found")

        # Update
        result = (
            supabase.table("projects")
            .update(update_data)
            .eq("id", project_id)
            .execute()
        )
        updated_row = result.data[0] if result.data else None
        if not updated_row:
            raise HTTPException(status_code=500, detail="Failed to update project")

        # Count data sources
        ds_result = (
            supabase.table("data_sources")
            .select("id", count="exact")
            .eq("project_id", project_id)
            .execute()
        )
        ds_count = ds_result.count if ds_result.count is not None else 0

        return ProjectResponse(
            id=str(updated_row["id"]),
            name=updated_row["name"],
            description=updated_row.get("description"),
            organization_id=updated_row.get("organization_id"),
            created_by=updated_row.get("created_by"),
            created_at=updated_row["created_at"],
            updated_at=updated_row["updated_at"],
            data_source_count=ds_count,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update project %s: %s", project_id, e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    user: ClerkUser = Depends(get_current_user),
    supabase=Depends(get_supabase),
) -> dict:
    """Delete a project and all associated data sources (via CASCADE)."""
    try:
        # Verify project exists and user has access
        existing = (
            supabase.table("projects")
            .select("id, organization_id, created_by")
            .eq("id", project_id)
            .maybe_single()
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Project not found")

        row = existing.data
        if user.org_id and row.get("organization_id") != user.org_id:
            if row.get("created_by") != user.user_id:
                raise HTTPException(status_code=404, detail="Project not found")
        elif not user.org_id and row.get("created_by") != user.user_id:
            raise HTTPException(status_code=404, detail="Project not found")

        # Delete (CASCADE will remove data_sources, agents, etc.)
        supabase.table("projects").delete().eq("id", project_id).execute()

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete project %s: %s", project_id, e)
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
