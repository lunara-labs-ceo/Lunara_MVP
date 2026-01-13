"""Unit test for ReportAgentService to debug app name mismatch."""
import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from services.report_agent import ReportAgentService


async def test_basic_generation():
    """Test basic agent generation."""
    print("=" * 60)
    print("Testing ReportAgentService")
    print("=" * 60)
    
    # Create service
    print("\n1. Creating service...")
    service = ReportAgentService()
    print(f"   ✓ ReportWriter: {service.report_writer.name}")
    print(f"   ✓ DataAssistant: {service.data_assistant.name}")
    print(f"   ✓ CodeExecutor: {service.code_executor.name}")
    
    # Initialize runner/session
    print("\n2. Initializing runner and session...")
    try:
        await service.initialize("test_user")
        print(f"   ✓ Session ID: {service._session_id}")
        print(f"   ✓ Runner created for agent: {service._runner.agent.name if service._runner else 'None'}")
    except Exception as e:
        print(f"   ✗ Error during initialization: {e}")
        raise
    
    # Test simple prompt
    print("\n3. Testing generate() with simple prompt...")
    prompt = "Hello, can you list the available artifacts?"
    
    try:
        chunks = []
        async for chunk in service.generate(prompt):
            chunks.append(chunk)
            chunk_type = chunk.get('type', 'unknown')
            content = chunk.get('content', '')[:100] if chunk.get('content') else ''
            print(f"   📦 Chunk: type={chunk_type}, content preview: {content}...")
        
        print(f"\n   ✓ Received {len(chunks)} chunks total")
        
    except Exception as e:
        print(f"   ✗ Error during generation: {e}")
        import traceback
        traceback.print_exc()
        raise
    
    print("\n" + "=" * 60)
    print("Test completed!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_basic_generation())
