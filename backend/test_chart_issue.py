"""Test script to diagnose chart generation issue with sub-agents."""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from services.report_agent import ReportAgentService


async def test_chart_generation():
    """Test chart generation with detailed logging."""
    print("=" * 80)
    print("CHART GENERATION TEST")
    print("=" * 80)
    
    # Create service
    service = ReportAgentService(report_id=999)
    print(f"\n✓ Service created")
    print(f"  - Main agent tools: {len(service.agent.tools)}")
    print(f"  - Chart generator has code_executor: {service.chart_generator.code_executor is not None}")
    
    # Test prompt that should trigger chart generation
    prompt = """Create a bar chart from this data:
    [
        {"brand": "Nike", "revenue": 50000},
        {"brand": "Adidas", "revenue": 35000},
        {"brand": "Puma", "revenue": 25000}
    ]
    Show brands on x-axis and revenue on y-axis.
    """
    
    print(f"\n{'='*80}")
    print(f"PROMPT: {prompt[:100]}...")
    print(f"{'='*80}\n")
    
    event_count = 0
    text_chunks = []
    code_events = []
    chart_events = []
    content_items = []
    error_events = []
    
    try:
        async for event in service.generate_content(prompt):
            event_count += 1
            event_type = event.get("type", "unknown")
            
            print(f"\n--- Event #{event_count} (type: {event_type}) ---")
            
            if event_type == "text":
                content = event.get("content", "")
                text_chunks.append(content)
                print(f"  TEXT: {content[:200]}...")
                
            elif event_type == "status":
                print(f"  STATUS: {event.get('content', '')}")
                
            elif event_type == "code":
                code = event.get("content", "")
                code_events.append(code)
                print(f"  CODE:\n{code[:500]}...")
                
            elif event_type == "code_result":
                output = event.get("output", "")
                print(f"  CODE RESULT: {output[:200]}...")
                
            elif event_type == "chart":
                data = event.get("data", "")
                chart_events.append(data)
                print(f"  CHART RECEIVED! Data length: {len(data)}")
                print(f"  MIME type: {event.get('mime_type', 'unknown')}")
                
            elif event_type == "content_item":
                item = event.get("item", {})
                content_items.append(item)
                print(f"  CONTENT ITEM: type={item.get('type')}, id={item.get('id')}")
                
            elif event_type == "done":
                print(f"  DONE: {event}")
                
            elif event_type == "error":
                error = event.get("content", "")
                error_events.append(error)
                print(f"  ERROR: {error}")
                
            else:
                print(f"  UNKNOWN: {event}")
    
    except Exception as e:
        print(f"\n❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
    
    # Summary
    print(f"\n{'='*80}")
    print("SUMMARY")
    print(f"{'='*80}")
    print(f"Total events: {event_count}")
    print(f"Text chunks: {len(text_chunks)}")
    print(f"Code events: {len(code_events)}")
    print(f"Chart events: {len(chart_events)}")
    print(f"Content items: {len(content_items)}")
    print(f"Errors: {len(error_events)}")
    
    print(f"\nFinal content items in service: {len(service.get_content_items())}")
    for item in service.get_content_items():
        print(f"  - {item.get('type')}: {item.get('title', 'Untitled')}")
    
    if chart_events:
        print(f"\n✅ SUCCESS: Chart data was captured!")
    else:
        print(f"\n❌ FAILURE: No chart data captured")
        print("\nFull text response:")
        print("".join(text_chunks))


if __name__ == "__main__":
    asyncio.run(test_chart_generation())
