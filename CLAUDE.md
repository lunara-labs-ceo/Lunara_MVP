# Lunara MVP — Project Context

## What Is Lunara?

Lunara is an **agentic data analytics platform** that lets users connect their PostgreSQL data warehouse, build an AI-powered semantic layer, chat with an AI agent to generate SQL queries, and build editable visual reports — all in a browser-based UI.

**Live URL:** https://lunaralabs.io (deployed on Render)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| Backend | Python 3.12, FastAPI, Uvicorn |
| AI/LLM | Google ADK 1.18 (Agent Development Kit) with Gemini 3 Flash Preview via Vertex AI |
| Database | Supabase (PostgreSQL + RLS) |
| Data Warehouse | PostgreSQL/Supabase (user connects their own). BigQuery, Snowflake, MySQL coming soon |
| Auth | Clerk (JWT + organizations) |
| Deployment | Render (auto-deploys from `render-deploy` branch) |
| Rich Text Editor | Tiptap (report builder) |
| SQL Editor | CodeMirror with SQL language support |

---

## AI Agents

Lunara has three branded AI agents:

| Agent | Internal Service | Purpose |
|-------|-----------------|---------|
| **Atlas** | `SemanticAgentService` + `RelationshipAgentService` | Analyzes database schema, classifies columns (dimension/measure/time), discovers table relationships, generates semantic layer |
| **Luna** | `ChatAgentService` | Text-to-SQL chat agent with 6 exploration tools. Generates SQL from natural language using the semantic layer for context |
| **Quill** | `ReportAgentService` | Two-agent pipeline (Analyst + Reporter). Generates charts via Python code execution in GCP sandboxes, writes narrative HTML reports |

---

## Project Structure

```
Lunara MVP/
├── frontend/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Landing page
│   │   ├── (marketing)/        # Marketing pages (pricing, about, blog, docs, legal, product/*)
│   │   ├── sign-in/            # Clerk sign-in
│   │   ├── sign-up/            # Clerk sign-up
│   │   ├── onboarding/         # Org creation flow
│   │   ├── dashboard/          # Projects overview
│   │   │   └── [projectId]/
│   │   │       ├── data-sources/   # Connect databases
│   │   │       ├── schema/         # Browse tables/columns
│   │   │       ├── semantic/       # Atlas — semantic layer
│   │   │       ├── chat/           # Luna — SQL chat agent
│   │   │       └── reports/        # Quill — report builder
│   │   ├── globals.css         # Theme colors (warm cream/charcoal palette)
│   │   ├── icon.svg            # Lunara favicon
│   │   ├── sitemap.ts          # SEO
│   │   └── robots.ts           # SEO
│   ├── components/
│   │   ├── app-shell/          # Sidebar, org activator
│   │   ├── chat/               # Luna chat components
│   │   ├── reports/            # Quill report components (Tiptap editor, toolbar)
│   │   ├── landing/            # Marketing components (header, hero, footer, etc.)
│   │   ├── data-sources/       # Connection dialog
│   │   └── ui/                 # shadcn/ui primitives
│   ├── hooks/                  # use-chat-stream, use-report-stream, use-resize, use-projects
│   ├── lib/                    # API client, utils, MDX, constants, preprocess-report-html
│   ├── types/                  # TypeScript types (chat, report, project)
│   ├── content/                # MDX blog posts and docs
│   └── proxy.ts                # Clerk auth middleware
│
├── backend/
│   ├── main.py                 # FastAPI app entry point, dependency injection, CORS, lifespan
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Environment variable template
│   ├── middleware/
│   │   └── clerk_auth.py       # Clerk JWT verification (protects all /api/v1/* routes)
│   ├── api/v1/
│   │   ├── chat.py             # Luna chat endpoints (SSE streaming, sessions, artifacts, query execution)
│   │   ├── connection.py       # Data source CRUD (encrypted credentials)
│   │   ├── datasets.py         # Schema/table/column browsing
│   │   ├── projects.py         # Project CRUD (org-scoped)
│   │   ├── reports.py          # Quill report endpoints (SSE streaming, sessions, items CRUD)
│   │   └── semantic.py         # Atlas semantic layer endpoints (SSE streaming, model CRUD)
│   ├── services/
│   │   ├── chat_agent.py       # Luna — ADK LlmAgent with 6 exploration tools
│   │   ├── semantic_agent.py   # Atlas — schema analysis + column classification
│   │   ├── relationship_agent.py  # Atlas — FK/relationship discovery via LLM reasoning
│   │   ├── report_agent.py     # Quill — two-agent pipeline (Analyst + Reporter)
│   │   ├── connection_manager.py  # Caches WarehouseProvider instances, decrypts credentials
│   │   ├── sandbox_manager.py  # GCP Agent Engine sandbox lifecycle (TTL cleanup)
│   │   └── providers/
│   │       └── postgresql_provider.py  # WarehouseProvider implementation for PostgreSQL
│   ├── supabase_migrations/    # 9 SQL migration files
│   └── lunara.db               # SQLite fallback for ADK sessions (local dev only)
│
├── render.yaml                 # Render deployment blueprint (two services)
├── runtime.txt                 # Python 3.12.0
└── docs/                       # Design docs and roadmaps
```

---

## Core User Flow

