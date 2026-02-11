"""Comprehensive Test Suite for Report Agent v3

Tests the inverted architecture:
  ReportAgent (parent with code executor) 
    → DataAgent (sub-agent with data tools)

Run with: python test_v3_agent_full.py
"""
import asyncio
import sys
import json
import time
from datetime import datetime

sys.path.insert(0, '/Users/shyam/Desktop/Lunara MVP/backend/adk_agents')

from report_agent_v3.agent import root_agent, data_agent, get_artifacts, get_artifact_data
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types


class TestResults:
    """Track test results"""
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = []
    
    def record(self, name: str, passed: bool, details: str = ""):
        status = "✅ PASS" if passed else "❌ FAIL"
        self.results.append((name, status, details))
        if passed:
            self.passed += 1
        else:
            self.failed += 1
        print(f"{status}: {name}")
        if details and not passed:
            print(f"   Details: {details}")
    
    def summary(self):
        print("\n" + "=" * 70)
        print("TEST SUMMARY")
        print("=" * 70)
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print(f"Total:  {self.passed + self.failed}")
        print("=" * 70)


results = TestResults()


# ==============================================================================
# UNIT TESTS - Direct function testing
# ==============================================================================

def test_get_artifacts_function():
    """Test get_artifacts() function directly"""
    print("\n" + "-" * 70)
    print("TEST: get_artifacts() function")
    print("-" * 70)
    
    result = get_artifacts()
    try:
        data = json.loads(result)
        if isinstance(data, list):
            results.record(
                "get_artifacts returns list",
                True,
                f"Found {len(data)} artifacts"
            )
            if len(data) > 0:
                results.record(
                    "artifacts have required fields",
                    all(k in data[0] for k in ["id", "title", "created_at"]),
                    f"First artifact: {data[0].get('title', 'N/A')}"
                )
            return data
        else:
            results.record("get_artifacts returns list", False, f"Got: {type(data)}")
    except json.JSONDecodeError as e:
        results.record("get_artifacts returns valid JSON", False, str(e))
    return []


def test_get_artifact_data_function(artifact_id: str):
    """Test get_artifact_data() function directly"""
    print("\n" + "-" * 70)
    print(f"TEST: get_artifact_data('{artifact_id}')")
    print("-" * 70)
    
    result = get_artifact_data(artifact_id)
    try:
        data = json.loads(result)
        if "error" not in data:
            results.record(
                "get_artifact_data returns data",
                True,
                f"Title: {data.get('title', 'N/A')}, Rows: {data.get('row_count', 0)}"
            )
            results.record(
                "artifact has data array",
                isinstance(data.get('data'), list),
                f"Data type: {type(data.get('data'))}"
            )
            return data
        else:
            results.record("get_artifact_data returns data", False, data.get("error"))
    except json.JSONDecodeError as e:
        results.record("get_artifact_data returns valid JSON", False, str(e))
    return None


def test_get_artifact_data_invalid_id():
    """Test get_artifact_data() with invalid ID"""
    print("\n" + "-" * 70)
    print("TEST: get_artifact_data() with invalid ID")
    print("-" * 70)
    
    result = get_artifact_data("invalid-id-12345")
    try:
        data = json.loads(result)
        results.record(
            "invalid ID returns error gracefully",
            "error" in data,
            f"Got: {data}"
        )
    except Exception as e:
        results.record("invalid ID returns error gracefully", False, str(e))


# ==============================================================================
# AGENT SETUP TESTS
# ==============================================================================

def test_agent_configuration():
    """Test agent configuration is correct"""
    print("\n" + "-" * 70)
    print("TEST: Agent Configuration")
    print("-" * 70)
    
    # Root agent checks
    results.record(
        "root_agent is named ReportAgent",
        root_agent.name == "ReportAgent",
        f"Got: {root_agent.name}"
    )
    
    results.record(
        "root_agent has code executor",
        root_agent.code_executor is not None,
        f"Got: {type(root_agent.code_executor)}"
    )
    
    results.record(
        "root_agent has sub_agents",
        len(root_agent.sub_agents) > 0,
        f"Count: {len(root_agent.sub_agents)}"
    )
    
    # Sub-agent checks
    results.record(
        "DataAgent is in sub_agents",
        any(a.name == "DataAgent" for a in root_agent.sub_agents),
        f"Sub-agents: {[a.name for a in root_agent.sub_agents]}"
    )
    
    # DataAgent tool checks
    results.record(
        "DataAgent has tools",
        len(data_agent.tools) > 0,
        f"Tool count: {len(data_agent.tools)}"
    )
    
    tool_names = [t.name for t in data_agent.tools]
    results.record(
        "DataAgent has get_artifacts tool",
        "get_artifacts" in tool_names,
        f"Tools: {tool_names}"
    )
    
    results.record(
        "DataAgent has get_artifact_data tool",
        "get_artifact_data" in tool_names,
        f"Tools: {tool_names}"
    )


