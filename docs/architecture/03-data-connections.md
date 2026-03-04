# 03 — Data Connections: Warehouse-Agnostic Provider

**Scope:** Replacing the global BigQuery singleton with per-connection, per-warehouse credential storage. The provider abstraction that lets the same API work with BigQuery, PostgreSQL, Snowflake, etc.

**Depends on:** 02 (Resource scoping — `data_sources` gets `organization_id` + nullable `project_id`)

---

## Current State

### Global Singleton BigQuery Connection

`backend/services/bigquery.py` — `BigQueryService`:
- **One encrypted credentials file** on disk (`backend/data/credentials.enc`).
- All users and projects share the same connection.
- `validate_and_connect()` writes credentials to disk, `disconnect()` deletes them.
- `execute_query()` runs SQL on whatever project is connected.
- Used by: chat agent (tool calls), semantic agent (schema inspection), datasets endpoint.

### Connection API (`api/v1/connection.py`)

- `POST /connection/bigquery` — Upload service account JSON → encrypts and stores globally.
- `GET /connection/status` — Returns global connection state.
- `DELETE /connection/disconnect` — Removes global credentials.
- **No project_id or org_id context.** One connection for the entire server.

### `data_sources` Table (Migration 002)

Already exists with the right shape:
```sql
data_sources
  id UUID PK
  project_id UUID NOT NULL → projects(id)     -- becomes nullable in 008
  type TEXT CHECK (bigquery|postgres|redshift|snowflake)
  name TEXT
  config JSONB                                  -- stores gcp_project_id, datasets, etc.
  status TEXT CHECK (pending|connected|error)
  created_at, updated_at
```

But **credentials aren't stored here** — they're in the global encrypted file. The `data_sources` table is metadata-only.

### Problems

1. **Single connection for all users.** User A connects their warehouse, User B sees User A's data.
2. **Credentials on disk.** Can't scale to multiple connections. Server restart can lose connection state.
3. **BigQuery-only.** Every service (`bigquery.py`, `chat_agent.py`, `semantic_agent.py`, `datasets.py`) uses `google.cloud.bigquery.Client` directly.
4. **No `data_source_id` FK** on `semantic_models` or `chat_sessions` — can't trace which connection was used.
5. **Hardcoded CHECK constraint** on `data_sources.type` — only 4 values allowed.

---

## Proposed Design

### 1. Store Credentials in Supabase (Encrypted)

Move from "one file on disk" to "one row per connection in `data_sources`":

```sql
-- Add to data_sources table (migration 008)
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS credentials_encrypted TEXT;
```

Each data source row stores its own encrypted credentials blob. Encryption uses the same Fernet key (`ENCRYPTION_KEY` env var) already in use.

**Why Supabase, not a secrets manager?**
- We already have Fernet encryption working.
- Supabase gives us RLS as a safety net.
- For MVP, encrypted column is sufficient. Vault/KMS can come later for Enterprise.
- The encrypted blob is opaque — Supabase can't read it.

### 2. Provider Protocol

Replace the `BigQueryService` singleton with a protocol that each warehouse implements:

```python
# backend/services/warehouse_provider.py

from typing import Protocol, Optional

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
        Returns: [{"name": "users", "schema": "public", "row_count": 1000, ...}, ...]
        """
        ...

    async def get_table_schema(self, table_id: str) -> dict:
        """Get column definitions for a table.
        Returns: {"columns": [{"name": "id", "type": "INTEGER", ...}, ...]}
        """
        ...

    async def execute_query(self, sql: str) -> list[dict]:
        """Execute a read-only SQL query. Returns list of row dicts."""
        ...

    def get_sql_dialect(self) -> str:
        """Return the SQL dialect name (for semantic agent prompt tuning).
        Returns: 'bigquery' | 'postgresql' | 'snowflake' | ...
        """
        ...
```

### 3. BigQuery Provider

Wraps the existing `BigQueryService` logic:

