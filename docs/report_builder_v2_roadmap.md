# Report Builder V2 Roadmap

## What Is the AgentEngineSandboxCodeExecutor?

The `AgentEngineSandboxCodeExecutor` is a tool within Google's ADK that executes AI-generated Python code in an isolated, managed sandbox hosted on Vertex AI. Instead of running code on our server (security risk) or through Gemini's built-in executor (opaque, unreliable artifact naming), code runs in a real Python environment with:

- **Real filesystem** — `plt.savefig("revenue.png")` saves a file called `revenue.png`
- **Full library support** — matplotlib, pandas, numpy pre-installed
- **Process isolation** — code can't access our server, credentials, or other users' data
- **Fast startup** — sandboxes spin up in under one second

## How It Works Today

```
User sends message
  → generate_content() called
    → Fresh sandbox created (via agent_engine_resource_name)
    → Analyst runs code block 1 (import, load data, chart 1)
    → Analyst runs code block 2 (chart 2 — data still in memory)
    → Analyst runs code block 3 (chart 3 — data still in memory)
    → Sandbox destroyed
  → Reporter formats findings into HTML
  → Report rendered
```

**Within a single turn**, all code blocks share the same sandbox — variables, imports, and data persist. But **across turns**, a fresh sandbox is created each time. Every new message from the user starts from zero.

## What Persistence Unlocks

With a persistent sandbox tied to the user's report session, the agent could maintain state across multiple messages:

### Multi-Turn Data Exploration
```
Turn 1: "Load my data and show me a summary"
  → Agent imports pandas, builds DataFrame, prints summary
  
Turn 2: "Filter to just the top 10 by revenue"
  → DataFrame is still in memory — agent just filters, no reload
  
Turn 3: "Chart those top 10"
  → Agent plots from the filtered DataFrame — instant

Turn 4: "Make the bars darker blue and add labels"
  → Agent tweaks the existing plot — iterative refinement
```

Without persistence, turns 2–4 would each re-import all libraries, re-parse the JSON artifacts, and re-build the DataFrame from scratch. With large datasets (up to 100MB supported), this is significant.

### Iterative Chart Refinement

Users could ask the agent to tweak charts without regenerating everything:

- "Change the color scheme to match our brand"
- "Add a trend line to the revenue chart"
- "Remove the grid lines"

Each request builds on the previous state rather than starting over.

### Derived Data Carries Forward

Complex multi-step analysis becomes natural:

```
Turn 1: "Calculate month-over-month growth rates"
  → Agent computes derived columns

Turn 2: "Now correlate growth with user signups"
  → Derived data is still available — no recalculation
```

## Why We Should Implement This

| Aspect | Current (Fresh Sandbox) | With Persistence |
|--------|------------------------|-----------------|
| Data reload | Every turn re-parses JSON artifacts | Once per session |
| Library imports | Every turn re-imports matplotlib/pandas | Once per session |
| Chart refinement | Regenerate from scratch | Modify in place |
| User experience | Each message is independent | Feels like a conversation |
| Latency | ~5-10s data prep overhead per turn | Near-instant for follow-ups |
| Cost | New sandbox per turn | One sandbox reused |

## How to Implement It

### Architecture Change

Instead of `agent_engine_resource_name` (auto-creates + destroys sandboxes), we'd dynamically create sandboxes and store their resource names in the user's report session.

### Step 1: Create Sandbox on Session Start

When a user opens a report or sends their first message, create a dedicated sandbox:

```python
# In generate_content(), at the start of a new report session
import vertexai

client = vertexai.Client(project=PROJECT_ID, location=LOCATION)
operation = client.agent_engines.sandboxes.create(
    spec={"code_execution_environment": {}},
    name=AGENT_ENGINE_RESOURCE_NAME,
    config=types.CreateAgentEngineSandboxConfig(
        display_name=f"report_{self.report_id}",
        ttl="3600s",  # 1 hour idle timeout
    ),
)
sandbox_name = operation.response.name
```

### Step 2: Store Sandbox Name in Session

Save the sandbox resource name so subsequent messages reuse it:

```python
# Store in the ADK session state
session = await session_service.create_session(
    app_name=app_name,
    user_id=user_id,
    state={"sandbox_resource_name": sandbox_name},
)
```

### Step 3: Reuse Sandbox for Subsequent Messages

On each message, check if a sandbox already exists for this report session:

```python
existing_sandbox = cur_session.state.get("sandbox_resource_name")

if existing_sandbox:
    # Reuse the existing sandbox
    code_executor = AgentEngineSandboxCodeExecutor(
        sandbox_resource_name=existing_sandbox,
    )
else:
    # First message — create a new sandbox
    sandbox_name = create_sandbox(...)
    code_executor = AgentEngineSandboxCodeExecutor(
        sandbox_resource_name=sandbox_name,
    )
```