# ==============================================================================
# INTEGRATION TESTS - Agent interactions
# ==============================================================================

async def create_runner_and_session():
    """Helper to create runner and session"""
    session_service = InMemorySessionService()
    runner = Runner(
        agent=root_agent,
        app_name="test_app",
        session_service=session_service,
    )
    session = await session_service.create_session(
        app_name="test_app",
        user_id="test_user",
    )
    return runner, session


async def run_agent_query(runner, session, prompt: str, timeout: int = 120):
    """Run a query and collect responses"""
    message = types.Content(
        role="user",
        parts=[types.Part(text=prompt)]
    )
    
    responses = {
        "text": [],
        "tool_calls": [],
        "tool_responses": [],
        "code": [],
        "code_results": [],
        "inline_data": [],
        "errors": []
    }
    
    try:
        async for event in runner.run_async(
            user_id="test_user",
            session_id=session.id,
            new_message=message,
        ):
            author = getattr(event, 'author', 'unknown')
            
            if hasattr(event, 'content') and event.content and event.content.parts:
                for part in event.content.parts:
                    if hasattr(part, 'text') and part.text:
                        responses["text"].append({"author": author, "text": part.text})
                    if hasattr(part, 'executable_code') and part.executable_code:
                        responses["code"].append({"author": author, "code": part.executable_code.code})
                    if hasattr(part, 'code_execution_result') and part.code_execution_result:
                        responses["code_results"].append({
                            "author": author, 
                            "output": part.code_execution_result.output
                        })
                    if hasattr(part, 'function_call') and part.function_call:
                        responses["tool_calls"].append({
                            "author": author, 
                            "name": part.function_call.name
                        })
                    if hasattr(part, 'function_response') and part.function_response:
                        responses["tool_responses"].append({"author": author})
                    if hasattr(part, 'inline_data') and part.inline_data:
                        responses["inline_data"].append({
                            "author": author,
                            "mime_type": part.inline_data.mime_type,
                            "size": len(part.inline_data.data) if part.inline_data.data else 0
                        })
    except Exception as e:
        responses["errors"].append(str(e))
    
    return responses


async def test_list_artifacts_query():
    """Test asking agent to list artifacts"""
    print("\n" + "-" * 70)
    print("TEST: Agent query - List artifacts")
    print("-" * 70)
    
    runner, session = await create_runner_and_session()
    
    start = time.time()
    responses = await run_agent_query(runner, session, "List all available artifacts")
    elapsed = time.time() - start
    
    print(f"   Response time: {elapsed:.1f}s")
    
    # Check DataAgent was called
    results.record(
        "ReportAgent delegated to DataAgent",
        any(tc["name"] == "transfer_to_agent" for tc in responses["tool_calls"]),
        f"Tool calls: {[tc['name'] for tc in responses['tool_calls']]}"
    )
    
    # Check get_artifacts was called
    results.record(
        "DataAgent called get_artifacts",
        any(tc["name"] == "get_artifacts" for tc in responses["tool_calls"]),
        f"Tool calls: {[tc['name'] for tc in responses['tool_calls']]}"
    )
    
    # Check we got text response
    results.record(
        "Agent returned text response",
        len(responses["text"]) > 0,
        f"Text responses: {len(responses['text'])}"
    )
    
    # Check response mentions artifacts
    all_text = " ".join([t["text"] for t in responses["text"]])
    results.record(
        "Response contains artifact information",
        "artifact" in all_text.lower() or "id" in all_text.lower(),
        f"Response preview: {all_text[:100]}..."
    )
    
    return responses


