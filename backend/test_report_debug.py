"""
Comprehensive test for Report Agent chart generation.
Logs ALL raw output from the agent to debug missing charts.
"""
import asyncio
import json
import os
from pathlib import Path

# Set up environment before imports
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "lunara-dev")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")

SERVICE_ACCOUNT_PATH = Path(__file__).parent.parent / "lunara-dev-094f5e9e682e.json"
if SERVICE_ACCOUNT_PATH.exists():
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_PATH)

from services.report_agent import ReportAgentService


async def test_chart_generation():
    """Test the report agent and log everything."""
    
    print("=" * 80)
    print("REPORT AGENT CHART GENERATION DEBUG TEST")
    print("=" * 80)
    
    # Create service
    report_service = ReportAgentService()
    await report_service.initialize(user_id="test_user")
    
    # Simple prompt that should generate a chart
    prompt = """
    Create a simple bar chart showing fake sales data.
    Generate sample data: Q1=100, Q2=150, Q3=130, Q4=200.
    Create the chart and add it to the report.
    """
    
    print(f"\n📤 PROMPT:\n{prompt}\n")
    print("=" * 80)
    print("🔄 STREAMING EVENTS:")
    print("=" * 80)
    
    event_count = 0
    text_chunks = []
    code_blocks = []
    images_inline = []
    images_from_artifacts = []
    blocks_received = []
    other_events = []
    
    async for event in report_service.generate(prompt):
        event_count += 1
        event_type = event.get("type", "unknown")
        
        print(f"\n--- Event #{event_count} (type: {event_type}) ---")
        
        # Log the RAW event
        print(f"RAW EVENT: {json.dumps(event, indent=2, default=str)[:1000]}")
        
        if event_type == "text":
            text_chunks.append(event.get("content", ""))
            print(f"  Content preview: {event.get('content', '')[:200]}...")
            
        elif event_type == "code":
            code_blocks.append(event.get("content", ""))
            print(f"  Code:\n{event.get('content', '')[:500]}...")
            
        elif event_type == "code_result":
            print(f"  Output: {event.get('output', '')[:500]}")
            print(f"  Outcome: {event.get('outcome', '')}")
            
        elif event_type == "image":
            mime = event.get("mime_type", "unknown")
            data = event.get("data", "")
            filename = event.get("filename", "N/A")
            print(f"  ✅ IMAGE RECEIVED!")
            print(f"     MIME: {mime}")
            print(f"     Filename: {filename}")
            print(f"     Data length: {len(data)} chars")
            print(f"     Data preview: {data[:100]}...")
            
            if filename != "N/A":
                images_from_artifacts.append(event)
            else:
                images_inline.append(event)
                
        elif event_type == "block":
            block = event.get("block", {})
            blocks_received.append(block)
            print(f"  Block ID: {block.get('id')}")
            print(f"  Block Type: {block.get('type')}")
            print(f"  Block Title: {block.get('title')}")
            if block.get('type') == 'chart':
                content = block.get('content', '')
                print(f"  Chart content length: {len(content)} chars")
                
        elif event_type == "status":
            print(f"  Status: {event.get('content', '')}")
            
        elif event_type == "error":
            print(f"  ❌ ERROR: {event.get('content', '')}")
            
        else:
            other_events.append(event)
            print(f"  (unhandled event type)")
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 SUMMARY")
    print("=" * 80)
    print(f"Total events: {event_count}")
    print(f"Text chunks: {len(text_chunks)}")
    print(f"Code blocks: {len(code_blocks)}")
    print(f"Images from inline_data: {len(images_inline)}")
    print(f"Images from artifacts: {len(images_from_artifacts)}")
    print(f"Blocks received: {len(blocks_received)}")
    print(f"Other events: {len(other_events)}")
    
    # Check blocks in the service
    final_blocks = report_service.get_report_blocks()
    print(f"\n📦 FINAL BLOCKS IN SERVICE: {len(final_blocks)}")
    for b in final_blocks:
        print(f"  - ID: {b.get('id')}, Type: {b.get('type')}, Title: {b.get('title')}")
        if b.get('type') == 'chart':
            content = b.get('content', '')
            print(f"    Chart content length: {len(content)}")
    
    # Check if we have the full text
    full_text = "".join(text_chunks)
    print(f"\n📝 FULL TEXT RESPONSE ({len(full_text)} chars):")
    print(full_text[:2000])
    if len(full_text) > 2000:
        print(f"... [truncated, {len(full_text) - 2000} more chars]")
    
    print("\n" + "=" * 80)
    print("✅ TEST COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(test_chart_generation())
