"""
Timing test for Report Agent - measures where time is spent.
"""
import asyncio
import time
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


async def test_timing():
    """Test timing of report generation."""
    
    print("=" * 80)
    print("REPORT AGENT TIMING TEST")
    print("=" * 80)
    
    # Track overall timing
    total_start = time.time()
    
    # 1. Initialize service
    init_start = time.time()
    report_service = ReportAgentService()
    await report_service.initialize(user_id="timing_test")
    init_time = time.time() - init_start
    print(f"\n⏱️ Initialization: {init_time:.2f}s")
    
    # 2. Simple text prompt (no charts)
    print("\n" + "-" * 40)
    print("TEST 1: Simple text response")
    print("-" * 40)
    
    text_start = time.time()
    text_events = 0
    async for event in report_service.generate("Say hello in one sentence."):
        text_events += 1
    text_time = time.time() - text_start
    print(f"⏱️ Simple text: {text_time:.2f}s ({text_events} events)")
    
    # Clear blocks for next test
    report_service.clear_blocks()
    
    # 3. Chart generation (uses CodeExecutor)
    print("\n" + "-" * 40)
    print("TEST 2: Chart generation")
    print("-" * 40)
    
    chart_prompt = """
    Create a simple bar chart with fake data:
    - Q1: 100
    - Q2: 150
    - Q3: 130
    - Q4: 200
    Use matplotlib and add data labels.
    """
    
    chart_start = time.time()
    chart_events = 0
    event_times = []
    last_event_time = chart_start
    
    async for event in report_service.generate(chart_prompt):
        now = time.time()
        event_type = event.get("type", "unknown")
        delta = now - last_event_time
        event_times.append((event_type, delta))
        last_event_time = now
        chart_events += 1
        
        if event_type == "status":
            print(f"  📍 {event.get('content', '')} (+{delta:.2f}s)")
        elif event_type == "image":
            print(f"  📸 Image received (+{delta:.2f}s)")
        elif event_type == "block":
            block = event.get("block", {})
            print(f"  📦 Block: {block.get('type')} - {block.get('title', '')[:30]} (+{delta:.2f}s)")
    
    chart_time = time.time() - chart_start
    print(f"\n⏱️ Chart generation: {chart_time:.2f}s ({chart_events} events)")
    
    # Clear blocks for next test
    report_service.clear_blocks()
    
    # 4. Artifact data fetch (uses DataAssistant + DB)
    print("\n" + "-" * 40)
    print("TEST 3: Artifact data fetch")
    print("-" * 40)
    
    artifact_prompt = "List all available artifacts."
    
    artifact_start = time.time()
    artifact_events = 0
    async for event in report_service.generate(artifact_prompt):
        artifact_events += 1
    artifact_time = time.time() - artifact_start
    print(f"⏱️ Artifact listing: {artifact_time:.2f}s ({artifact_events} events)")
    
    # 5. Full report (combines everything)
    print("\n" + "-" * 40)
    print("TEST 4: Full report generation")
    print("-" * 40)
    
    report_service.clear_blocks()
    
    full_prompt = """
    Create a brief sales report with:
    1. Executive summary (2 sentences)
    2. A bar chart showing Q1-Q4 sales: 100, 150, 130, 200
    """
    
    full_start = time.time()
    full_events = 0
    async for event in report_service.generate(full_prompt):
        event_type = event.get("type", "unknown")
        full_events += 1
        if event_type == "status":
            elapsed = time.time() - full_start
            print(f"  📍 [{elapsed:.1f}s] {event.get('content', '')}")
    
    full_time = time.time() - full_start
    print(f"\n⏱️ Full report: {full_time:.2f}s ({full_events} events)")
    
    # Summary
    total_time = time.time() - total_start
    
    print("\n" + "=" * 80)
    print("📊 TIMING SUMMARY")
    print("=" * 80)
    print(f"  Initialization:    {init_time:>6.2f}s")
    print(f"  Simple text:       {text_time:>6.2f}s")
    print(f"  Chart generation:  {chart_time:>6.2f}s")
    print(f"  Artifact listing:  {artifact_time:>6.2f}s")
    print(f"  Full report:       {full_time:>6.2f}s")
    print(f"  ─────────────────────────────")
    print(f"  TOTAL:             {total_time:>6.2f}s")
    print("=" * 80)
    
    # Analysis
    print("\n💡 ANALYSIS:")
    if chart_time > text_time * 3:
        print(f"   • Chart generation is {chart_time/text_time:.1f}x slower than text")
        print("   • CodeExecutor + matplotlib is likely the bottleneck")
    if full_time > chart_time + text_time:
        print(f"   • Full report overhead: {full_time - chart_time - text_time:.2f}s")
        print("   • Multi-agent orchestration adds latency")


if __name__ == "__main__":
    asyncio.run(test_timing())
