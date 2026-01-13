"""Deep dive test V3 - Inspect function_response content from AgentTool."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from services.report_agent import ReportAgentService


async def test_inspect_function_response():
    """Test to inspect what's inside function_response from AgentTool."""
    print("=" * 70)
    print("Testing: Inspecting function_response from AgentTool")
    print("=" * 70)
    
    service = ReportAgentService()
    await service.initialize("test_user")
    
    prompt = "Create a simple bar chart with matplotlib using sample data [10, 20, 15, 25, 30]"
    print(f"\nPrompt: {prompt}\n")
    
    from google.genai import types
    
    content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=prompt)]
    )
    
    try:
        async for event in service._runner.run_async(
            user_id=service._user_id,
            session_id=service._session_id,
            new_message=content,
        ):
            if hasattr(event, 'content') and event.content and hasattr(event.content, 'parts'):
                for i, part in enumerate(event.content.parts):
                    
                    # Check if this is a function_response (the result from AgentTool)
                    if hasattr(part, 'function_response') and part.function_response:
                        fr = part.function_response
                        print(f"\n{'='*60}")
                        print(f"*** FUNCTION RESPONSE FOUND ***")
                        print(f"Name: {fr.name if hasattr(fr, 'name') else 'N/A'}")
                        
                        # Inspect all attributes of function_response
                        print(f"\nAttributes of function_response:")
                        for attr in dir(fr):
                            if not attr.startswith('_'):
                                val = getattr(fr, attr, None)
                                if val is not None and not callable(val):
                                    print(f"  {attr}: {type(val).__name__}")
                        
                        # Check for 'response' attribute
                        if hasattr(fr, 'response'):
                            resp = fr.response
                            print(f"\nResponse type: {type(resp).__name__}")
                            print(f"Response value: {str(resp)[:500]}...")
                            
                            # If response is dict-like
                            if hasattr(resp, 'keys'):
                                print(f"Response keys: {list(resp.keys())}")
                            elif hasattr(resp, '__iter__') and not isinstance(resp, str):
                                print(f"Response is iterable with {len(list(resp))} items")
                        
                        # Check for 'parts' inside response
                        if hasattr(fr, 'response') and hasattr(fr.response, 'parts'):
                            parts = fr.response.parts
                            print(f"\nResponse has {len(parts)} parts:")
                            for j, p in enumerate(parts):
                                print(f"  Part {j}: {type(p).__name__}")
                                if hasattr(p, 'inline_data') and p.inline_data:
                                    print(f"    *** HAS inline_data! ***")
                                    print(f"    mime_type: {p.inline_data.mime_type}")
                                    print(f"    data length: {len(p.inline_data.data)}")
                        
                        # Also check if the function_response is/has a Content object
                        if hasattr(fr, 'content') and fr.content:
                            print(f"\n*** function_response.content found! ***")
                            print(f"Type: {type(fr.content).__name__}")
                        
                        print(f"{'='*60}\n")
                        
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
    
    print("Done.")


if __name__ == "__main__":
    asyncio.run(test_inspect_function_response())
