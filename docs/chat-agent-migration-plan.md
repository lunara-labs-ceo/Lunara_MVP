# Chat Agent Page — React Migration Plan

> **Living document** — Updated as each phase is completed. If context is lost, open a new session and reference this document.

## Context

The chat agent page (`chat_agent.html`) is the most complex page in Lunara (~3000 lines of vanilla JS). A previous attempt to migrate it to React failed because it tried to one-shot everything and skipped AI Elements components. This plan takes an **incremental approach** — build one component at a time, test each, then move to the next.

Design matches the existing app style (Tailark/shadcn, consistent with dashboard, data-sources, and schema pages).

---

## Progress Tracker

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Foundation — Layout Shell + Resize | DONE |
| 2 | Chat Panel — AI Elements Chat UI | DONE |
| 3 | Streaming — Connect to Backend SSE | DONE |
| 4 | SQL Editor — Editor + Tabs + Toolbar | DONE |
| 5 | Results Table — Query Execution | DONE |
| 6 | Sidebar — Sessions, Artifacts, Schema | DONE |
| 7 | Integration — Cross-Panel Wiring + Polish | DONE |

---

## Phase 1: Foundation — Layout Shell + Resize

**Goal**: 3-panel layout skeleton rendering on screen with working resize handles. No API calls.

**Status**: DONE

**Files created/modified**:
- `frontend/app/dashboard/[projectId]/chat/page.tsx` — Server component wrapper (renders `<ChatClient />`)
- `frontend/app/dashboard/[projectId]/chat/client.tsx` — Client component with 3-panel layout (sidebar 240px | editor flex-1 | chat 380px resizable)
- `frontend/components/chat/resize-handle.tsx` — Draggable panel divider (vertical/horizontal, 5px hit area)
- `frontend/hooks/use-resize.ts` — Added `reverse?: boolean` option for right-side panels (dragging left = wider)

**Bug fix**: Backend crashed on startup due to `report_agent.py` failing to create `AgentEngineSandboxCodeExecutor`. Fixed by wrapping `from api.v1 import reports` in try/except in `backend/main.py` so the rest of the backend loads.

**Layout structure**:
```
┌──────────┬────────────────────────────┬──────────────────┐
│ Sidebar  │     SQL Editor Area        │    Chat Panel    │
│ (240px)  │                            │   (380px def)    │
│ placeholder│                          │   placeholder    │
└──────────┴────────────────────────────┴──────────────────┘
```

**What to verify**: Panels render, resize handle drags correctly, sidebar collapses/expands, layout fills viewport without scrolling.

---

## Phase 2: Chat Panel — AI Elements Chat UI

**Goal**: Chat panel with empty state, suggestions, message rendering, input. No streaming — hardcoded test messages.

**Files**:
- `frontend/components/chat/chat-panel.tsx` — Composes all AI Elements
- `frontend/components/chat/chat-message.tsx` — Single message with reasoning + markdown + actions

**AI Elements used**:
- `Conversation` + `ConversationContent` + `ConversationEmptyState` + `ConversationScrollButton`
- `Message` + `MessageContent` + `MessageResponse` (Streamdown markdown)
- `MessageActions` + `MessageAction` (Copy, Run in Editor)
- `Reasoning` + `ReasoningTrigger` + `ReasoningContent`
- `PromptInput` + `PromptInputTextarea` + `PromptInputSubmit`
- `Suggestions` + `Suggestion`

**Status**: DONE

**Files created/modified**:
- `frontend/components/chat/chat-panel.tsx` — Composes Conversation, PromptInput, Suggestions, ConversationEmptyState, ConversationScrollButton
- `frontend/components/chat/chat-message.tsx` — Single message with Reasoning, MessageResponse, MessageActions (Copy, Run in Editor), cleanContent() for legacy JSON
- `frontend/app/dashboard/[projectId]/chat/client.tsx` — Replaced placeholder with `<ChatPanel>`, added mock state + handlers for testing

**What to verify**: Empty state shows with suggestion pills, hardcoded messages render with markdown, reasoning block expands/collapses, copy button works, input textarea auto-grows, Enter submits.

---

## Phase 3: Streaming — Connect to Backend

**Goal**: Send a real message via SSE, see response stream in real-time.

**Status**: DONE