> **Note:** This requires creating the `LlmAgent` dynamically per request instead of using a module-level singleton, since the `code_executor` parameter changes per session.

### Step 4: Cleanup

Sandboxes auto-delete after the TTL expires (1 hour of inactivity). For explicit cleanup when a user closes a report:

```python
client.agent_engines.sandboxes.delete(name=sandbox_name)
```

### Key Considerations

1. **Agent must be dynamic** — currently `_ANALYST_AGENT` is a module-level singleton. With persistence, we'd create it per-request with the right `sandbox_resource_name`. This is a minor refactor.

2. **TTL management** — each `execute_code` call resets the TTL, so active sessions stay alive. Idle sessions auto-cleanup.

3. **Sandbox limits** — 100MB file storage per sandbox, which is plenty for data analysis.

4. **Artifact storage** — generated charts are stored as ADK artifacts (in GCS) for up to 14 days, independent of sandbox lifecycle.

5. **Python version** — requires Python 3.10+ (we upgraded to 3.12).

## Selective Report Editing

Persistence enables a second major feature: **editing parts of a report without regenerating the whole thing**.

### The Problem Today

```
User: "Make the revenue chart use a dark theme"
→ Fresh sandbox — no memory of original chart code
→ Agent regenerates ALL charts + rewrites entire report
→ Full pipeline runs again (~30 seconds)
```

### How Selective Editing Works

With persistence, the agent can modify just the affected piece:

```
User: "Make the revenue chart use a dark theme"
→ Same sandbox — original code + data still in memory
→ Agent re-runs only revenue_bar.png with new styling
→ Backend sends a "patch" to the frontend with just the new chart
→ Frontend swaps that one image — everything else untouched
```

### Backend: Patch Events

The report is already structured as a `DynamicReport` JSON with separate sections and a chart array. Instead of re-sending the entire report, the backend sends targeted patch events:

```python
# Chart update — replace one chart image
yield {
    "type": "chart_update",
    "chart_index": 0,
    "b64": new_chart_base64,
    "caption": "Revenue by month (dark theme)"
}

# Section update — rewrite one text section
yield {
    "type": "section_update",
    "section_index": 1,
    "heading": "Revenue Analysis",
    "html": "<p>Updated analysis text...</p>"
}
```

### Frontend: DOM Swaps

The frontend handles patches with simple DOM operations — no special library needed:

```javascript
function handlePatch(patch) {
    if (patch.type === "chart_update") {
        // Swap just one chart image
        const chartImg = document.querySelector(`#chart-${patch.chart_index} img`);
        chartImg.src = `data:image/png;base64,${patch.b64}`;
    }
    
    if (patch.type === "section_update") {
        // Rewrite just one section
        const section = document.querySelector(`#section-${patch.section_index}`);
        section.querySelector("h2").textContent = patch.heading;
        section.querySelector(".content").innerHTML = patch.html;
    }
}
```

### Agent Instructions for Selective Editing

The Analyst needs to know the current report state so it can identify what to change:

```python
# Include the existing report structure in the prompt
analyst_prompt = f"""
The user has an existing report with the following structure:
{json.dumps(current_report_sections)}

Charts currently in the report:
{json.dumps(current_chart_filenames)}

The user wants to: "{user_message}"

If this is a MODIFICATION to the existing report:
- Identify which section(s) or chart(s) need updating
- Only regenerate the affected chart(s)
- Return the updated content with the same filenames

If this is a NEW report request:
- Generate everything from scratch as usual
"""
```

### How the Backend Decides: Full Report vs. Patch

```python
# After the Analyst runs, check what was generated
if is_first_report or not existing_report:
    # No existing report — full generation pipeline
    run_reporter(...)
    yield {"type": "report", "html": full_html}
else:
    # Existing report — compare what changed
    updated_charts = [
        fn for fn in artifact_version_map
        if fn in existing_chart_filenames
        and not fn.startswith("code_execution_image_")
    ]
    
    for chart_filename in updated_charts:
        chart_idx = existing_chart_filenames.index(chart_filename)
        new_b64 = await load_png_as_base64(chart_filename)
        yield {"type": "chart_update", "chart_index": chart_idx, "b64": new_b64}
