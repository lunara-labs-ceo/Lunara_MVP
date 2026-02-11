"""Test Report Agent v3 - Generate a Cohesive Report

This test asks the agent to create a full report using all available artifacts.
"""
import asyncio
import sys
sys.path.insert(0, '/Users/shyam/Desktop/Lunara MVP/backend/adk_agents')

from report_agent_v3.agent import root_agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types


async def generate_report():
    print("=" * 70)
    print("REPORT AGENT V3 - COHESIVE REPORT GENERATION TEST")
    print("=" * 70)
    
    # Create runner
    session_service = InMemorySessionService()
    runner = Runner(
        agent=root_agent,
        app_name="report_gen",
        session_service=session_service,
    )
    
    # Create session
    session = await session_service.create_session(
        app_name="report_gen",
        user_id="test_user",
    )
    
    print(f"Session: {session.id}")
    print(f"Agent: {root_agent.name}")
    print("-" * 70)
    
    # The main request - create a cohesive report
    prompt = """Create a comprehensive business insights report using ALL available data artifacts.

Your report should include:
1. Executive Summary - high level overview
2. Data Analysis - key metrics and trends from each dataset
3. Visualizations - create appropriate charts (use matplotlib)
4. Key Insights - what the data tells us
5. Recommendations - actionable insights

Start by getting all available artifacts, then analyze each one and build the report."""

    print(f"\n📝 PROMPT:\n{prompt}\n")
    print("-" * 70)
    print("\n🤖 AGENT RESPONSE:\n")
    
    message = types.Content(
        role="user",
        parts=[types.Part(text=prompt)]
    )
    
    # Track outputs
    report_sections = []
    charts_generated = 0
    
    async for event in runner.run_async(
        user_id="test_user",
        session_id=session.id,
        new_message=message,
    ):
        author = getattr(event, 'author', 'unknown')
        
        if hasattr(event, 'content') and event.content and event.content.parts:
            for part in event.content.parts:
                # Text output
                if hasattr(part, 'text') and part.text:
                    text = part.text.strip()
                    if text:
                        print(f"\n[{author}] 📄 TEXT:")
                        print(text)
                        report_sections.append({"type": "text", "author": author, "content": text})
                
                # Code execution
                if hasattr(part, 'executable_code') and part.executable_code:
                    code = part.executable_code.code
                    print(f"\n[{author}] 💻 CODE EXECUTED:")
                    print(f"```python\n{code[:500]}{'...' if len(code) > 500 else ''}\n```")
                    report_sections.append({"type": "code", "author": author, "content": code})
                
                # Code results
                if hasattr(part, 'code_execution_result') and part.code_execution_result:
                    output = part.code_execution_result.output
                    print(f"\n[{author}] 📊 CODE OUTPUT:")
                    print(output[:1000] if len(output) > 1000 else output)
                    report_sections.append({"type": "result", "author": author, "content": output})
                
                # Chart images
                if hasattr(part, 'inline_data') and part.inline_data:
                    mime = part.inline_data.mime_type
                    size = len(part.inline_data.data) if part.inline_data.data else 0
                    charts_generated += 1
                    print(f"\n[{author}] 📈 CHART GENERATED: {mime}, {size} bytes")
                    report_sections.append({"type": "chart", "author": author, "mime": mime, "size": size})
                
                # Tool calls (for visibility)
                if hasattr(part, 'function_call') and part.function_call:
                    print(f"\n[{author}] 🔧 TOOL: {part.function_call.name}")
    
    # Summary
    print("\n" + "=" * 70)
    print("REPORT GENERATION SUMMARY")
    print("=" * 70)
    print(f"Total sections: {len(report_sections)}")
    print(f"Text blocks: {sum(1 for s in report_sections if s['type'] == 'text')}")
    print(f"Code blocks: {sum(1 for s in report_sections if s['type'] == 'code')}")
    print(f"Code outputs: {sum(1 for s in report_sections if s['type'] == 'result')}")
    print(f"Charts generated: {charts_generated}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(generate_report())
