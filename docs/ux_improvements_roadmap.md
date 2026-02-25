# UX Improvements Roadmap

## Progress

- [x] **429 Retry Handling** — exponential backoff on Gemini rate limits (backend)
- [x] **Resizable Chat Panel** — draggable divider on both Report Builder and Query Agent pages
- [x] **Remove localStorage Semantic Layer Fallback** — only load from Supabase per project
- [ ] **SQL Query Tabs** — "Run in Editor" buttons on chat code blocks
- [ ] **Inline Visualizations** — Chart.js toggle on SQL query results

---

Four features to make Lunara feel polished and production-ready.

---

## 1. Resizable Chat Panel

The chat panel is currently a fixed-width thin strip on the right side of the screen. Users should be able to drag it wider or narrower depending on whether they're focused on the chat or the main content.

### How It Works

A thin draggable divider bar sits between the main content area and the chat panel. The user drags it left/right to resize.

```
┌──────────────────────────────────┬─┬─────────────────┐
│                                  │▌│                  │
│         Main Content             │▌│   Chat Panel     │
│     (Report / SQL Editor)        │▌│                  │
│                                  │▌│  ← drag this     │
│                                  │▌│     divider       │
│                                  │▌│                  │
└──────────────────────────────────┴─┴─────────────────┘
```

### Implementation

Pure CSS + vanilla JS. No library needed.

```javascript
const divider = document.getElementById('panel-divider');
const mainPanel = document.getElementById('main-content');
const chatPanel = document.getElementById('chat-panel');

let isDragging = false;

divider.addEventListener('mousedown', () => isDragging = true);
document.addEventListener('mouseup', () => isDragging = false);

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const containerWidth = document.body.clientWidth;
    const chatWidth = containerWidth - e.clientX;
    const minWidth = 280;  // minimum chat panel width
    const maxWidth = containerWidth * 0.6;  // max 60% of screen

    if (chatWidth >= minWidth && chatWidth <= maxWidth) {
        chatPanel.style.width = `${chatWidth}px`;
        mainPanel.style.width = `calc(100% - ${chatWidth}px)`;
    }
});
```

```css
#panel-divider {
    width: 4px;
    cursor: col-resize;
    background: #e0e0e0;
    transition: background 0.2s;
}
#panel-divider:hover {
    background: #4a90d9;
}
```

### Applies To
- Report Builder page
- SQL Chat Agent page

### Effort: ~30 minutes

---

## 2. SQL Query Tabs with "Run in Editor"

When the chat agent outputs SQL queries, users currently have to manually copy-paste each query into the SQL editor. This should be one-click.

### User Flow

1. User asks: "Give me the top 10 artists and their revenue breakdown"
2. Agent responds with 3 SQL queries in markdown code blocks
3. Each code block has a **"Run in Editor ▶"** button
4. Clicking it opens the query in a new tab in the SQL editor panel
5. User can switch between tabs, run them independently

### What It Looks Like

```
┌─────────────────────────────────────────────────────┐
│ Tab 1: Top Artists │ Tab 2: Revenue │ Tab 3: Trends │ +
├─────────────────────────────────────────────────────┤
│                                                     │
│  SELECT artist_name, COUNT(*) as tracks             │
│  FROM spotify_tracks                                │
│  WHERE release_year >= 2020                         │
│  GROUP BY artist_name                               │
│  ORDER BY tracks DESC                               │
│  LIMIT 10;                                          │
│                                                     │
│                    [▶ Run Query]                     │
├─────────────────────────────────────────────────────┤
│  Results:                                           │
│  ┌────────────────┬────────┐                        │
│  │ artist_name    │ tracks │                        │
│  ├────────────────┼────────┤                        │
│  │ Taylor Swift   │ 145    │                        │
│  │ Drake          │ 132    │                        │
│  │ Bad Bunny      │ 98     │                        │
│  └────────────────┴────────┘                        │
└─────────────────────────────────────────────────────┘
```

### Implementation

#### Chat Code Block Button

Add a "Run in Editor" button to every SQL code block in the chat:

```javascript
// When rendering a code block in the chat with language=sql
function renderCodeBlock(code, language) {
    if (language === 'sql') {
        const runBtn = document.createElement('button');
        runBtn.textContent = '▶ Run in Editor';
        runBtn.onclick = () => openInEditorTab(code);
        codeBlock.appendChild(runBtn);
    }
}
```

