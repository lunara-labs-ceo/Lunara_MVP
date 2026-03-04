"""
Warehouse provider protocol and factory.

Defines the interface that every data warehouse connector must implement,
plus a factory function to instantiate the correct provider by type.
"""

from typing import Protocol


class WarehouseProvider(Protocol):
    """Interface that every data warehouse connector must implement."""

    async def test_connection(self) -> tuple[bool, str]:
        """Test if the connection is valid. Returns (success, message)."""
        ...

    async def list_schemas(self) -> list[dict]:
        """List available schemas/datasets.
        Returns: [{"name": "public", "description": "..."}, ...]
        """
        ...

    async def list_tables(self, schema: str) -> list[dict]:
        """List tables in a schema/dataset.
        Returns: [{"name": "users", "schema": "public", "row_count": 1000, "table_type": "BASE TABLE"}, ...]
        """
        ...

    async def get_table_schema(self, schema: str, table: str) -> dict:
        """Get column definitions for a table.
        Returns: {"columns": [{"name": "id", "type": "INTEGER", "nullable": True, "description": ""}, ...]}
        """
        ...

    async def execute_query(self, sql: str) -> list[dict]:
        """Execute a read-only SQL query. Returns list of row dicts."""
        ...

    def get_sql_dialect(self) -> str:
        """Return the SQL dialect name. Returns: 'postgresql' | 'bigquery' | 'snowflake' | ..."""
        ...


def create_provider(warehouse_type: str, credentials: dict, config: dict) -> WarehouseProvider:
    """Factory function to create a provider instance."""
    if warehouse_type == "postgres":
        from .providers.postgresql_provider import PostgreSQLProvider

        # Support both connection_string and individual fields
        if "connection_string" in credentials:
            return PostgreSQLProvider(connection_string=credentials["connection_string"])
        else:
            return PostgreSQLProvider(
                host=credentials.get("host", config.get("host")),
                port=int(credentials.get("port", config.get("port", 5432))),
                database=credentials.get("database", config.get("database", "postgres")),
                user=credentials.get("user", credentials.get("username")),
                password=credentials.get("password"),
                schema=config.get("schema", "public"),
            )
    else:
        raise ValueError(f"Unsupported warehouse type: {warehouse_type}. Supported: postgres")