```

### Implementation Dependencies

Selective editing requires these features to be in place first:

1. **Sandbox persistence** — so the agent can modify existing charts without re-importing data
2. **Report state storage** — the current report structure must be stored in the session so the agent knows what exists
3. **ADK session persistence** — message history must carry across turns so the agent has context
4. **Frontend patch handler** — the frontend needs to listen for `chart_update` and `section_update` events

## Editable Report Canvas

The third feature: turn the rendered report into a **fully editable document**, like Google Docs or Word. Users can click anywhere, edit text, resize charts, rearrange content — all without leaving the page.

### What It Looks Like

```
┌─────────────────────────────────────────────────────┐
│ B  I  U  │ H1 H2 H3 │ • ─ │ ⬅ ➡ ⬆ │ 🖼️  📊  │ ↩️  ↪️  │  ← toolbar ribbon
├─────────────────────────────────────────────────────┤
│                                                     │
│  Sonic Shifts: Analyzing Global Music Trends        │  ← fully editable
│                                                     │
│  The data reveals a clear shift toward shorter...   │  ← click anywhere to type
│                                                     │
│  ┌──────────────────────────────────┐               │
│  │     📊 Revenue Chart             │               │  ← resize handles on corners
│  │     [chart image]                │               │
│  └──────────────────────────────────┘               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Technology: Quill.js

Our frontend is vanilla HTML/CSS/JS, so we need a framework-agnostic editor. **Quill.js** is the best fit:

- **MIT license** — fully free, no licensing headaches for a startup
- **CDN-ready** — three lines to add, no build step
- **Snow theme** — comes with a Word-like toolbar ribbon out of the box
- **Rich formatting** — bold, italic, headings, alignment, lists, links
- **Image support** — embed, delete, and (with plugin) resize chart images

| Editor | License | Image drag/resize | Vanilla JS | Notes |
|--------|---------|-------------------|------------|-------|
| **Quill.js** | MIT (free) | ✅ via plugin | ✅ | Best for MVP |
| CKEditor 5 | GPL (free) / paid commercial | ✅ built-in | ✅ | Upgrade path if Quill feels limiting |
| Editor.js | Apache 2.0 (free) | ✅ block-based | ✅ | Notion-style, different UX |

### Implementation

#### Step 1: Add Quill to the Report Builder Page

```html
<!-- In report_builder.html -->
<link href="https://cdn.quilljs.com/1.3.7/quill.snow.css" rel="stylesheet">
<script src="https://cdn.quilljs.com/1.3.7/quill.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/quill-image-resize-module@3.0.0/image-resize.min.js"></script>
```

#### Step 2: Replace the Report Container with a Quill Editor

```javascript
// Initialize the editor on the report container
const editor = new Quill('#report-container', {
    theme: 'snow',
    modules: {
        toolbar: [
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'header': [1, 2, 3, false] }],
            [{ 'align': [] }],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            ['image', 'link', 'clean']
        ],
        imageResize: {}  // enables resize handles on images
    }
});
```

#### Step 3: Load Agent-Generated Report into the Editor

```javascript
// When the agent generates a report, load it as initial content
function loadReport(htmlContent) {
    editor.root.innerHTML = htmlContent;
}
```

#### Step 4: Save User Edits

```javascript
// Get the edited HTML when user clicks "Save"
function saveReport() {
    const editedHTML = editor.root.innerHTML;
    // POST to backend or store in Supabase
    fetch(`/api/reports/${reportId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: editedHTML })
    });
}
```

### How It Connects to Other Features

- **Without persistence**: agent generates report → user edits in Quill → user saves. One-shot editing only.
- **With persistence**: user edits in Quill AND asks the agent for changes → agent patches specific parts → Quill updates live.
- **With selective editing**: agent can update individual sections/charts inside the Quill editor without touching the user's manual edits elsewhere.

### Considerations

1. **Chart images in Quill** — charts are embedded as `<img>` tags with base64 data URIs. Quill handles these natively. The `image-resize` plugin adds drag handles.

2. **Two editing modes** — the user can edit manually (typing in Quill) OR ask the agent to edit (via the chat). Both modify the same document.

3. **Conflict resolution** — if the user has manually edited a section and then asks the agent to regenerate, the agent's output overwrites their edits in that section. We should warn the user before this happens.

4. **Export** — Quill's HTML output can be converted to PDF (via a library like `html2pdf.js`) or downloaded as HTML. This is a natural follow-on feature.

---

## Priority & Implementation Order

| # | Feature | Depends On | Effort |
|---|---------|-----------|--------|
| 1 | **Sandbox Persistence** | Nothing — standalone | ~2 hours |
| 2 | **Editable Report Canvas** | Nothing — standalone | ~3 hours |
| 3 | **Selective Report Editing** | Sandbox Persistence | ~4 hours |

- **Sandbox Persistence** and **Editable Report Canvas** can be built in parallel — they're independent.
- **Selective Report Editing** requires persistence first, then layers the patch system on top.
- The current implementation (fresh sandbox per turn, full report regeneration, non-editable canvas) works correctly and ships today.
