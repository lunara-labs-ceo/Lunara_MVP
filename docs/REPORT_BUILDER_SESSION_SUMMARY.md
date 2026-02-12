# Report Builder Implementation Session Summary

## What is Report Builder?

Report Builder is a "Document Copilot" feature for Lunara BI - essentially **Word with AI Copilot**. Users interact with an AI agent through natural language chat to generate report content from their saved data artifacts.

### Core Concept
- **Not** a drag-and-drop block editor (original approach was wrong)
- **Not** manual report composition
- **IS** an AI-driven document generator where users chat naturally and the AI creates content

### Content Types
1. **Text** - Markdown-formatted analysis, summaries, insights
2. **Charts** - Matplotlib visualizations (bar, pie, line, etc.)
3. **Tables** - Formatted data grids from artifacts

### User Flow
1. User navigates to Report Builder
2. Creates/opens a report (auto-created on page load)
3. Chats with AI: "Create a summary of my Q4 sales"
4. AI fetches artifacts, analyzes data, generates content
5. Content appears as sections in the document
6. User can delete sections or add more via chat

---

## Architecture Evolution (The Journey)

### Attempt 1: Singleton with Shared State ❌
**Problem:** Global singleton `ReportAgentService` with shared `_report_blocks` list
```python
_report_agent = None  # Global singleton

def get_report_agent():
    if _report_agent is None:
        _report_agent = ReportAgentService()
    return _report_agent  # Same instance for ALL requests!
```
**Race Condition:**
- User A starts report → blocks go to shared list
- User B starts report → blocks ALSO go to same list
- Both users see mixed content
- When A saves, B's data is lost

### Attempt 2: Request-Scoped Instances ✅
**Solution:** Create new service instance per request
```python
@router.post("/{report_id}/generate")
async def generate_content(report_id: int, request: GenerateRequest):
    agent = ReportAgentService(report_id=report_id)  # NEW instance
    # ... generate ...
```
**Result:** No shared state, no race conditions

### Attempt 3: Hierarchical Multi-Agent with AgentTool ❌
**Architecture:**
```
ReportWriter (main)
├── AgentTool(DataAssistant) - fetch artifacts
└── AgentTool(CodeExecutor) - generate charts
```
**Problem:** ADK doesn't allow `code_executor` with other tools in same agent

### Attempt 4: Separate CodeExecutor as Sub-Agent ❌
**Architecture:**
```
ReportWriter (main with tools)
└── sub_agents=[CodeExecutor]  # ADK sub-agent
```
**Problem:** ADK Bug #729 - Sub-agent events don't propagate properly
- Code executes (we see `inline_data` in warnings)
- Events never reach parent agent's event stream
- Charts generated but lost in void

### Attempt 5: Hybrid Approach - Backend-Triggered Charts ✅
**Final Working Architecture:**
```
ReportWriter Agent (tools only, no code executor)
├── list_artifacts
├── get_artifact_data  
├── add_text_content
└── add_table_content

ChartGenerator Agent (code executor only, standalone)
└── code_executor=BuiltInCodeExecutor()
```

**Flow:**
1. User asks for chart
2. Main agent fetches data
3. Main agent adds `CHART_REQUEST: description` marker as text
4. Backend detects marker after main agent finishes
5. Backend calls `ChartGenerator` explicitly with data
6. Chart is captured and added to content items

---

## Key Issues Encountered

### 1. ADK Code Executor + Tools Incompatibility
**Issue:** Cannot use `code_executor` with other tools in same agent
```python
# This FAILS:
Agent(tools=[my_tool], code_executor=BuiltInCodeExecutor())  # ❌
```
**Why:** ADK architectural constraint
**Solution:** Separate agents - one with tools, one with code executor

### 2. ADK Bug #729 - AgentTool Event Propagation
**Issue:** AgentTool wrapper loses multimodal content
```python
Agent(tools=[AgentTool(chart_agent)])  # inline_data lost! ❌
```
**Symptom:** Chart generates (see warnings) but never reaches parent
**Solution:** Use `sub_agents` instead of `AgentTool`