**Files modified**:
- `frontend/app/dashboard/[projectId]/chat/client.tsx` — Only file changed. Replaced mock state with real hooks.

**Files reused (NOT modified)**:
- `frontend/hooks/use-chat-stream.ts` — SSE streaming hook (already complete)
- `frontend/lib/api.ts` — `useApiClient()` for Clerk-authenticated API calls
- `frontend/types/chat.ts` — All types already defined

**What was implemented**:
1. **Prerequisite loading** — `useEffect` on mount resolves `dataSourceId` (localStorage → API fallback) and loads semantic model (non-blocking 404)
2. **Real streaming** — `useChatStream()` hook wired in, provides `isStreaming`, `streamingText`, `streamingThinking`, `isThinkingStreaming`, `generatedSql`, `abortStream`
3. **Async `handleSendMessage`** — auto-creates session on first message, streams via SSE, finalizes assistant message, fire-and-forget persists to Supabase
4. **Loading/error UI** — center panel shows spinner during prereq load, error + "Go to Data Sources" link if no data source found
5. **Message ref** — `messagesRef` prevents stale closure in async handler

**SSE events handled**: `thinking`, `text`, `sql`, `status`, `done`, `error`

**What to verify**: Type question → see thinking shimmer → text streams in → SQL populates → message finalizes. Abort button stops stream. Session created in Supabase.

---

## Phase 4: SQL Editor — Editor + Tabs + Toolbar

**Goal**: SQL editor textarea with tab management and Run/Clear/Save toolbar.

**Status**: DONE

**Files created**:
- `frontend/components/chat/sql-editor-panel.tsx` — Self-contained editor with tab bar, toolbar, and textarea

**Files modified**:
- `frontend/app/dashboard/[projectId]/chat/client.tsx` — Added editor tab state, 7 management callbacks, auto-populate from `generatedSql`, replaced center panel placeholder with `<SqlEditorPanel>`

**What was implemented**:
1. **Tab bar** — Horizontal scrollable tabs, active tab with blue border, close (X) button, "+" to add new tab. Last tab clears instead of closing.
2. **Toolbar** — Run button (primary), Clear button (ghost), right-aligned status indicator (Ready/Running.../rows/Error with colored dot)
3. **Monospace textarea** — `font-mono text-[13px]`, Cmd+Enter shortcut to run, auto-focus on tab switch
4. **Auto-populate** — `useEffect` watches `generatedSql` from stream hook and fills active tab
5. **"Run in Editor"** — Chat Play button puts SQL into active tab via `handleRunSqlFromChat`
6. **Tab state** — `editorTabs: EditorTab[]` with `activeTabIndex`, tab CRUD callbacks

**What to verify**: Tab bar renders, tabs add/switch/close, SQL typed in editor persists per-tab, Cmd+Enter triggers run, generated SQL from chat auto-fills editor, Play button from chat fills editor.

---

## Phase 5: Results Table — Query Execution

**Goal**: Execute SQL via backend, display results in scrollable table.

**Status**: DONE

**Files created**:
- `frontend/components/chat/results-table.tsx` — Lightweight data table with 4 states (ready/running/error/complete), sticky header, row numbers, NULL rendering, 100-row cap

**Files modified**:
- `frontend/components/chat/sql-editor-panel.tsx` — Added results area below textarea with resize handle, passes active tab data to ResultsTable
- `frontend/app/dashboard/[projectId]/chat/client.tsx` — Added results resize hook, replaced Run stub with real `POST /api/v1/chat/execute` call, passes results props to SqlEditorPanel

**What was implemented**:
1. **Query execution** — Run button POSTs SQL to `/api/v1/chat/execute?data_source_id=...`, updates tab with results/error
2. **Results table** — Sticky header, row numbers, alternating rows, monospace numbers, truncated text, italic NULL, 100-row display cap
3. **Editor/results resize** — Horizontal resize handle between textarea and results (250px default, 100-500px range)
4. **Status flow** — Ready → Running (amber pulse) → Complete (green + row count) / Error (red + message)

**What to verify**: Ask chat a question → SQL auto-fills editor → click Run → see results table populate. Error queries show error state. Clear button resets. Resize handle between editor and results works. 100+ row queries show truncation notice.

---

## Phase 6: Sidebar — Sessions, Artifacts, Schema

**Goal**: Left sidebar with session CRUD, artifact list, semantic model tree.

