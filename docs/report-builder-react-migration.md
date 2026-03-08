# Report Builder React Migration Plan

## Context

We're migrating the vanilla HTML/CSS/JS `report_builder.html` to React as part of the MBP React migration (Phase 2). The chat agent page was already successfully migrated — this plan follows the same patterns and architecture. The report builder is a 3-panel layout (sidebar | document canvas | chat copilot) where users chat with an AI agent that generates report content (text, charts, tables) displayed on a document canvas.

## Architecture Overview

Same 3-panel layout as chat agent, but center panel is a **Document Canvas** instead of SQL Editor:

```
┌──────────┬────────────────────────┬──────────────┐
│ Sidebar  │   Document Canvas      │ Report       │
│ (240px)  │   (flex-1)             │ Copilot Chat │
│          │                        │ (380px)      │
│ Sessions │ [Title: Editable]      │              │
│ Artifacts│ ┌──────────────────┐   │ Messages     │
│          │ │ Report Content   │   │ + Streaming  │
│          │ │ (html/chart/     │   │              │
│          │ │  text/table)     │   │ [Input]      │
│          │ └──────────────────┘   │              │
└──────────┴────────────────────────┴──────────────┘
```

## Phase 1: Backend API — Report Session + Item CRUD

**Why:** The vanilla page used Supabase JS client directly. With Clerk auth, all data access goes through the FastAPI backend. We need CRUD endpoints mirroring `backend/api/v1/chat.py` lines 157-296.

**File:** `backend/api/v1/reports.py` (extend existing)

Endpoints added:
- `GET  /reports/sessions?project_id=xxx` → list report_sessions, order by created_at desc
- `POST /reports/sessions` → insert into report_sessions
- `GET  /reports/sessions/{session_id}` → select single session
- `PATCH /reports/sessions/{session_id}` → update name/messages
- `DELETE /reports/sessions/{session_id}` → delete session + cascade items
- `GET  /reports/items?report_id=xxx` → list report_items, order by position asc
- `POST /reports/items` → insert into report_items
- `DELETE /reports/items/{item_id}` → delete single item

## Phase 2: TypeScript Types

**File:** `frontend/types/report.ts` (new)

- `ReportMessage` — role, content, codeBlocks, timestamp
- `CodeBlock` — language, code
- `ReportSession` — id, project_id, name, messages, created_by, timestamps
- `ReportItem` — id, report_id, type (text/html/chart/table), title, content, position
- `ReportStreamEvent` — type, content, language, data, item, items_added

## Phase 3: SSE Streaming Hook

**File:** `frontend/hooks/use-report-stream.ts` (new)

Adapted from `use-chat-stream.ts` with:
- Endpoint: `POST /api/v1/reports/{reportId}/generate`
- Request body: `{ prompt, artifacts, history }`
- Events: text, status, code, content_item, done, error
- Returns: `{ fullText, codeBlocks, contentItems }`

## Phase 4: Page Foundation + Layout

**Files:**
- `frontend/app/dashboard/[projectId]/reports/page.tsx` (replace placeholder)
- `frontend/app/dashboard/[projectId]/reports/client.tsx` (new)

3-panel layout mirroring chat/client.tsx with ResizeHandle and useResize hook.

## Phase 5: Report Chat Panel + Message Components

**Files:**
- `frontend/components/reports/report-chat-panel.tsx`
- `frontend/components/reports/report-message.tsx`
- `frontend/components/reports/collapsible-code.tsx`

Chat panel using AI Elements (Conversation, Message, PromptInput) with report-specific empty state, suggestions, and code block rendering.

## Phase 6: Document Canvas

**Files:**
- `frontend/components/reports/document-canvas.tsx`
- `frontend/components/reports/report-content-item.tsx`

Center panel rendering report items (html, text, chart, table) with editable title and delete functionality.

## Phase 7: Report Sidebar

**File:** `frontend/components/reports/report-sidebar.tsx`

Two sections: Sessions (CRUD) and Artifacts (read-only from chat_artifacts).

## Phase 8: Integration

Wire all panels together in client.tsx:
- handleSendMessage: auto-create session → stream → persist items + messages
- Session management: select, create, delete, title editing
- Item management: delete items from canvas

## Files Summary

### Backend (1 file modified):
- `backend/api/v1/reports.py` — CRUD endpoints added

### Frontend (10 files):
| File | Action |
|------|--------|
| `frontend/types/report.ts` | New |
| `frontend/hooks/use-report-stream.ts` | New |
| `frontend/app/dashboard/[projectId]/reports/page.tsx` | Replace |
| `frontend/app/dashboard/[projectId]/reports/client.tsx` | New |
| `frontend/components/reports/report-chat-panel.tsx` | New |
| `frontend/components/reports/report-message.tsx` | New |
| `frontend/components/reports/collapsible-code.tsx` | New |
| `frontend/components/reports/report-sidebar.tsx` | New |
| `frontend/components/reports/document-canvas.tsx` | New |
| `frontend/components/reports/report-content-item.tsx` | New |

### Reused existing (no changes):
- `components/ai-elements/*` — Conversation, Message, PromptInput
- `components/chat/resize-handle.tsx` — resize divider
- `hooks/use-resize.ts` — resize state management
- `lib/api.ts` — useApiClient() with Clerk JWT
- `types/chat.ts` — ChatArtifact type
