# Lunara MVP - Agent Guide

## Project Overview

**Lunara** is an AI-Powered Business Intelligence (BI) platform that enables users to connect to their data warehouse (BigQuery), automatically generate a semantic layer, and interact with their data using natural language queries.

### Core Value Proposition
- Connect your data warehouse once → AI builds semantic layer automatically
- Chat with data in plain English → AI generates SQL, visualizations, and reports
- Build reports, dashboards, and presentations with AI assistance

### User Flow
```
1. Landing Page → Sign Up/Login (Supabase Auth)
2. Dashboard → Manage Projects and Agents
3. BigQuery Connection → Upload service account JSON
4. Semantic Layer Setup → AI analyzes tables, classifies columns, detects relationships
5. SQL Chat → Natural language to SQL with query artifacts
6. Report Builder → AI-generated reports with charts and analysis
```

## Technology Stack

### Backend
| Component | Technology |
|-----------|------------|
| Framework | FastAPI (Python 3.9+) |
| Server | Uvicorn |
| AI Agents | Google ADK (Agent Development Kit) |
| LLM | Gemini 2.0 Flash Preview (Vertex AI) |
| Database | SQLite (local), Supabase (cloud) |
| Data Warehouse | Google BigQuery |
| Auth | Supabase Auth |
| Encryption | Fernet (cryptography library) |

### Frontend
| Component | Technology |
|-----------|------------|
| Architecture | Static HTML (vanilla JS) |
| Styling | Custom CSS with CSS variables |
| Fonts | Inter (Google Fonts), Material Symbols |
| Auth Client | Supabase JS SDK |
| Icons | Material Symbols Outlined |

### Deployment
| Component | Technology |
|-----------|------------|
| Platform | Render (PaaS) |
| Config | `render.yaml` (Blueprint) |
| Environment | Python 3.9 |

## Project Structure

```
Lunara MVP/
├── backend/                      # FastAPI backend
│   ├── main.py                   # Application entry point
│   ├── requirements.txt          # Python dependencies
│   ├── .env                      # Environment variables (gitignored)
│   ├── .env.example              # Environment template
│   ├── lunara.db                 # SQLite database (artifacts, reports)
│   ├── api/
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── auth.py           # Organization creation API
│   │       ├── chat.py           # Chat agent & artifacts endpoints
│   │       ├── connection.py     # BigQuery connection endpoints
│   │       ├── datasets.py       # Dataset/schema browsing
│   │       ├── reports.py        # Report CRUD + generation
│   │       └── semantic.py       # Semantic layer generation
│   ├── models/                   # Pydantic models
│   │   ├── connection.py         # BigQuery credential models
│   │   ├── datasets.py           # Dataset models
│   │   └── semantic.py           # Semantic layer models
│   ├── services/                 # Business logic
│   │   ├── bigquery.py           # BigQuery connection management
│   │   ├── chat_agent.py         # Text-to-SQL agent (ADK)
│   │   ├── report_agent.py       # Report generation agent (ADK)
│   │   ├── relationship_agent.py # FK detection agent (ADK)
│   │   └── semantic_agent.py     # Semantic layer agent (ADK)
│   ├── adk_agents/               # ADK agent definitions
│   │   └── report_agent_v3/
│   ├── data/                     # Encrypted credentials storage
│   ├── generated_reports/        # AI-generated report outputs
│   └── supabase_migrations/      # SQL migrations
│       ├── 001_projects_agents.sql
│       ├── 002_data_sources.sql
│       └── 003_semantic_models.sql
├── auth/
│   └── callback.html             # OAuth callback + org creation
├── docs/
│   ├── BACKLOG.md                # Future improvements
│   └── SUPABASE_SCHEMA_REFERENCE.md
├── assets/images/                # Static images
├── *.html                        # Frontend pages (see below)
├── render.yaml                   # Render deployment config
├── DEPLOY.md                     # Deployment instructions
└── lunara-dev-*.json             # GCP credentials (gitignored)
```

## Frontend Pages

| Page | File | Purpose |
|------|------|---------|
| Landing | `landing.html` | Marketing page, sign up CTA |
| Login | `login.html` | Authentication (Supabase) |
| Auth Callback | `auth/callback.html` | Post-login org setup |
| Dashboard | `dashboard.html` | Projects & agents management |
| Data Sources | `data_sources.html` | BigQuery connection UI |
| Schema Browser | `schema_browser.html` | Browse datasets/tables |
| Semantic Setup | `semantic_layer_setup.html` | AI semantic layer generation |
| Chat Agent | `chat_agent.html` | Natural language SQL interface |
| Report Builder | `report_builder.html` | AI report generation |

