"""
Connection manager for warehouse providers.

Caches WarehouseProvider instances keyed by data_source_id and handles
credential decryption via Fernet.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from cryptography.fernet import Fernet

from .warehouse_provider import WarehouseProvider, create_provider

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages cached WarehouseProvider instances with encrypted credential handling."""

    def __init__(self, encryption_key: str):
        """
        Args:
            encryption_key: Fernet-compatible encryption key used to decrypt
                            stored credentials from Supabase.
        """
        self._fernet = Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)
        self._providers: dict[str, WarehouseProvider] = {}

    async def get_provider(self, data_source_id: str, supabase_client: Any) -> WarehouseProvider:
        """
        Return a cached provider or create one by loading config from Supabase.

        Args:
            data_source_id: The UUID/string ID of the data source row.
            supabase_client: An initialised Supabase client instance
                             (must support `.table(...).select(...).eq(...).single().execute()`).

        Returns:
            A WarehouseProvider instance ready for use.

        Raises:
            ValueError: If the data source is not found or has an unsupported type.
        """
        # Return cached if available
        if data_source_id in self._providers:
            return self._providers[data_source_id]

        # Load data source record from Supabase
        response = (
            supabase_client.table("data_sources")
            .select("type, config, credentials_encrypted")
            .eq("id", data_source_id)
            .single()
            .execute()
        )
        row = response.data
        if not row:
            raise ValueError(f"Data source not found: {data_source_id}")

        warehouse_type: str = row["type"]
        config: dict = row.get("config") or {}
        encrypted_creds: str = row["credentials_encrypted"]

        # Decrypt credentials
        decrypted_bytes = self._fernet.decrypt(encrypted_creds.encode())
        credentials: dict = json.loads(decrypted_bytes.decode())

        # Create provider via factory
        provider = create_provider(warehouse_type, credentials, config)
        self._providers[data_source_id] = provider

        logger.info("Created %s provider for data_source %s", warehouse_type, data_source_id)
        return provider

    async def invalidate(self, data_source_id: str) -> None:
        """
        Remove a cached provider and close its connection pool if applicable.

        Args:
            data_source_id: The data source to evict from the cache.
        """
        provider = self._providers.pop(data_source_id, None)
        if provider is not None and hasattr(provider, "close"):
            try:
                await provider.close()
                logger.info("Closed provider for data_source %s", data_source_id)
            except Exception:
                logger.exception("Error closing provider for data_source %s", data_source_id)

    async def close_all(self) -> None:
        """Close every cached provider and clear the cache."""
        ids = list(self._providers.keys())
        for ds_id in ids:
            await self.invalidate(ds_id)
        logger.info("All providers closed (%d total)", len(ids))