#### Tab Management

```javascript
const editorTabs = [];

function openInEditorTab(sql, tabName = null) {
    const tab = {
        id: `tab-${Date.now()}`,
        name: tabName || `Query ${editorTabs.length + 1}`,
        sql: sql,
        results: null
    };
    editorTabs.push(tab);
    renderTabs();
    switchToTab(tab.id);
}

function switchToTab(tabId) {
    const tab = editorTabs.find(t => t.id === tabId);
    editor.value = tab.sql;
    resultsPanel.innerHTML = tab.results || '';
    // Update active tab styling
}
```

#### Auto-Naming Tabs

The agent can provide a name for each query. Add a convention where SQL code blocks in the chat include a comment header:

```sql
-- Top Artists by Track Count
SELECT artist_name, COUNT(*) as tracks ...
```

The frontend parses the first comment line as the tab name.

### Effort: ~2 hours

---

## 3. Inline Query Result Visualizations

After running a SQL query, users see results as a table. Add a toggle to visualize the same data as a chart — right there in the SQL editor, no page switching.

### User Flow

1. User runs a query → results table appears
2. User clicks **"📈 Chart"** toggle → table data renders as a chart
3. User can pick chart type: bar, line, pie
4. Toggle back to **"📊 Table"** anytime

### What It Looks Like

```
┌─────────────────────────────────────────────────────┐
│ Results                    [📊 Table] [📈 Chart]     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Chart Type: [Bar ▼]                                │
│                                                     │
│       145 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                        │
│       132 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                          │
│        98 ▓▓▓▓▓▓▓▓▓▓▓                               │
│        87 ▓▓▓▓▓▓▓▓▓                                 │
│        76 ▓▓▓▓▓▓▓▓                                  │
│           Taylor  Drake  Bad    BTS   Dua            │
│           Swift          Bunny        Lipa           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Technology: Chart.js

**Chart.js** is the ideal library for this:

- MIT license (fully free)
- CDN-ready, no build step: `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`
- Renders bar, line, pie, doughnut, scatter, and more
- Looks great out of the box with minimal config
- Works with vanilla JS

### Implementation

#### Add Chart.js to the Page

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

#### Auto-Detect Chart-Friendly Data

```javascript
function canVisualize(columns, rows) {
    // Need at least one text column (labels) and one numeric column (values)
    const textCols = columns.filter(c => typeof rows[0][c] === 'string');
    const numCols = columns.filter(c => typeof rows[0][c] === 'number');
    return textCols.length >= 1 && numCols.length >= 1;
}
```

#### Render Chart from Query Results

```javascript
function renderChart(columns, rows, chartType = 'bar') {
    // Pick first text column as labels, numeric columns as datasets
    const labelCol = columns.find(c => typeof rows[0][c] === 'string');
    const numCols = columns.filter(c => typeof rows[0][c] === 'number');

    const labels = rows.map(r => r[labelCol]);
    const datasets = numCols.map((col, i) => ({
        label: col,
        data: rows.map(r => r[col]),
        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
    }));

    new Chart(canvas, {
        type: chartType,
        data: { labels, datasets },
        options: {
            responsive: true,
            plugins: { legend: { display: numCols.length > 1 } }
        }
    });
}
```

#### Smart Chart Type Suggestions

```javascript
function suggestChartType(columns, rows) {
    const numCols = columns.filter(c => typeof rows[0][c] === 'number');
    const labelCol = columns.find(c => typeof rows[0][c] === 'string');

    // Date-like labels → line chart
    if (labelCol && rows[0][labelCol].match(/\d{4}/)) return 'line';
    // Single numeric column → bar chart
    if (numCols.length === 1) return 'bar';
    // Two numeric columns → scatter or grouped bar
    return 'bar';
}
```

### No Backend Changes Required

This is 100% frontend. The SQL query already returns structured JSON rows. We just render them differently.

### Effort: ~3 hours

## 4. Graceful 429 Rate Limit Handling

The Gemini API frequently returns `429 Too Many Requests` when we hit rate limits. Currently this surfaces as an error to the user, who has to resend their message. This should be handled silently in the backend with retry logic.

### The Problem

```
User sends message
  → Backend calls Gemini API
  → API returns 429 (rate limited)
  → Error propagates to frontend
  → User sees "Error: rate limited" or blank response
  → User has to resend the message manually