## Environment Variables

### Required (Local Development)
```bash
# backend/.env
ENCRYPTION_KEY=<fernet-key>                    # Auto-generated on first run
DEBUG=true                                     # Enable debug mode
FRONTEND_URL=http://localhost:3000             # CORS origin
```

### Required (Production/Render)
```bash
# Set in Render dashboard
ENCRYPTION_KEY=<fernet-key>                    # Auto-generated
GOOGLE_APPLICATION_CREDENTIALS_JSON=<base64>   # GCP service account JSON
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
RENDER=true                                    # Enable production mode
```

### GCP Credentials Handling
- **Local**: Uses `lunara-dev-094f5e9e682e.json` file in project root
- **Render**: Base64-encoded JSON in `GOOGLE_APPLICATION_CREDENTIALS_JSON` env var
- **Main.py** handles decoding and temp file creation on startup

## Build and Run Commands

### Local Development
```bash
# Setup
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Access
# API: http://localhost:8000
# Health: http://localhost:8000/health
# Frontend: http://localhost:8000/ (serves static HTML)
```

### Production (Render)
```bash
# Build command (configured in render.yaml)
pip install -r backend/requirements.txt

# Start command
cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
```

## API Endpoints

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/create-org` | Create organization (service_role) |

### BigQuery Connection
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/connection` | Connect with service account JSON |
| GET | `/api/v1/connection` | Get connection status |
| DELETE | `/api/v1/connection` | Disconnect & clear credentials |

### Datasets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/datasets` | List all datasets |
| GET | `/api/v1/datasets/{dataset}/tables` | List tables in dataset |
| GET | `/api/v1/datasets/{dataset}/tables/{table}` | Get table schema |

### Semantic Layer
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/semantic/generate` | Generate semantic layer (SSE stream) |
| POST | `/api/v1/semantic/detect-relationships` | Detect FK relationships |
| GET | `/api/v1/semantic/models` | List saved models |

### Chat & Artifacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/chat/query` | Chat with agent (SSE stream) |
| POST | `/api/v1/chat/execute` | Execute SQL query |
| POST | `/api/v1/chat/artifacts` | Save query result as artifact |
| GET | `/api/v1/chat/artifacts` | List all artifacts |
| GET | `/api/v1/chat/artifacts/{id}` | Get specific artifact |
| DELETE | `/api/v1/chat/artifacts/{id}` | Delete artifact |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/reports` | Create new report |
| GET | `/api/v1/reports` | List all reports |
| GET | `/api/v1/reports/{id}` | Get report with blocks |
| PUT | `/api/v1/reports/{id}` | Update report |
| DELETE | `/api/v1/reports/{id}` | Delete report |
| POST | `/api/v1/reports/{id}/generate` | AI generate content (SSE) |

## AI Agent Architecture

### 1. Chat Agent (`services/chat_agent.py`)
**Purpose**: Convert natural language to SQL

**Model**: Gemini 2.0 Flash Preview via Vertex AI

**Tools**:
- `get_semantic_context()` - Get semantic model context
- `lookup_column_values()` - Get distinct values for filtering
- `get_date_range()` - Get min/max dates
- `get_column_stats()` - Get numeric column statistics
- `preview_table()` - Sample rows from table
- `search_value()` - Fuzzy search column values
- `generate_sql()` - Output final SQL query

**Session**: Persistent via SQLite (`DatabaseSessionService`)

### 2. Semantic Agent (`services/semantic_agent.py`)
**Purpose**: Analyze table schemas and classify columns

**Tools**:
- `get_table_schema()` - Fetch BigQuery table schema
- `classify_table_columns()` - Classify columns as dimension/measure/time

### 3. Relationship Agent (`services/relationship_agent.py`)
**Purpose**: Detect foreign key relationships between tables

**Approach**: Pure LLM reasoning (no tools)

**Output**: JSON with relationships including confidence scores

### 4. Report Agent (`services/report_agent.py`)
**Purpose**: Generate comprehensive business reports

**Architecture**: Hierarchical multi-agent
- **ReportWriter** (orchestrator) - Coordinates other agents
- **DataAssistant** (tool) - Manages artifacts and report blocks
- **CodeExecutor** (tool) - Runs Python for charts/analysis

**Block Types**: text, chart, kpi, table

## Database Schema

### SQLite (Local)

**artifacts** - Saved query results
```sql
CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    sql TEXT NOT NULL,
    data TEXT NOT NULL,        -- JSON array
    created_at TEXT NOT NULL
);
```

**reports** - Saved reports
```sql
CREATE TABLE reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    blocks TEXT DEFAULT '[]',  -- JSON array of blocks
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