### 3. ADK Sub-Agent Event Propagation
**Issue:** Sub-agent events don't appear in parent's `run_async()` stream
```python
Agent(sub_agents=[chart_agent])  # Events not propagated! ❌
```
**Symptom:** `inline_data` in logs but not in event handler
**Root Cause:** ADK only yields parent agent events, not sub-agent events
**Solution:** Hybrid approach - call chart generator separately after main agent

### 4. Model Name Confusion
**Issue:** Used `gemini-2.0-flash` instead of `gemini-3-flash-preview`
**Why:** Copy-paste from different agent implementations
**Impact:** Inconsistent behavior across agents

### 5. Duplicate Chart Bug
**Issue:** Chart yielded twice (once explicitly, once via content_items loop)
```python
yield {"type": "chart", ...}  # First yield

for item in content_items:
    yield {"type": "content_item", "item": item}  # Chart yielded again!
```
**Solution:** Track items_before_chart count, only yield those

### 6. Database Schema Migration
**Issue:** Old `reports` table had different schema (no `title` column)
**Error:** `sqlite3.OperationalError: table reports has no column named title`
**Solution:** Auto-detect old schema and recreate tables

### 7. Indentation Errors
**Issue:** Mixed tabs/spaces in nested conditionals
**Error:** `IndentationError: unindent does not match any outer indentation level`
**Solution:** Careful code review and testing

---

## Working Implementation Details

### Database Schema
```sql
-- Reports table
CREATE TABLE reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'Untitled Report',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Report content items
CREATE TABLE report_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    type TEXT NOT NULL,  -- 'text', 'chart', 'table'
    title TEXT,
    content TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);
```

### API Endpoints
- `POST /reports` - Create report
- `GET /reports/{id}` - Get report with content
- `POST /reports/{id}/generate` - AI chat (SSE stream)
- `DELETE /reports/{id}/items/{item_id}` - Delete section

### Frontend Architecture
- Document canvas with scrollable sections
- Chat sidebar with streaming responses
- Three content renderers: markdown, chart (base64 img), table
- No complex state management - simple request/response

---

## Lessons Learned

### ADK Specific
1. **Read the docs carefully** - Built-in tools can't mix with custom tools
2. **Check GitHub issues** - Bug #729 saved hours of debugging
3. **Test event propagation early** - Sub-agents are tricky
4. **Use standalone agents when possible** - Simpler than sub-agents

### Architecture
1. **Start simple, add complexity only when needed**
2. **Request-scoped > Singleton** for stateful services
3. **Backend should handle orchestration** - Don't rely on LLM for complex workflows
4. **Explicit is better than implicit** - CHART_REQUEST marker pattern works

### Debugging
1. **Add DEBUG logs liberally** - Remove later
2. **Test incrementally** - Don't change multiple things at once
3. **Watch server logs closely** - Warnings contain crucial info

---

## Current Status

**Status:** ✅ WORKING (with caveats)

**What Works:**
- Text generation and summaries
- Table display
- Chart generation (via hybrid approach)
- Report saving/loading
- Delete sections

**Known Issues:**
- Agent sometimes adds unwanted tables (instruction tuning needed)
- Charts may occasionally duplicate (tracking logic could be improved)
- App name mismatch warnings (cosmetic, ADK quirk)

**Branch:** `feature/report-builder-clean`

---

## Future Improvements

1. **Better chart data flow** - Avoid CHART_REQUEST marker hack
2. **Edit sections** - Currently can only delete, not edit
3. **Rearrange sections** - Drag to reorder
4. **Export** - PDF, Word export
5. **Multi-page reports** - Pagination
6. **Template system** - Pre-built report templates

---

## Files Changed

- `backend/services/report_agent.py` - Complete rewrite (3+ iterations)
- `backend/api/v1/reports.py` - Clean API implementation
- `report_builder.html` - New simplified UI
- `backend/test_chart_issue.py` - Diagnostic script

---

*Session Date: February 10-11, 2026*
*Branch: feature/report-builder-clean*