**Status**: DONE

**Files created**:
- `frontend/components/chat/chat-sidebar.tsx` — 3 collapsible sections (Sessions, Artifacts, Tables)

**Files modified**:
- `frontend/app/dashboard/[projectId]/chat/client.tsx` — Added sessions/artifacts state, data loading useEffect, session management callbacks (select/create/delete), artifact callbacks (select/delete), session list sync on message persist, replaced placeholder stubs with `<ChatSidebar>` component

**What was implemented**:
1. **Sessions section** — Lists sessions with relative timestamps, active session highlighted, + button to create, X to delete, click to load messages
2. **Artifacts section** — Lists saved queries with SQL preview, count badge in header, click to open in new editor tab, X to delete
3. **Tables/Schema section** — Expandable tree from semantic model, columns with semantic type badges (DIM/MEA/TIME in colored pills)
4. **Collapsible sections** — ChevronDown/Right toggle, expandedSections state per section
5. **Session switching** — Click session → load full message history from API, set as active
6. **Session lifecycle** — Auto-create on first message, sync name/timestamp after persist, delete with cleanup
7. **Artifact → Editor** — Click artifact opens SQL in a new editor tab

**API calls**:
- Sessions: `GET/POST/PATCH/DELETE /api/v1/chat/sessions`
- Artifacts: `GET/POST/DELETE /api/v1/chat/artifacts`
- Semantic model: `GET /api/v1/semantic/model`

**What to verify**: Create session, select session → messages load, delete session, artifacts load SQL into editor, semantic model tree expands, sidebar collapses.

---

## Phase 7: Integration — Cross-Panel Wiring + Polish

**Goal**: Wire all cross-panel interactions that make the tool cohesive.

**Status**: DONE

**Features** (most already implemented in Phases 3-6):
1. **SQL auto-populate**: Generated SQL from chat → active editor tab *(Phase 4)*
2. **"Run in Editor"**: Chat message action → populates editor *(Phase 4)*
3. **Session persistence**: Auto-save messages to backend after each response *(Phase 3)*
4. **Auto-create session**: First message auto-creates session if none exists *(Phase 3)*
5. **Auto-name session**: Session named from first user message *(Phase 3)*
6. **Stop generation**: Abort button → keep partial response *(Phase 3)*
7. **Page loading states**: Spinner during prereq load, "No data source" error state *(Phase 3)*

**Phase 7 specific work**:
- `frontend/components/chat/save-artifact-dialog.tsx` — Save Artifact modal (shadcn Dialog, auto-title from SQL first line)
- `frontend/components/chat/sql-editor-panel.tsx` — Added `onSaveArtifact` prop, Bookmark button in toolbar
- `frontend/app/dashboard/[projectId]/chat/client.tsx` — Wired save artifact handler (`POST /api/v1/chat/artifacts`), dialog state
- `backend/services/chat_agent.py` — Enabled thinking/reasoning via `BuiltInPlanner(thinking_config=ThinkingConfig(include_thoughts=True, thinking_budget=2048))`. Previously the model never produced thought content because thinking wasn't configured.

**What to verify**: Full end-to-end flow: open page → send message → see thinking shimmer → text streams → SQL appears in editor → run query → see results → save artifact → create new session → previous session persists.

---

## Existing Code to Reuse (NOT rebuild)

| File | Purpose |
|------|---------|
| `frontend/hooks/use-resize.ts` | Generic resize hook |
| `frontend/hooks/use-chat-stream.ts` | SSE streaming (may need fixes) |
| `frontend/types/chat.ts` | All TypeScript types |
| `frontend/lib/api.ts` | `useApiClient()` with Clerk JWT |
| `frontend/components/ai-elements/*` | AI Elements library |
| `frontend/components/ui/*` | shadcn/ui components |

## Key Reference Files

| File | Purpose |
|------|---------|
| `chat_agent.html` | Original vanilla HTML page (3000 lines) — logic reference |
| `backend/api/v1/chat.py` | Backend chat API endpoints |
| `backend/services/chat_agent.py` | ChatAgentService with ADK |
| `frontend/app/dashboard/[projectId]/semantic/page.tsx` | Similar page already migrated (reference for patterns) |
| `frontend/components/ai-elements/*.tsx` | AI Elements component APIs |
