"""Report Agent v3 - Inverted Architecture.

Architecture:
  ReportAgent (parent)
    - Has: BuiltInCodeExecutor for analysis/charts
    - Has: DataAgent as sub-agent
    
  DataAgent (sub-agent as tool)
    - Has: get_artifacts() and get_artifact_data() tools
    - Returns data to parent for code execution
"""
import os
import json
import sqlite3
from pathlib import Path

from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from google.adk.code_executors import BuiltInCodeExecutor

# Database path
DB_PATH = Path(__file__).parent.parent.parent / "lunara.db"

# Service account for BigQuery
SERVICE_ACCOUNT_PATH = Path(__file__).parent.parent.parent.parent / "lunara-dev-094f5e9e682e.json"

if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    if SERVICE_ACCOUNT_PATH.exists():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_PATH)

os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "lunara-dev")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")


# =====================================================
# Data Tools for DataAgent
# =====================================================

def get_artifacts() -> str:
    """Get list of all available data artifacts.
    
    Returns:
        JSON string with list of artifacts containing id, title, and created_at.
    """
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, created_at FROM artifacts ORDER BY created_at DESC")
        rows = cursor.fetchall()
        conn.close()
        
        artifacts = [
            {"id": row[0], "title": row[1], "created_at": row[2]}
            for row in rows
        ]
        return json.dumps(artifacts, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


def get_artifact_data(artifact_id: str) -> str:
    """Get the data from a specific artifact.
    
    Args:
        artifact_id: The ID of the artifact to retrieve.
        
    Returns:
        JSON string with the artifact data (usually a list of records).
    """
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("SELECT title, data FROM artifacts WHERE id = ?", (artifact_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return json.dumps({"error": f"Artifact {artifact_id} not found"})
        
        title, data_json = row
        data = json.loads(data_json) if data_json else []
        
        return json.dumps({
            "title": title,
            "data": data,
            "row_count": len(data) if isinstance(data, list) else 0
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


# =====================================================
# DataAgent - Sub-agent with data fetching tools
# =====================================================

data_agent = LlmAgent(
    model="gemini-2.0-flash",  # Use stable model for sub-agent
    name="DataAgent",
    description="Fetches data artifacts when the parent agent needs data for analysis.",
    instruction="""You are a data assistant that helps retrieve artifact data.

When asked for data:
1. Use get_artifacts() to list available artifacts
2. Use get_artifact_data(artifact_id) to fetch specific artifact data
3. Return the data clearly formatted

Be concise - just return the requested data without extra commentary.""",
    tools=[
        FunctionTool(get_artifacts),
        FunctionTool(get_artifact_data),
    ],
)


# =====================================================
# ReportAgent - Parent with code executor
# Delegates to DataAgent for data access
# =====================================================

root_agent = LlmAgent(
    model="gemini-3-flash-preview",
    name="ReportAgent",
    description="Main report generation agent with data analysis and visualization capabilities.",
    instruction="""You are a helpful report building assistant for Lunara BI.

**How you work:**
1. When you need data, ask DataAgent to fetch it for you
2. Once you have data, write Python code to analyze and visualize it
3. Use matplotlib for charts, pandas for data analysis
4. Print key insights and statistics

**When creating charts:**
- Use plt.figure(figsize=(10, 6))
- Use professional colors (blues, teals)
- Add clear titles, labels, legends
- Call plt.show() to render

**Your style:**
- Be conversational, not robotic
- Do exactly what the user asks
- If they want "just a chart", give them just the chart
- Ask for clarification if needed

**Example workflow:**
User: "Create a bar chart of sales by category"
1. Ask DataAgent: "Get me the sales artifact data"
2. DataAgent returns the data
3. Write matplotlib code to create the bar chart
4. The chart renders automatically""",
    code_executor=BuiltInCodeExecutor(),
    sub_agents=[data_agent],
)
