"""Test Report Generation - Gemini 3.0 Flash Preview
Creates one cohesive HTML report with embedded charts using Gemini Code Execution.
"""
import os
import json
import sqlite3
import tempfile
import traceback
from pathlib import Path
from datetime import datetime

from google.genai import Client, types
from google.oauth2 import service_account

# Paths
BACKEND_DIR = Path(__file__).parent
PROJECT_ROOT = BACKEND_DIR.parent
DB_PATH = BACKEND_DIR / "lunara.db"
OUTPUT_DIR = BACKEND_DIR / "generated_reports"
OUTPUT_DIR.mkdir(exist_ok=True)
CREDENTIALS_PATH = PROJECT_ROOT / "lunara-dev-094f5e9e682e.json"

def get_artifacts_from_db():
    """Get all artifacts from the database."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, data FROM artifacts ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    return [
        {"id": row[0], "title": row[1], "data": json.loads(row[2]) if row[2] else []}
        for row in rows
    ]

def create_csv_from_artifact(artifact):
    """Convert artifact data to CSV format."""
    data = artifact.get("data", [])
    if not data or not isinstance(data[0], dict):
        return ""
    
    headers = list(data[0].keys())
    lines = [",".join(headers)]
    
    for row in data:
        values = [str(row.get(h, "")).replace(",", ";").replace("\n", " ") for h in headers]
        lines.append(",".join(values))
    
    return "\n".join(lines)

def extract_html(text):
    """Helper to extract HTML from text."""
    import re
    match = re.search(r'```html\s*(.*?)```', text, re.DOTALL)
    if match:
        return match.group(1)
    
    start_marker = "<!DOCTYPE html>"
    end_marker = "</html>"
    start = text.find(start_marker)
    end = text.find(end_marker)
    
    if start != -1 and end != -1:
        return text[start : end + len(end_marker)]
    return None

def generate_report():
    """Generate an HTML report using Gemini 3.0 Flash with code execution."""
    print("=" * 70)
    print("HTML REPORT GENERATOR - GEMINI 3.0 FLASH CODE EXECUTION")
    
    # Authenticate
    if not CREDENTIALS_PATH.exists():
        print(f"Error: Credentials file not found at {CREDENTIALS_PATH}")
        return

    print(f"Loading credentials from {CREDENTIALS_PATH.name}...")
    # Add scopes for Vertex AI
    creds = service_account.Credentials.from_service_account_file(
        str(CREDENTIALS_PATH),
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    client = Client(vertexai=True, project="lunara-dev", location="us-central1", credentials=creds)

    # Create output folder
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = OUTPUT_DIR / f"report_gemini_{timestamp}"
    report_dir.mkdir(exist_ok=True)
    print(f"Output folder: {report_dir}")
    print("=" * 70)
    
    # Step 1: Prepare data
    print("\n📤 STEP 1: Preparing data...")
    artifacts = get_artifacts_from_db()
    data_context = ""
    
    for artifact in artifacts:
        csv_content = create_csv_from_artifact(artifact)
        if not csv_content:
            continue
        
        # Add to prompt context
        safe_title = artifact['title'].replace(" ", "_").replace("'", "").lower() + ".csv"
        data_context += f"\n\n--- FILE: {safe_title} ---\n{csv_content}\n--------------------------\n"
        print(f"   ✓ Prepared data for {safe_title}")

    # Step 2: Build the request
    print("\n📝 STEP 2: Sending request to Gemini...")
    
    prompt = f"""Analyze the provided data and create a SINGLE self-contained HTML report.
You have access to Python code execution.

DATA FILES:
I am providing the data files content below. 
First, use python code to WRITE these files to disk so you can read them with pandas.
{data_context}

YOUR TASK:
1. Write the above data to CSV files on disk.
2. Load the data using pandas.
3. Perform analysis and calculate key metrics.
4. Generate 2-3 visualizations using matplotlib or seaborn.
5. Create ONE HTML file called "report.html".
6. IMPORTANT: The charts must be embedded as base64 images in the HTML.
7. The HTML should be professional, responsive.

CRITICAL FINAL STEP:
Read the "report.html" file you created and PRINT its FULL content to stdout using `print()`.
Do NOT wrap the output in markdown code blocks in the stdout. Just print the raw HTML.
"""

    # Step 3: Call Gemini
    print("\n🤖 STEP 3: Gemini is generating the report...")
    
    try:
        response = client.models.generate_content(
            model="publishers/google/models/gemini-3-flash-preview",
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(code_execution=types.ToolCodeExecution())],
                max_output_tokens=8192,
                temperature=0.2
            )
        )
        
        print("\n--- Response received ---")
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.text:
                    print(f"[Text Response] {part.text[:200]}...")
                
        # Step 4: Extract/Save report.html
        html_content = ""
        found_html = False
        
        # Only look in code execution results
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.code_execution_result and part.code_execution_result.output:
                    output = part.code_execution_result.output
                    # Try to find HTML in the stdout
                    if "<!DOCTYPE html>" in output:
                        start = output.find("<!DOCTYPE html>")
                        end = output.find("</html>")
                        if end != -1:
                            html_content = output[start : end + 7]
                            found_html = True
                            print("\n✅ Found HTML in code execution output!")
                            break
        
        if not found_html and response.text:
            extracted = extract_html(response.text)
            if extracted:
                html_content = extracted
                found_html = True
                print("   (Found HTML in text response. This might be source code, but saving it as fallback.)")
        
        if found_html:
            report_path = report_dir / "report.html"
            with open(report_path, "w") as f:
                f.write(html_content)
            print(f"\n✅ Saved extracted report to: {report_path}")
        else:
            print("\n⚠️ No HTML code block found in output.") 
 
            # It might have created it in the sandbox but we can't get it out easily without specific tool support
            # or printing it.
            
    except Exception as e:
        print(f"\nError details: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    generate_report()