```

### The Fix

```
User sends message
  → Backend calls Gemini API
  → API returns 429
  → Backend waits 2 seconds, retries automatically
  → Still 429? Wait 4 seconds, retry again
  → Still 429? Wait 8 seconds, retry once more
  → Success → user gets their response, never knew there was a hiccup
```

### Implementation: Exponential Backoff Wrapper

A reusable retry decorator that wraps any Gemini API call:

```python
import asyncio
import logging
from google.api_core.exceptions import ResourceExhausted, TooManyRequests

logger = logging.getLogger(__name__)

async def retry_with_backoff(coro_func, *args, max_retries=3, base_delay=2.0, **kwargs):
    """
    Retry an async function with exponential backoff on 429 errors.
    
    - max_retries: how many times to retry (3 = up to 4 total attempts)
    - base_delay: initial wait in seconds (doubles each retry: 2s, 4s, 8s)
    """
    for attempt in range(max_retries + 1):
        try:
            return await coro_func(*args, **kwargs)
        except (ResourceExhausted, TooManyRequests) as e:
            if attempt == max_retries:
                logger.error(f"Rate limited after {max_retries + 1} attempts, giving up")
                raise
            delay = base_delay * (2 ** attempt)  # 2s, 4s, 8s
            logger.warning(f"Rate limited (429), retrying in {delay}s (attempt {attempt + 1})")
            await asyncio.sleep(delay)
```

### Where to Apply It

#### In the Report Agent (`report_agent.py`)

The Analyst and Reporter runners call the Gemini API. Wrap the `run_async` iteration:

```python
# Before (current):
async for event in analyst_runner.run_async(...):
    ...

# After (with retry):
# The runner handles retries internally if we configure it, OR
# we catch 429s at the event stream level and restart the run
```

Since ADK's `run_async` is a streaming generator, the simplest approach is to catch the 429 at the point where it raises and retry the entire run:

```python
for attempt in range(4):  # max 4 attempts
    try:
        async for event in analyst_runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=analyst_message,
        ):
            # process events as usual
            ...
        break  # success, exit retry loop
    except (ResourceExhausted, TooManyRequests):
        if attempt == 3:
            yield {"type": "error", "content": "The service is busy. Please try again in a moment."}
            return
        delay = 2 * (2 ** attempt)
        logger.warning(f"Rate limited, retrying in {delay}s")
        await asyncio.sleep(delay)
```

#### In the Chat Agent (`main.py` or wherever the chat SSE endpoint lives)

Same pattern — wrap the LLM call with retry logic.

### Frontend: Optional Loading Indicator

While the backend is silently retrying, the user just sees the normal "thinking" spinner. Optionally, if a retry takes longer than 5 seconds, show a subtle message:

```javascript
// After 5 seconds of no response
setTimeout(() => {
    if (!responseReceived) {
        showStatus("Still working on it…");
    }
}, 5000);
```

This keeps the user informed without alarming them. They never see "429" or "rate limited."

### Key Details

- **Exponential backoff**: 2s → 4s → 8s. Avoids hammering the API while it's overloaded.
- **Max 3 retries**: if it's still failing after ~14 seconds of retries, surface a friendly error ("The service is busy, please try again in a moment").
- **Silent to the user**: no error messages, no "retry" buttons. Just a slightly longer wait.
- **Logging**: all retries are logged server-side for monitoring.

### Effort: ~1 hour (backend only)

---

## Priority & Implementation Order

| # | Feature | Backend | Frontend | Effort |
|---|---------|---------|----------|--------|
| 1 | Resizable Chat Panel | No | Yes | ~30 min |
| 2 | SQL Query Tabs | No | Yes | ~2 hours |
| 3 | Inline Visualizations | No | Yes | ~3 hours |
| 4 | 429 Retry Handling | Yes | Minimal | ~1 hour |

- Features 1–3 are pure frontend. Feature 4 is pure backend.
- All four are independent and can be tackled in any order.
- **Recommended order:** #4 first (users hit this every day), then #1 (quick win), then #3 (biggest delight), then #2.
