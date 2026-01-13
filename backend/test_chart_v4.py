"""Test V4 - Test artifact retrieval from ADK after code execution."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from services.report_agent import ReportAgentService


async def test_artifact_retrieval():
    """Test that generated charts are retrieved from ADK artifact service."""
    print("=" * 70)
    print("Testing Artifact Retrieval - V4")
    print("=" * 70)
    
    service = ReportAgentService()
    await service.initialize("test_user")
    print(f"Session: {service._session_id}")
    
    prompt = "Create a simple bar chart with matplotlib using sample data [10, 20, 15, 25, 30]. Save and show the chart."
    print(f"\nPrompt: {prompt}\n")
    
    chunks = []
    image_count = 0
    
    try:
        async for chunk in service.generate(prompt):
            chunks.append(chunk)
            chunk_type = chunk.get('type', 'unknown')
            
            if chunk_type == 'image':
                image_count += 1
                data = chunk.get('data', '')
                mime = chunk.get('mime_type', '')
                filename = chunk.get('filename', 'N/A')
                print(f"*** IMAGE FOUND! ***")
                print(f"  Filename: {filename}")
                print(f"  MIME: {mime}")
                print(f"  Data length: {len(data)} chars")
                
                # Save the image to disk for verification
                if data:
                    import base64
                    image_bytes = base64.b64decode(data)
                    output_path = Path(__file__).parent / f"test_chart_output_{image_count}.png"
                    with open(output_path, 'wb') as f:
                        f.write(image_bytes)
                    print(f"  Saved to: {output_path}")
            
            elif chunk_type == 'text':
                preview = chunk.get('content', '')[:100].replace('\n', ' ')
                print(f"[TEXT] {preview}...")
            
            elif chunk_type == 'status':
                print(f"[STATUS] {chunk.get('content', '')}")
            
            elif chunk_type == 'block':
                block = chunk.get('block', {})
                print(f"[BLOCK] type={block.get('type')}, title={block.get('title')}")
                
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 70)
    print(f"Summary:")
    print(f"  Total chunks: {len(chunks)}")
    print(f"  Images found: {image_count}")
    print(f"  Report blocks: {len(service.get_report_blocks())}")
    
    for block in service.get_report_blocks():
        print(f"    - {block.get('type')}: {block.get('title')}")
    
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(test_artifact_retrieval())