async def test_get_specific_artifact_query(artifact_id: str, title: str):
    """Test asking agent to get specific artifact data"""
    print("\n" + "-" * 70)
    print(f"TEST: Agent query - Get artifact data for '{title}'")
    print("-" * 70)
    
    runner, session = await create_runner_and_session()
    
    start = time.time()
    responses = await run_agent_query(
        runner, session, 
        f"Get the data from the artifact titled '{title}'"
    )
    elapsed = time.time() - start
    
    print(f"   Response time: {elapsed:.1f}s")
    
    # Check get_artifact_data was called
    results.record(
        "DataAgent called get_artifact_data",
        any(tc["name"] == "get_artifact_data" for tc in responses["tool_calls"]),
        f"Tool calls: {[tc['name'] for tc in responses['tool_calls']]}"
    )
    
    return responses


async def test_create_bar_chart():
    """Test asking agent to create a bar chart"""
    print("\n" + "-" * 70)
    print("TEST: Agent query - Create bar chart")
    print("-" * 70)
    
    runner, session = await create_runner_and_session()
    
    start = time.time()
    responses = await run_agent_query(
        runner, session,
        "Create a bar chart showing sales by category from the Top selling items artifact. Use matplotlib."
    )
    elapsed = time.time() - start
    
    print(f"   Response time: {elapsed:.1f}s")
    
    # Check code was executed
    results.record(
        "Agent wrote Python code",
        len(responses["code"]) > 0,
        f"Code blocks: {len(responses['code'])}"
    )
    
    # Check matplotlib was used
    code_text = " ".join([c["code"] for c in responses["code"]])
    results.record(
        "Code uses matplotlib",
        "matplotlib" in code_text or "plt" in code_text,
        f"Code preview: {code_text[:100]}..."
    )
    
    # Check code execution result
    results.record(
        "Code executed successfully",
        len(responses["code_results"]) > 0,
        f"Results: {len(responses['code_results'])}"
    )
    
    # Check for chart image (inline_data)
    results.record(
        "Chart image generated",
        len(responses["inline_data"]) > 0,
        f"Images: {responses['inline_data']}"
    )
    
    if responses["inline_data"]:
        img = responses["inline_data"][0]
        results.record(
            "Chart is PNG image",
            "png" in img.get("mime_type", "").lower(),
            f"MIME type: {img.get('mime_type')}"
        )
        results.record(
            "Chart image has data",
            img.get("size", 0) > 1000,  # At least 1KB
            f"Size: {img.get('size', 0)} bytes"
        )
    
    return responses


async def test_create_pie_chart():
    """Test asking agent to create a pie chart"""
    print("\n" + "-" * 70)
    print("TEST: Agent query - Create pie chart")
    print("-" * 70)
    
    runner, session = await create_runner_and_session()
    
    start = time.time()
    responses = await run_agent_query(
        runner, session,
        "Create a pie chart from the first available artifact. Show the distribution clearly with labels."
    )
    elapsed = time.time() - start
    
    print(f"   Response time: {elapsed:.1f}s")
    
    # Check code was executed
    results.record(
        "Pie chart - Agent wrote code",
        len(responses["code"]) > 0,
        f"Code blocks: {len(responses['code'])}"
    )
    
    # Check for pie chart in code
    code_text = " ".join([c["code"] for c in responses["code"]])
    results.record(
        "Code uses pie chart",
        "pie" in code_text.lower(),
        f"Code preview: {code_text[:100]}..."
    )
    
    # Check for chart image
    results.record(
        "Pie chart image generated",
        len(responses["inline_data"]) > 0,
        f"Images: {len(responses['inline_data'])}"
    )
    
    return responses


async def test_data_analysis_with_stats():
    """Test asking agent to analyze data and provide statistics"""
    print("\n" + "-" * 70)
    print("TEST: Agent query - Data analysis with statistics")
    print("-" * 70)
    
    runner, session = await create_runner_and_session()
    
    start = time.time()
    responses = await run_agent_query(
        runner, session,
        "Analyze the revenue data and give me: total, average, max, min, and any interesting insights."
    )
    elapsed = time.time() - start
    
    print(f"   Response time: {elapsed:.1f}s")
    
    # Check code was used for analysis
    results.record(
        "Analysis used code execution",
        len(responses["code"]) > 0,
        f"Code blocks: {len(responses['code'])}"
    )
    
    # Check pandas was used
    code_text = " ".join([c["code"] for c in responses["code"]])
    results.record(
        "Analysis uses pandas",
        "pandas" in code_text or "pd." in code_text,
        f"Code preview: {code_text[:100]}..."
    )
    
    # Check response has statistics
    all_text = " ".join([t["text"] for t in responses["text"]])
    code_outputs = " ".join([r["output"] for r in responses["code_results"]])
    combined = all_text + " " + code_outputs
    
    stats_found = any(word in combined.lower() for word in ["total", "average", "mean", "sum", "max", "min"])
    results.record(
        "Response contains statistics",
        stats_found,
        f"Combined output preview: {combined[:200]}..."
    )
    
    return responses