```python
# backend/services/providers/bigquery_provider.py

class BigQueryProvider:
    def __init__(self, credentials_dict: dict, gcp_project_id: str):
        from google.cloud import bigquery
        from google.oauth2 import service_account

        creds = service_account.Credentials.from_service_account_info(credentials_dict)
        self.client = bigquery.Client(credentials=creds, project=gcp_project_id)
        self.project_id = gcp_project_id

    async def test_connection(self) -> tuple[bool, str]:
        try:
            datasets = list(self.client.list_datasets(max_results=1))
            return True, f"Connected to {self.project_id}"
        except Exception as e:
            return False, str(e)

    async def list_schemas(self) -> list[dict]:
        """In BigQuery, schemas = datasets."""
        datasets = list(self.client.list_datasets())
        return [{"name": ds.dataset_id, "description": ""} for ds in datasets]

    async def list_tables(self, schema: str) -> list[dict]:
        tables = list(self.client.list_tables(schema))
        # ... return table info
        pass

    async def get_table_schema(self, table_id: str) -> dict:
        table = self.client.get_table(table_id)
        return {
            "columns": [
                {
                    "name": field.name,
                    "type": field.field_type,
                    "mode": field.mode,
                    "description": field.description or "",
                }
                for field in table.schema
            ]
        }

    async def execute_query(self, sql: str) -> list[dict]:
        job = self.client.query(sql)
        rows = job.result()
        return [dict(row) for row in rows]

    def get_sql_dialect(self) -> str:
        return "bigquery"
```

### 4. PostgreSQL Provider (Next Priority)

```python
# backend/services/providers/postgresql_provider.py

class PostgreSQLProvider:
    def __init__(self, host: str, port: int, database: str, user: str, password: str, schema: str = "public"):
        import asyncpg
        self.dsn = f"postgresql://{user}:{password}@{host}:{port}/{database}"
        self.schema = schema
        self.pool = None

    async def test_connection(self) -> tuple[bool, str]:
        try:
            import asyncpg
            conn = await asyncpg.connect(self.dsn)
            await conn.execute("SELECT 1")
            await conn.close()
            return True, "Connected"
        except Exception as e:
            return False, str(e)

    async def list_schemas(self) -> list[dict]:
        # Query information_schema.schemata
        pass

    async def list_tables(self, schema: str) -> list[dict]:
        # Query information_schema.tables
        pass

    async def get_table_schema(self, table_id: str) -> dict:
        # Query information_schema.columns
        pass

    async def execute_query(self, sql: str) -> list[dict]:
        import asyncpg
        conn = await asyncpg.connect(self.dsn)
        rows = await conn.fetch(sql)
        await conn.close()
        return [dict(row) for row in rows]

    def get_sql_dialect(self) -> str:
        return "postgresql"
```

### 5. Provider Factory

```python
# backend/services/warehouse_provider.py

def create_provider(warehouse_type: str, credentials: dict, config: dict) -> WarehouseProvider:
    if warehouse_type == "bigquery":
        from .providers.bigquery_provider import BigQueryProvider
        return BigQueryProvider(
            credentials_dict=credentials,
            gcp_project_id=config.get("gcp_project_id", credentials.get("project_id")),
        )
    elif warehouse_type == "postgres":
        from .providers.postgresql_provider import PostgreSQLProvider
        return PostgreSQLProvider(
            host=config["host"],
            port=config.get("port", 5432),
            database=config.get("database", "postgres"),
            user=credentials["user"],
            password=credentials["password"],
            schema=config.get("schema", "public"),
        )
    else:
        raise ValueError(f"Unsupported warehouse type: {warehouse_type}")
```

### 6. Connection Manager

Caches active provider instances per data source so we don't re-create connections on every request:

```python
# backend/services/connection_manager.py

class ConnectionManager:
    """Caches active warehouse providers keyed by data_source_id."""

    def __init__(self, encryption_key: str):
        self._providers: dict[str, WarehouseProvider] = {}
        self._fernet = Fernet(encryption_key.encode())

    async def get_provider(self, data_source_id: str) -> WarehouseProvider:
        """Get or create a provider for a data source."""
        if data_source_id in self._providers:
            return self._providers[data_source_id]

        # Load from Supabase
        row = supabase.table("data_sources") \
            .select("type, config, credentials_encrypted") \
            .eq("id", data_source_id) \
            .single() \
            .execute()

        ds = row.data
        credentials = json.loads(
            self._fernet.decrypt(ds["credentials_encrypted"].encode()).decode()
        )

        provider = create_provider(ds["type"], credentials, ds["config"])
        self._providers[data_source_id] = provider
        return provider

    def invalidate(self, data_source_id: str):
        """Remove cached provider (e.g., after credential update)."""
        self._providers.pop(data_source_id, None)
```