### Supabase (Cloud)

**Core Tables** (managed by Supabase Auth):
- `auth.users` - Authentication users
- `profiles` - User profiles (linked to organizations)
- `organizations` - Multi-tenant organization data

**Application Tables**:
- `projects` - Workspaces for different use cases
- `agents` - Saved chat configurations
- `data_sources` - BigQuery connection metadata
- `semantic_models` - Semantic layer definitions

See `docs/SUPABASE_SCHEMA_REFERENCE.md` and `backend/supabase_migrations/` for full schema.

## Security Considerations

### Authentication
- Supabase Auth with JWT tokens
- Row Level Security (RLS) on all tables
- Service role key used only for org creation bypass

### Credential Storage
- BigQuery credentials encrypted with Fernet
- Stored in `backend/data/credentials.enc`
- Encryption key in `ENCRYPTION_KEY` env var

### CORS
- Development: Allows localhost origins
- Production: Restricted to Render domain + `ALLOW_ALL_ORIGINS` flag

### Secrets Management
- `.env` files gitignored
- GCP credentials file gitignored
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` base64 encoded for Render

## Code Style Guidelines

### Python
- Use type hints (`from __future__ import annotations`)
- Docstrings for all public methods (Google style)
- Pydantic models for API request/response
- Async/await for I/O operations
- Dependency injection via FastAPI `Depends()`

### Example Pattern
```python
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

class MyRequest(BaseModel):
    """Request model for my endpoint."""
    name: str
    count: Optional[int] = None

async def my_endpoint(
    request: MyRequest,
    service: MyService = Depends(get_service)
) -> MyResponse:
    """Handle my endpoint.
    
    Args:
        request: The request data.
        service: Injected service dependency.
        
    Returns:
        The response data.
    """
    return await service.process(request)
```

### Frontend (HTML/CSS/JS)
- CSS variables for theming (`--bg-stone`, `--electric-blue`)
- Material Symbols for icons
- Vanilla JS with async/await for API calls
- SSE (Server-Sent Events) for streaming AI responses

## Testing

Test files in `backend/`:
- `test_*.py` - Various agent and API tests
- `test_vertex_ai.py` - Vertex AI integration tests
- `test_claude_*.py` - Claude API experiments (legacy)

Run tests:
```bash
cd backend
python test_vertex_ai.py
python test_v3_agent.py
```

## Common Development Tasks

### Add New API Endpoint
1. Add Pydantic models to `backend/models/`
2. Add service logic to `backend/services/`
3. Add endpoint to `backend/api/v1/`
4. Register router in `backend/main.py`

### Add New AI Agent
1. Create service in `backend/services/`
2. Configure Vertex AI credentials
3. Define agent with tools/instruction
4. Add API endpoint that streams SSE

### Update Database Schema
1. Add migration SQL to `backend/supabase_migrations/`
2. Update `docs/SUPABASE_SCHEMA_REFERENCE.md`
3. Apply via Supabase SQL Editor

### Deploy to Render
1. Push to GitHub
2. Connect repo in Render dashboard
3. Set environment variables
4. Deploy via `render.yaml` blueprint

## Dependencies

Key packages in `requirements.txt`:
- `fastapi==0.127.0` - Web framework
- `uvicorn==0.34.0` - ASGI server
- `google-cloud-bigquery==3.27.0` - BigQuery client
- `google-adk==1.18.0` - Google Agent Development Kit
- `pydantic==2.12.5` - Data validation
- `cryptography==44.0.0` - Encryption
- `sse-starlette==3.1.2` - SSE streaming
- `supabase>=2.0.0` - Supabase client

## Known Limitations & Future Work

See `docs/BACKLOG.md` for:
- Frontend migration to React/Vite
- OAuth "Sign in with Google" for BigQuery
- Agent saving to database
- Additional artifact types (slides, dashboards)

---

*Last updated: February 10, 2026*
