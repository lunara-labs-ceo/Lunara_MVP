"""Test Report Generation - Single HTML Output

Creates one cohesive HTML report with embedded charts.
Uses Files API + Code Execution + Haiku 4.5.
"""
import os
import json
import sqlite3
import tempfile
from pathlib import Path
from datetime import datetime

import anthropic

# Database path
DB_PATH = Path(__file__).parent / "lunara.db"

# Output directory
OUTPUT_DIR = Path(__file__).parent / "generated_reports"
OUTPUT_DIR.mkdir(exist_ok=True)


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


def generate_report():
    """Generate an HTML report using Claude with code execution."""
    client = anthropic.Anthropic()
    
    # Create output folder
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = OUTPUT_DIR / f"report_{timestamp}"
    report_dir.mkdir(exist_ok=True)
    
    print("=" * 70)
    print("HTML REPORT GENERATOR - FILES API + HAIKU")
    print(f"Output folder: {report_dir}")
    print("=" * 70)
    
    # Step 1: Upload artifact data as files
    print("\n📤 STEP 1: Uploading data files...")
    artifacts = get_artifacts_from_db()
    uploaded_files = []
    
    for artifact in artifacts:
        csv_content = create_csv_from_artifact(artifact)
        if not csv_content:
            continue
            
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write(csv_content)
            temp_path = f.name
        
        try:
            with open(temp_path, 'rb') as f:
                file_response = client.beta.files.upload(file=f)
            
            uploaded_files.append({
                "file_id": file_response.id,
                "title": artifact["title"]
            })
            print(f"   ✓ {artifact['title']} → {file_response.id}")
        finally:
            os.unlink(temp_path)
    
    # Step 2: Build the request
    print("\n📝 STEP 2: Sending request to Claude...")
    
    file_descriptions = "\n".join([f"- {f['title']}" for f in uploaded_files])
    
    # Very specific instructions
    prompt = f"""Analyze the uploaded CSV data files and create a SINGLE self-contained HTML report.

UPLOADED DATA FILES:
{file_descriptions}

YOUR TASK:
1. Read each CSV file using pandas
2. Calculate key metrics and statistics
3. Create 2-3 visualizations using matplotlib/seaborn
4. Generate ONE HTML file called "report.html" that includes:
   - Professional styling (use embedded CSS)
   - Executive summary with key metrics
   - Analysis of each dataset
   - Charts embedded as base64 images (use plt.savefig to BytesIO, then base64 encode)
   - Key insights and recommendations

IMPORTANT REQUIREMENTS:
- Output ONLY ONE file: report.html
- Embed all charts as base64 data URIs in <img> tags
- Use a clean, professional design with a light background
- Include a header with the report title and date
- Make it mobile-responsive

Save the final report as: report.html"""

    content = [{"type": "text", "text": prompt}]
    
    # Add container_upload for each data file
    for file_info in uploaded_files:
        content.append({
            "type": "container_upload",
            "file_id": file_info["file_id"]
        })
    
    system = """You are a senior data analyst creating executive reports.
Your output should be ONE professional HTML file with embedded charts.
Use base64-encoded images for charts so the HTML is self-contained.
Write clean, well-structured code. Execute it step by step."""

    # Step 3: Call Claude
    print("\n🤖 STEP 3: Claude is generating the report...")
    
    response = client.beta.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=16384,
        betas=["code-execution-2025-08-25", "files-api-2025-04-14"],
        system=system,
        tools=[{
            "type": "code_execution_20250825",
            "name": "code_execution"
        }],
        messages=[{"role": "user", "content": content}]
    )
    
    print(f"   Stop reason: {response.stop_reason}")
    
    # Collect text output
    for block in response.content:
        if block.type == "text":
            print(f"\n📄 {block.text[:300]}...")
    
    # Step 4: Find and download the report.html
    print("\n� STEP 4: Downloading report.html...")
    
    # List all files to find report.html
    try:
        all_files = client.beta.files.list()
        report_file_id = None
        
        for f in all_files.data:
            print(f"   Found: {f.filename} (downloadable={f.downloadable})")
            if f.downloadable and 'report' in f.filename.lower() and f.filename.endswith('.html'):
                report_file_id = f.id
                break
        
        if report_file_id:
            file_content = client.beta.files.download(report_file_id)
            output_path = report_dir / "report.html"
            file_content.write_to_file(str(output_path))
            print(f"\n   ✅ Downloaded: {output_path}")
            
            # Also download any other generated files
            for f in all_files.data:
                if f.downloadable and f.id != report_file_id:
                    try:
                        fc = client.beta.files.download(f.id)
                        fc.write_to_file(str(report_dir / f.filename))
                        print(f"   ✓ Also downloaded: {f.filename}")
                    except:
                        pass
        else:
            print("   ⚠️ report.html not found in generated files")
            
    except Exception as e:
        print(f"   ✗ Error: {e}")
    
    # Step 5: Cleanup uploaded files
    print("\n🧹 STEP 5: Cleaning up...")
    for file_info in uploaded_files:
        try:
            client.beta.files.delete(file_info["file_id"])
        except:
            pass
    
    print("\n" + "=" * 70)
    print("DONE!")
    print(f"📁 Output: {report_dir}")
    print("=" * 70)
    
    # Token usage
    if hasattr(response, 'usage'):
        print(f"\n💰 Tokens: {response.usage.input_tokens} in / {response.usage.output_tokens} out")


if __name__ == "__main__":
    generate_report()