### 7. Updated API Endpoints

The connection API changes from "upload global credentials" to "create a data source":

```
POST /api/v1/connections
  Body: { warehouse_type, name, config, credentials }
  → Encrypt credentials → store in data_sources → test connection → return data_source_id

GET /api/v1/connections
  → List all data sources for the user's org

GET /api/v1/connections/{id}/status
  → Test connection, return status

DELETE /api/v1/connections/{id}
  → Delete data source + encrypted credentials

GET /api/v1/connections/{id}/schemas
  → List schemas/datasets (replaces /datasets)

GET /api/v1/connections/{id}/schemas/{schema}/tables
  → List tables (replaces /datasets/{id}/tables)
```

Every endpoint scoped by `organization_id` from the Clerk JWT.

---

## Schema Changes

### In Migration 008 (Combined)

```sql
-- Add credentials column to data_sources
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS credentials_encrypted TEXT;

-- Make the type check more flexible (add 'mysql', 'databricks', etc. later)
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_type_check
    CHECK (type IN ('bigquery', 'postgres', 'snowflake', 'redshift', 'mysql', 'databricks'));

-- Add organization_id (from doc 02)
-- ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS organization_id TEXT;
-- (already covered in 02-resource-scoping.md migration)
```

### New Columns on Other Tables (FKs to data_sources)

These are needed so the semantic agent and chat agent know **which connection to use**:

```sql
-- semantic_models needs to know which data source it was generated from
ALTER TABLE semantic_models ADD COLUMN IF NOT EXISTS data_source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL;

-- chat_sessions needs to know which data source to query against
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS data_source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL;

-- report_sessions needs to know which data source was used
ALTER TABLE report_sessions ADD COLUMN IF NOT EXISTS data_source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL;
```

---

## How This Flows Into Other Studios

- **Semantic Studio (doc 04):** When generating a semantic model, the user selects a data source. The semantic agent uses `get_provider(data_source_id)` instead of the global BigQuery client. The `data_source_id` is saved on the semantic model.
- **Chat Studio (doc 05):** When starting a chat, the agent knows which data source to query via `chat_sessions.data_source_id` (inherited from the semantic model). Tool calls use `get_provider()`.
- **Report Studio (doc 06):** Reports reference a data source for the analyst agent's code execution.

---

## Migration Path (No Downtime)

1. Add `credentials_encrypted` column to `data_sources`.
2. Deploy new connection endpoints alongside old ones.
3. When a user creates a new connection via new endpoint → stored in `data_sources`.
4. Old global connection still works for existing users (backward compatible).
5. Gradually retire old `/connection/bigquery` endpoint once all users have migrated.
6. Delete `backend/data/credentials.enc` handling.

---

## Open Questions

1. **Connection pooling for PostgreSQL:** BigQuery client handles connection management internally. PostgreSQL needs connection pooling (`asyncpg.Pool`). Should the `ConnectionManager` handle this, or should each provider manage its own pool?
   - **Recommendation:** Each provider manages its own connection lifecycle. The `ConnectionManager` just caches provider instances.

2. **Credential rotation:** If a user updates credentials for an existing data source, should we invalidate all cached providers and active sessions using that connection?
   - **Recommendation:** Yes. `ConnectionManager.invalidate(data_source_id)` on credential update.

3. **SQL dialect in chat agent:** The chat agent's tool methods hardcode BigQuery SQL syntax (backticks for table names, `CAST ... AS STRING`). With PostgreSQL, syntax is different (double quotes, `::TEXT`). How does the agent know which syntax to use?
   - **Answer:** The provider exposes `get_sql_dialect()`. The chat agent's system prompt includes the dialect. Tool methods should use the provider for query execution, not construct SQL directly. → Detailed in doc 04 and 05.

---

*Last updated: March 4, 2026*