1. **Sign up / Log in** → Clerk auth (`/sign-in`, `/sign-up`)
2. **Create organization** → `/onboarding` (Clerk orgs for multi-tenant isolation)
3. **Create a project** → `/dashboard`
4. **Connect database** → `/dashboard/[projectId]/data-sources` (PostgreSQL/Supabase with encrypted credentials)
5. **Browse schema** → `/dashboard/[projectId]/schema` (select tables for semantic layer)
6. **Generate semantic layer** → `/dashboard/[projectId]/semantic` (Atlas analyzes schema, classifies columns, discovers relationships)
7. **Chat with data** → `/dashboard/[projectId]/chat` (Luna generates SQL from natural language, user executes queries, saves artifacts)
8. **Build reports** → `/dashboard/[projectId]/reports` (Quill generates charts + narrative, user edits with rich-text toolbar)

---

## Key Architecture

### Authentication
Clerk JWT on all API routes via `middleware/clerk_auth.py`. Supports Clerk v1 and v2 JWT formats. Lazy-syncs users and orgs to Supabase `profiles` and `organizations` tables. Frontend uses `useApiClient()` hook that auto-attaches Bearer token.

### Data Warehouse Connections
**WarehouseProvider protocol** abstracts database operations (`test_connection`, `list_schemas`, `list_tables`, `execute_query`, etc.). Currently PostgreSQL is implemented. Credentials are **Fernet-encrypted** and stored per-project in Supabase `data_sources.credentials_encrypted`. `ConnectionManager` caches provider instances and handles decryption.

### ADK Session Persistence
Uses Google ADK `DatabaseSessionService` backed by PostgreSQL (`DATABASE_URL` env var) for persistent multi-turn conversations. Falls back to SQLite locally. ADK session IDs stored in `chat_sessions.adk_session_id` and `report_sessions.adk_session_id`.

### Sandbox Code Execution
Quill's Analyst agent executes Python code (matplotlib charts) in **GCP Agent Engine sandboxes**. `SandboxManager` handles lifecycle: creation, TTL-based cleanup (default 30min), explicit deletion on session delete, and shutdown cleanup. Chart PNGs stored in GCS bucket (prod) or in-memory (dev).

### Report Editor
Reports are generated as semantic HTML by the Quill agent. Content is loaded into a **Tiptap** rich-text editor with a full toolbar (bold, italic, underline, headings, lists, alignment, highlight, links, tables, sub/superscript, undo/redo). Edits auto-save to Supabase with 1s debounce via `PATCH /reports/items/:id`.

---

## Supabase Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Clerk user records (lazy-synced) |
| `organizations` | Clerk org records (lazy-synced) |
| `projects` | User projects (org-scoped) |
| `data_sources` | Database connections with encrypted credentials |
| `semantic_models` | Semantic layer JSON per project |
| `chat_sessions` | Luna chat sessions (messages JSONB + ADK session ID) |
| `chat_artifacts` | Saved query results from Luna |
| `report_sessions` | Quill report sessions (messages JSONB + ADK session ID) |
| `report_items` | Report content blocks (HTML, charts) |

RLS enabled on all tables. Backend uses Supabase service role key.

---

## API Endpoints

All prefixed with `/api/v1/`, all require Clerk JWT:

**Projects:** `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`

**Connections:** `POST /connections`, `GET /connections`, `GET /connections/{id}/status`, `DELETE /connections/{id}`

**Schemas:** `GET /schemas/{conn_id}/schemas`, `GET /schemas/{conn_id}/schemas/{schema}/tables`, `GET /schemas/{conn_id}/tables/{schema}/{table}/columns`

**Semantic (Atlas):** `POST /semantic/generate` (SSE), `GET/POST /semantic/model`, `POST /semantic/detect-relationships` (SSE)

**Chat (Luna):** `POST /chat/query` (SSE), `POST /chat/execute`, `GET/POST /chat/sessions`, `GET/PATCH/DELETE /chat/sessions/{id}`, `GET/POST/DELETE /chat/artifacts`

**Reports (Quill):** `POST /reports/{id}/generate` (SSE), `GET/POST /reports/sessions`, `GET/PATCH/DELETE /reports/sessions/{id}`, `GET/POST/PATCH/DELETE /reports/items`

**Health:** `GET /health`

---

## Running Locally

**Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
pnpm dev
```

Then open http://localhost:3000

### Required Environment Variables

**Backend (`backend/.env`):**
```
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
GOOGLE_CLOUD_PROJECT=lunara-prod
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=TRUE
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
CLERK_ISSUER_URL=https://xxx.clerk.accounts.dev
DATABASE_URL=postgresql://...  # For ADK session persistence
ENCRYPTION_KEY=xxx  # Auto-generated if missing
```

**Frontend (`frontend/.env.local`):**
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Deployment

- **Branch:** `render-deploy` auto-deploys to Render
- **Services:** Two Render services (backend + frontend) defined in `render.yaml`
- **Runtime:** Python 3.12 (backend), Node.js (frontend)
- **GCP credentials on Render:** Base64-encoded JSON in `GOOGLE_APPLICATION_CREDENTIALS_JSON` env var (decoded to temp file at startup)

---

## Code Style & Conventions

- **Frontend:** Next.js App Router with React Server Components for auth. Client components use `"use client"` directive. Tailwind for styling. shadcn/ui for component primitives.
- **Backend:** FastAPI with async endpoints. Services instantiated in `main.py` lifespan and shared via dependency injection. All routes protected by Clerk JWT middleware.
- **Streaming:** Chat, semantic layer, and report generation use Server-Sent Events (SSE) via `sse-starlette`.
- **Theme:** Warm cream/charcoal palette with CSS custom properties in `globals.css`. Light/dark mode via `next-themes`.
- **Font:** IBM Plex Sans.
