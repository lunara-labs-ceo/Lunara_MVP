"""GCP sandbox lifecycle manager with TTL-based cleanup.

Tracks active Agent Engine sandboxes in memory and runs a background
task that periodically deletes sandboxes idle longer than the TTL.
Also provides a shutdown hook to clean up all tracked sandboxes on
server restart / Render deploy.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta
from typing import Dict, Optional

import vertexai


# Configurable via env vars
_DEFAULT_TTL_MINUTES = 30
_DEFAULT_CLEANUP_INTERVAL_SECONDS = 300  # 5 minutes


class SandboxManager:
    """Manages GCP Agent Engine sandbox lifecycle.

    Three cleanup triggers:
    1. **TTL** — background loop deletes sandboxes idle > ttl_minutes
    2. **Explicit delete** — called when a report session is deleted
    3. **Shutdown** — kills all tracked sandboxes on server stop/deploy
    """

    def __init__(
        self,
        ttl_minutes: Optional[int] = None,
        cleanup_interval_seconds: Optional[int] = None,
    ):
        self._ttl_minutes = ttl_minutes or int(
            os.getenv("SANDBOX_TTL_MINUTES", str(_DEFAULT_TTL_MINUTES))
        )
        self._cleanup_interval = cleanup_interval_seconds or int(
            os.getenv(
                "SANDBOX_CLEANUP_INTERVAL_SECONDS",
                str(_DEFAULT_CLEANUP_INTERVAL_SECONDS),
            )
        )
        # sandbox_resource_name → last-used UTC timestamp
        self._active: Dict[str, datetime] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    # ── Public API ────────────────────────────────────────────────────────────

    def register(self, sandbox_resource_name: str) -> None:
        """Register a sandbox as active (called on create or resume)."""
        self._active[sandbox_resource_name] = datetime.utcnow()
        print(
            f"Sandbox registered: {sandbox_resource_name} "
            f"(active: {len(self._active)})"
        )

    def touch(self, sandbox_resource_name: str) -> None:
        """Update last-used timestamp (called on each generate_content)."""
        if sandbox_resource_name in self._active:
            self._active[sandbox_resource_name] = datetime.utcnow()

    def unregister(self, sandbox_resource_name: str) -> None:
        """Remove from tracking (called after explicit delete)."""
        self._active.pop(sandbox_resource_name, None)

    @property
    def active_count(self) -> int:
        """Number of currently tracked sandboxes."""
        return len(self._active)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Start the background cleanup loop."""
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        print(
            f"✓ SandboxManager started "
            f"(TTL={self._ttl_minutes}m, interval={self._cleanup_interval}s)"
        )

    async def stop(self) -> None:
        """Stop the cleanup loop and delete all tracked sandboxes."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        if self._active:
            print(
                f"Shutdown: deleting {len(self._active)} tracked sandbox(es)..."
            )
            for name in list(self._active):
                await self.delete_sandbox(name)
            self._active.clear()

        print("✓ SandboxManager stopped")

    # ── Sandbox deletion ──────────────────────────────────────────────────────

    async def delete_sandbox(self, sandbox_resource_name: str) -> None:
        """Delete a GCP sandbox. Non-fatal on failure."""
        try:
            project_id, location = _parse_resource_name(sandbox_resource_name)
            client = vertexai.Client(
                project=project_id, location=location
            )
            client.agent_engines.sandboxes.delete(
                name=sandbox_resource_name
            )
            print(f"Sandbox deleted: {sandbox_resource_name}")
        except Exception as e:
            print(
                f"Warning: failed to delete sandbox "
                f"{sandbox_resource_name}: {e}"
            )

    # ── Background cleanup ────────────────────────────────────────────────────

    async def _cleanup_loop(self) -> None:
        """Periodically delete sandboxes that have been idle > TTL."""
        while True:
            try:
                await asyncio.sleep(self._cleanup_interval)
                await self._sweep_stale()
            except asyncio.CancelledError:
                raise  # Let cancellation propagate
            except Exception as e:
                # Never crash the cleanup loop — log and continue
                print(f"Warning: sandbox cleanup error: {e}")

    async def _sweep_stale(self) -> None:
        """Find and delete sandboxes idle longer than the TTL."""
        if not self._active:
            return

        cutoff = datetime.utcnow() - timedelta(minutes=self._ttl_minutes)
        stale = [
            name for name, last_used in self._active.items()
            if last_used < cutoff
        ]

        if stale:
            print(
                f"Sandbox cleanup: {len(stale)} idle sandbox(es) "
                f"(TTL={self._ttl_minutes}m)"
            )

        for name in stale:
            await self.delete_sandbox(name)
            self._active.pop(name, None)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_resource_name(sandbox_resource_name: str) -> tuple[str, str]:
    """Extract (project_id, location) from a sandbox resource name.

    Expected format:
      projects/{project}/locations/{location}/reasoningEngines/{id}/sandboxEnvironments/{id}
    """
    parts = sandbox_resource_name.split("/")
    if len(parts) < 4:
        raise ValueError(
            f"Invalid sandbox resource name: {sandbox_resource_name}"
        )
    return parts[1], parts[3]
