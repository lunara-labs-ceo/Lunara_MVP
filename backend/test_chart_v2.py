"""Deep dive test V2 - Log ALL event attributes."""
import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from services.report_agent import ReportAgentService


async def test_chart_generation_v2():
    """Test chart generation with FULL event logging."""
    print("=" * 70)
    print("Testing Chart Generation V2 - Full Event Trace")
    print("=" * 70)
    
    # Create service
    service = ReportAgentService()
    await service.initialize("test_user")
    print(f"Session: {service._session_id}")
    
    # Simple chart request
    prompt = "Create a simple bar chart using some sample data. Use Python and matplotlib."
    print(f"\nPrompt: {prompt}\n")
    print("=" * 70)
    
    from google.genai import types
    
    content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=prompt)]
    )
    
    event_count = 0
    
    try:
        async for event in service._runner.run_async(
            user_id=service._user_id,
            session_id=service._session_id,
            new_message=content,
        ):
            event_count += 1
            print(f"\n--- Event {event_count} ---")
            print(f"Type: {type(event).__name__}")
            print(f"Author: {getattr(event, 'author', 'N/A')}")
            
            # Check event attributes
            for attr in ['content', 'actions', 'error_code', 'error_message']:
                if hasattr(event, attr):
                    val = getattr(event, attr)
                    if val:
                        print(f"{attr}: {type(val).__name__}")
            
            # Deep dive into content
            if hasattr(event, 'content') and event.content:
                print(f"\n  Content.role: {getattr(event.content, 'role', 'N/A')}")
                if hasattr(event.content, 'parts') and event.content.parts:
                    print(f"  Parts count: {len(event.content.parts)}")
                    
                    for i, part in enumerate(event.content.parts):
                        print(f"\n    Part {i}:")
                        print(f"      Type: {type(part).__name__}")
                        
                        # Check all known part attributes
                        part_attrs = ['text', 'executable_code', 'code_execution_result', 
                                     'function_call', 'function_response', 'inline_data',
                                     'thought', 'thought_signature']
                        
                        for attr in part_attrs:
                            if hasattr(part, attr):
                                val = getattr(part, attr)
                                if val is not None:
                                    if attr == 'text':
                                        preview = str(val)[:80].replace('\n', ' ')
                                        print(f"      text: '{preview}...'")
                                    elif attr == 'executable_code':
                                        code = val.code if hasattr(val, 'code') else str(val)
                                        print(f"      executable_code: ({len(code)} chars)")
                                        for line in code.split('\n')[:3]:
                                            print(f"        {line}")
                                    elif attr == 'code_execution_result':
                                        output = val.output if hasattr(val, 'output') else str(val)
                                        outcome = val.outcome if hasattr(val, 'outcome') else 'N/A'
                                        print(f"      code_execution_result: outcome={outcome}")
                                        print(f"        output: {str(output)[:100]}...")
                                    elif attr == 'function_call':
                                        name = val.name if hasattr(val, 'name') else str(val)
                                        print(f"      function_call: {name}")
                                    elif attr == 'function_response':
                                        name = val.name if hasattr(val, 'name') else str(val)
                                        print(f"      function_response: {name}")
                                    elif attr == 'inline_data':
                                        mime = val.mime_type if hasattr(val, 'mime_type') else 'N/A'
                                        data = val.data if hasattr(val, 'data') else b''
                                        size = len(data) if data else 0
                                        print(f"      *** INLINE_DATA: mime={mime}, size={size} bytes ***")
                                    else:
                                        print(f"      {attr}: present ({type(val).__name__})")
            
            # Also check if event has any other interesting attributes
            other_attrs = [a for a in dir(event) if not a.startswith('_') and a not in ['content', 'actions']]
            interesting = [a for a in other_attrs if getattr(event, a, None) is not None]
            if interesting:
                print(f"\n  Other attrs: {interesting[:5]}")
                            
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 70)
    print(f"Total events received: {event_count}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(test_chart_generation_v2())