async def test_multi_turn_conversation():
    """Test multi-turn conversation within same session"""
    print("\n" + "-" * 70)
    print("TEST: Multi-turn conversation")
    print("-" * 70)
    
    runner, session = await create_runner_and_session()
    
    # Turn 1: Ask about artifacts
    print("   Turn 1: Asking about artifacts...")
    responses1 = await run_agent_query(runner, session, "What artifacts are available?")
    
    results.record(
        "Turn 1 - Got response",
        len(responses1["text"]) > 0,
        f"Text responses: {len(responses1['text'])}"
    )
    
    # Turn 2: Follow up
    print("   Turn 2: Following up on first artifact...")
    responses2 = await run_agent_query(runner, session, "Tell me more about the first one")
    
    results.record(
        "Turn 2 - Got response (context maintained)",
        len(responses2["text"]) > 0,
        f"Text responses: {len(responses2['text'])}"
    )
    
    # Turn 3: Create visualization
    print("   Turn 3: Requesting visualization...")
    responses3 = await run_agent_query(runner, session, "Now create a simple chart from it")
    
    results.record(
        "Turn 3 - Chart generated",
        len(responses3["code"]) > 0,
        f"Code blocks: {len(responses3['code'])}"
    )


async def test_error_handling():
    """Test agent handles errors gracefully"""
    print("\n" + "-" * 70)
    print("TEST: Error handling")
    print("-" * 70)
    
    runner, session = await create_runner_and_session()
    
    # Request nonexistent artifact
    responses = await run_agent_query(
        runner, session,
        "Get the artifact with ID 'nonexistent-12345' and analyze it"
    )
    
    # Should not crash
    results.record(
        "Agent handles missing artifact gracefully",
        len(responses["errors"]) == 0,
        f"Errors: {responses['errors']}"
    )
    
    # Should provide helpful response
    all_text = " ".join([t["text"] for t in responses["text"]])
    results.record(
        "Agent provides helpful error message",
        len(all_text) > 0,
        f"Response: {all_text[:100]}..."
    )


# ==============================================================================
# MAIN TEST RUNNER
# ==============================================================================

async def run_all_tests():
    """Run all tests"""
    print("=" * 70)
    print("REPORT AGENT V3 - COMPREHENSIVE TEST SUITE")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    # Phase 1: Unit Tests
    print("\n\n🔹 PHASE 1: UNIT TESTS")
    print("=" * 70)
    
    artifacts = test_get_artifacts_function()
    
    if artifacts:
        first_artifact = artifacts[0]
        test_get_artifact_data_function(first_artifact["id"])
    
    test_get_artifact_data_invalid_id()
    
    # Phase 2: Agent Configuration Tests
    print("\n\n🔹 PHASE 2: AGENT CONFIGURATION TESTS")
    print("=" * 70)
    
    test_agent_configuration()
    
    # Phase 3: Integration Tests
    print("\n\n🔹 PHASE 3: INTEGRATION TESTS")
    print("=" * 70)
    
    await test_list_artifacts_query()
    
    if artifacts:
        first_artifact = artifacts[0]
        await test_get_specific_artifact_query(
            first_artifact["id"], 
            first_artifact["title"]
        )
    
    # Phase 4: Chart Generation Tests  
    print("\n\n🔹 PHASE 4: CHART GENERATION TESTS")
    print("=" * 70)
    
    await test_create_bar_chart()
    await test_create_pie_chart()
    
    # Phase 5: Data Analysis Tests
    print("\n\n🔹 PHASE 5: DATA ANALYSIS TESTS")
    print("=" * 70)
    
    await test_data_analysis_with_stats()
    
    # Phase 6: Conversation Tests
    print("\n\n🔹 PHASE 6: CONVERSATION TESTS")
    print("=" * 70)
    
    await test_multi_turn_conversation()
    
    # Phase 7: Error Handling Tests
    print("\n\n🔹 PHASE 7: ERROR HANDLING TESTS")
    print("=" * 70)
    
    await test_error_handling()
    
    # Summary
    results.summary()
    
    return results


if __name__ == "__main__":
    asyncio.run(run_all_tests())
