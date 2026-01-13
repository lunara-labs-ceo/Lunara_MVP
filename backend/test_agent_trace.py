"""Trace agent behavior to understand excessive chart generation."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from services.report_agent import ReportAgentService


async def test_agent_trace():
    """Trace all agent events to understand chart generation pattern."""
    print("=" * 80)
    print("AGENT BEHAVIOR TRACE - Understanding Excessive Chart Generation")
    print("=" * 80)
    
    service = ReportAgentService()
    await service.initialize("test_user")
    print(f"Session: {service._session_id}\n")
    
    # Simple prompt that should generate ONE chart
    prompt = "Create a report with the order month count data. Include one chart and an executive summary."
    print(f"Prompt: {prompt}\n")
    print("=" * 80)
    
    from google.genai import types
    
    content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=prompt)]
    )
    
    event_count = 0
    code_executor_calls = 0
    data_assistant_calls = 0
    artifacts_saved = []
    
    try:
        async for event in service._runner.run_async(
            user_id=service._user_id,
            session_id=service._session_id,
            new_message=content,
        ):
            event_count += 1
            
            if hasattr(event, 'content') and event.content and hasattr(event.content, 'parts'):
                for part in event.content.parts:
                    
                    # Track function_call to agents
                    if hasattr(part, 'function_call') and part.function_call:
                        fc = part.function_call
                        fc_name = fc.name if hasattr(fc, 'name') else str(fc)
                        
                        if 'CodeExecutor' in fc_name:
                            code_executor_calls += 1
                            print(f"\n[EVENT {event_count}] 🔧 CALLING CodeExecutor (call #{code_executor_calls})")
                            # Try to get the args
                            if hasattr(fc, 'args'):
                                args_preview = str(fc.args)[:200] if fc.args else "None"
                                print(f"   Args preview: {args_preview}")
                        
                        elif 'DataAssistant' in fc_name:
                            data_assistant_calls += 1
                            print(f"\n[EVENT {event_count}] 📊 CALLING DataAssistant (call #{data_assistant_calls})")
                            if hasattr(fc, 'args'):
                                args_preview = str(fc.args)[:300] if fc.args else "None"
                                print(f"   Args preview: {args_preview}")
                    
                    # Track function_response
                    if hasattr(part, 'function_response') and part.function_response:
                        fr = part.function_response
                        fr_name = fr.name if hasattr(fr, 'name') else str(fr)
                        
                        if hasattr(fr, 'response'):
                            resp = fr.response
                            if isinstance(resp, dict):
                                result = resp.get('result', '')
                                # Check if this mentions a saved artifact
                                if 'artifact' in str(result).lower() or '.png' in str(result):
                                    artifacts_saved.append(result[:100])
                                    print(f"\n[EVENT {event_count}] 📦 ARTIFACT MENTIONED in {fr_name}:")
                                    print(f"   {result[:150]}...")
                    
                    # Track text responses
                    if hasattr(part, 'text') and part.text:
                        author = getattr(event, 'author', 'unknown')
                        text = part.text[:100].replace('\n', ' ')
                        print(f"\n[EVENT {event_count}] 💬 TEXT from {author}:")
                        print(f"   {text}...")
                        
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total events: {event_count}")
    print(f"CodeExecutor called: {code_executor_calls} times")
    print(f"DataAssistant called: {data_assistant_calls} times")
    print(f"Artifacts mentioned: {len(artifacts_saved)}")
    
    # Check blocks created
    blocks = service.get_report_blocks()
    print(f"\nBlocks in report: {len(blocks)}")
    for i, block in enumerate(blocks):
        print(f"  {i+1}. type={block.get('type')}, title={block.get('title', 'N/A')[:40]}")
    
    # Check artifacts from service
    if service._runner and service._runner.artifact_service:
        try:
            artifact_keys = await service._runner.artifact_service.list_artifact_keys(
                app_name="lunara_reports",
                user_id=service._user_id,
                session_id=service._session_id,
            )
            print(f"\nADK Artifacts stored: {len(artifact_keys)}")
            for key in artifact_keys:
                print(f"  - {key}")
        except Exception as e:
            print(f"\nCouldn't list ADK artifacts: {e}")
    
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(test_agent_trace())
