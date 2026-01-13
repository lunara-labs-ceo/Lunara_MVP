"""Deep dive test for chart generation - trace all agent events."""
import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from services.report_agent import ReportAgentService


async def test_chart_generation():
    """Test chart generation with detailed output."""
    print("=" * 70)
    print("Testing Chart Generation - Deep Dive")
    print("=" * 70)
    
    # Create service
    print("\n1. Creating service...")
    service = ReportAgentService()
    
    # Initialize
    print("\n2. Initializing...")
    await service.initialize("test_user")
    print(f"   Session: {service._session_id}")
    
    # Ask for a chart specifically
    print("\n3. Asking for a chart...")
    prompt = """Please create a bar chart showing the top 10 brands by total revenue. 
    Use the data from the 'Top 10 brands by total revenue' artifact.
    Actually generate and show me the chart using Python code."""
    
    print(f"   Prompt: {prompt[:80]}...")
    
    chunks = []
    print("\n4. Agent responses:\n")
    
    try:
        async for chunk in service.generate(prompt):
            chunks.append(chunk)
            chunk_type = chunk.get('type', 'unknown')
            
            print(f"   [{chunk_type.upper()}]")
            
            if chunk_type == 'text':
                content = chunk.get('content', '')
                author = chunk.get('author', 'unknown')
                print(f"      Author: {author}")
                # Print first 200 chars
                preview = content[:200].replace('\n', ' ')
                print(f"      Content: {preview}...")
                
            elif chunk_type == 'code':
                code = chunk.get('content', '')
                print(f"      Code ({len(code)} chars):")
                print("      ---")
                for line in code.split('\n')[:10]:
                    print(f"      {line}")
                if code.count('\n') > 10:
                    print("      ...")
                print("      ---")
                
            elif chunk_type == 'code_result':
                output = chunk.get('output', '')
                outcome = chunk.get('outcome', '')
                print(f"      Outcome: {outcome}")
                print(f"      Output: {output[:200]}...")
                
            elif chunk_type == 'image':
                mime_type = chunk.get('mime_type', '')
                data = chunk.get('data', '')
                print(f"      *** IMAGE GENERATED! ***")
                print(f"      MIME: {mime_type}")
                print(f"      Data length: {len(data)} chars")
                
            elif chunk_type == 'status':
                print(f"      {chunk.get('content', '')}")
                
            elif chunk_type == 'block':
                block = chunk.get('block', {})
                print(f"      Block added: type={block.get('type')}, title={block.get('title')}")
                
            elif chunk_type == 'error':
                print(f"      ERROR: {chunk.get('content', '')}")
            
            print()
        
    except Exception as e:
        print(f"   ✗ Exception: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 70)
    print(f"Summary: Received {len(chunks)} chunks")
    
    # Count by type
    type_counts = {}
    for c in chunks:
        t = c.get('type', 'unknown')
        type_counts[t] = type_counts.get(t, 0) + 1
    
    print("By type:")
    for t, count in sorted(type_counts.items()):
        print(f"   - {t}: {count}")
    
    # Check report blocks
    blocks = service.get_report_blocks()
    print(f"\nReport blocks in service: {len(blocks)}")
    for b in blocks:
        print(f"   - {b.get('type')}: {b.get('title')}")
    
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(test_chart_generation())
