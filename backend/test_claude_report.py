"""Test Report Generation with Claude API + Code Execution

Uses Claude's built-in code execution tool to analyze artifacts and generate charts.
"""
import os
import json
import sqlite3
import base64
from pathlib import Path
from datetime import datetime

import anthropic

# Database path
DB_PATH = Path(__file__).parent / "lunara.db"

# Output directory for saved reports
OUTPUT_DIR = Path(__file__).parent / "generated_reports"
OUTPUT_DIR.mkdir(exist_ok=True)

# API key - set via environment variable
# export ANTHROPIC_API_KEY="your-key-here"


def get_artifacts():
    """Get all available artifacts from the database."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, created_at FROM artifacts ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    return [
        {"id": row[0], "title": row[1], "created_at": row[2]}
        for row in rows
    ]


def get_artifact_data(artifact_id: str):
    """Get artifact data by ID."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    cursor.execute("SELECT title, data FROM artifacts WHERE id = ?", (artifact_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return {"error": f"Artifact {artifact_id} not found"}
    
    title, data_json = row
    data = json.loads(data_json) if data_json else []
    
    return {
        "title": title,
        "data": data,
        "row_count": len(data) if isinstance(data, list) else 0
    }


def process_tool_call(tool_name: str, tool_input: dict):
    """Process tool calls from Claude."""
    if tool_name == "get_artifacts":
        return json.dumps(get_artifacts(), indent=2)
    elif tool_name == "get_artifact_data":
        return json.dumps(get_artifact_data(tool_input.get("artifact_id", "")), indent=2)
    else:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})


def generate_report():
    """Generate a report using Claude with code execution."""
    client = anthropic.Anthropic()
    
    # Define our custom tools + code execution tool
    tools = [
        # Code execution tool (required for running Python/Bash)
        {
            "type": "code_execution_20250825",
            "name": "code_execution"
        },
        # Custom data tools
        {
            "name": "get_artifacts",
            "description": "Get a list of all available data artifacts. Returns artifact IDs, titles, and creation dates.",
            "input_schema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        },
        {
            "name": "get_artifact_data",
            "description": "Get the full data from a specific artifact by ID. Returns the artifact title and data array.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "artifact_id": {
                        "type": "string",
                        "description": "The ID of the artifact to retrieve"
                    }
                },
                "required": ["artifact_id"]
            }
        }
    ]
    
    # System prompt
    system = """You are a business intelligence assistant that creates insightful reports.

When asked to create a report:
1. First, use get_artifacts to see what data is available
2. Use get_artifact_data to fetch the data you need
3. Use the code execution tool to analyze the data with pandas and create visualizations with matplotlib
4. Provide clear insights and recommendations

For charts:
- Use seaborn with professional styling
- Add clear titles, labels, and legends
- Use a clean color palette (blues, teals work well)
- Always call plt.show() to render the chart"""

    # Initial request
    prompt = """Create a comprehensive business insights report using all available data artifacts.

Include:
1. Overview of available data
2. Key metrics and statistics from each dataset
3. At least 2 visualizations (bar chart and pie chart)
4. Key insights and recommendations

Start by getting all available artifacts."""

    # Create timestamped output folder
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = OUTPUT_DIR / f"report_{timestamp}"
    report_dir.mkdir(exist_ok=True)
    
    print("=" * 70)
    print("CLAUDE REPORT GENERATION TEST")
    print(f"Output folder: {report_dir}")
    print("=" * 70)
    print(f"\n📝 PROMPT:\n{prompt}\n")
    print("-" * 70)
    
    messages = [{"role": "user", "content": prompt}]
    
    # Track generated content
    report_text = []
    chart_count = 0
    
    # Agentic loop - keep going until Claude is done
    while True:
        print("\n🤖 Calling Claude...")
        
        response = client.beta.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=16384,
            betas=["code-execution-2025-08-25"],
            system=system,
            tools=tools,
            messages=messages
        )
        
        print(f"   Stop reason: {response.stop_reason}")
        
        # Process response content
        assistant_content = []
        tool_results = []
        
        for block in response.content:
            if block.type == "text":
                print(f"\n📄 TEXT:\n{block.text}")
                report_text.append(block.text)
                assistant_content.append(block)
            
            elif block.type == "tool_use":
                print(f"\n🔧 TOOL CALL: {block.name}")
                print(f"   Input: {json.dumps(block.input, indent=2)[:200]}")
                
                # Execute the tool
                result = process_tool_call(block.name, block.input)
                print(f"   Result: {result[:200]}...")
                
                assistant_content.append(block)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result
                })
            
            elif block.type == "code_execution_tool_use":
                print(f"\n💻 CODE EXECUTION:")
                if hasattr(block, 'input') and block.input:
                    code = block.input.get('code', '')
                    print(f"```python\n{code[:500]}{'...' if len(code) > 500 else ''}\n```")
                assistant_content.append(block)
            
            elif block.type == "code_execution_tool_result":
                print(f"\n📊 CODE RESULT:")
                if hasattr(block, 'content'):
                    for item in block.content:
                        if hasattr(item, 'type'):
                            if item.type == "text":
                                print(f"   Output: {item.text[:300]}...")
                                report_text.append(f"```\n{item.text}\n```")
                            elif item.type == "image":
                                # Save the image!
                                chart_count += 1
                                media_type = item.source.get('media_type', 'image/png')
                                ext = 'png' if 'png' in media_type else 'jpg'
                                chart_path = report_dir / f"chart_{chart_count}.{ext}"
                                
                                # Decode and save
                                img_data = base64.b64decode(item.source.get('data', ''))
                                with open(chart_path, 'wb') as f:
                                    f.write(img_data)
                                
                                print(f"   📈 Chart saved: {chart_path}")
                                report_text.append(f"\n![Chart {chart_count}](chart_{chart_count}.{ext})\n")
                assistant_content.append(block)
        
        # Add assistant message
        messages.append({"role": "assistant", "content": response.content})
        
        # If there were tool calls, add the results and continue
        if tool_results:
            messages.append({"role": "user", "content": tool_results})
        
        # Check if we're done
        if response.stop_reason == "end_turn":
            print("\n✅ Report generation complete!")
            break
        elif response.stop_reason not in ["tool_use"]:
            print(f"\n⚠️ Unexpected stop reason: {response.stop_reason}")
            break
    
    # Save the full report text
    report_path = report_dir / "report.md"
    with open(report_path, 'w') as f:
        f.write("\n\n".join(report_text))
    
    print("\n" + "=" * 70)
    print("REPORT SAVED!")
    print(f"📁 Folder: {report_dir}")
    print(f"📄 Report: {report_path}")
    print(f"📊 Charts: {chart_count} images saved")
    print("=" * 70)


if __name__ == "__main__":
    generate_report()

