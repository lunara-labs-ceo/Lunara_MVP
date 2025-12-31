#!/usr/bin/env python3
"""
Vertex AI Demo Agent using Google Agent Development Kit (ADK)

This script demonstrates building an agent using the Google ADK with
Gemini 3 Flash Preview model on Vertex AI.

Prerequisites:
1. Install the Google ADK: pip install google-adk
2. Set up authentication via service account JSON or Application Default Credentials
"""

import os
import asyncio
from datetime import datetime

# Configure for Vertex AI
os.environ["GOOGLE_CLOUD_PROJECT"] = "lunara-dev"
os.environ["GOOGLE_CLOUD_LOCATION"] = "global"  # Gemini 3 Flash Preview requires global
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

# Set the path to your service account credentials
CREDENTIALS_PATH = os.path.join(os.path.dirname(__file__), "lunara-dev-094f5e9e682e.json")
if os.path.exists(CREDENTIALS_PATH):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = CREDENTIALS_PATH
    print(f"✓ Using service account credentials from: {CREDENTIALS_PATH}")
else:
    print("⚠ Service account credentials file not found. Using Application Default Credentials.")

from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.genai import types


# ============================================================
# Define Tools for the Agent
# ============================================================

def get_current_time(timezone: str = "UTC") -> dict:
    """
    Returns the current date and time.
    
    Args:
        timezone: The timezone to get the time for (currently returns local time).
    
    Returns:
        A dictionary with the current date and time information.
    """
    now = datetime.now()
    return {
        "status": "success",
        "timezone": timezone,
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "formatted": now.strftime("%A, %B %d, %Y at %I:%M %p")
    }


def calculate(expression: str) -> dict:
    """
    Evaluates a mathematical expression safely.
    
    Args:
        expression: A mathematical expression to evaluate (e.g., "2 + 2", "10 * 5").
    
    Returns:
        A dictionary with the result or an error message.
    """
    try:
        # Only allow safe mathematical operations
        allowed_chars = set("0123456789+-*/.() ")
        if not all(c in allowed_chars for c in expression):
            return {"status": "error", "message": "Invalid characters in expression"}
        
        result = eval(expression)
        return {
            "status": "success",
            "expression": expression,
            "result": result
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_weather(city: str) -> dict:
    """
    Returns mock weather information for a city.
    
    Args:
        city: The name of the city to get weather for.
    
    Returns:
        A dictionary with weather information.
    """
    # Mock weather data for demonstration
    weather_data = {
        "new york": {"temp": 45, "condition": "Cloudy", "humidity": 65},
        "los angeles": {"temp": 72, "condition": "Sunny", "humidity": 40},
        "london": {"temp": 48, "condition": "Rainy", "humidity": 80},
        "tokyo": {"temp": 55, "condition": "Clear", "humidity": 55},
        "default": {"temp": 60, "condition": "Partly Cloudy", "humidity": 50}
    }
    
    city_lower = city.lower()
    data = weather_data.get(city_lower, weather_data["default"])
    
    return {
        "status": "success",
        "city": city,
        "temperature_f": data["temp"],
        "temperature_c": round((data["temp"] - 32) * 5/9, 1),
        "condition": data["condition"],
        "humidity": data["humidity"]
    }


# ============================================================
# Create the Demo Agent
# ============================================================

demo_agent = Agent(
    model="gemini-3-flash-preview",
    name="lunara_demo_agent",
    description="A helpful demo agent for the Lunara platform that can answer questions, get the time, do calculations, and check weather.",
    instruction="""You are a friendly and helpful assistant for the Lunara BI platform.
    
You have access to the following tools:
- get_current_time: Get the current date and time
- calculate: Evaluate mathematical expressions
- get_weather: Get weather information for a city

When users ask questions:
1. If they ask about time, use the get_current_time tool
2. If they ask to calculate something, use the calculate tool
3. If they ask about weather, use the get_weather tool
4. For other questions, answer directly from your knowledge

Be concise but friendly in your responses.""",
    tools=[get_current_time, calculate, get_weather],
)


# ============================================================
# Run the Agent
# ============================================================

async def run_agent_demo():
    """Run a demo of the agent with sample queries."""
    print("\n" + "=" * 60)
    print("Lunara Demo Agent - Google ADK + Vertex AI")
    print("=" * 60)
    print(f"Project: {os.environ.get('GOOGLE_CLOUD_PROJECT')}")
    print(f"Location: {os.environ.get('GOOGLE_CLOUD_LOCATION')}")
    print(f"Model: gemini-3-flash-preview")
    print("=" * 60)
    
    # Create the runner
    runner = InMemoryRunner(agent=demo_agent, app_name="lunara_demo")
    
    # Create a session
    session = await runner.session_service.create_session(
        app_name="lunara_demo",
        user_id="demo_user"
    )
    
    # Define test queries
    test_queries = [
        "What time is it right now?",
        "Calculate 25 * 4 + 10",
        "What's the weather like in Tokyo?",
        "What is the Lunara platform for?",
    ]
    
    print("\n🚀 Running demo queries...\n")
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n{'─' * 50}")
        print(f"📝 Query {i}: {query}")
        print("─" * 50)
        
        # Create user message content
        user_content = types.Content(
            role="user",
            parts=[types.Part(text=query)]
        )
        
        # Run the agent and collect response
        response_text = ""
        async for event in runner.run_async(
            session_id=session.id,
            user_id="demo_user",
            new_message=user_content
        ):
            # Collect text responses from the agent
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if hasattr(part, 'text') and part.text:
                        response_text = part.text
        
        print(f"🤖 Response: {response_text}")
    
    print("\n" + "=" * 60)
    print("✅ Demo completed successfully!")
    print("=" * 60)


async def interactive_chat():
    """Run an interactive chat session with the agent."""
    print("\n" + "=" * 60)
    print("Lunara Demo Agent - Interactive Chat")
    print("=" * 60)
    print("Type 'quit' or 'exit' to end the chat.")
    print("=" * 60)
    
    # Create the runner
    runner = InMemoryRunner(agent=demo_agent, app_name="lunara_demo")
    
    # Create a session
    session = await runner.session_service.create_session(
        app_name="lunara_demo",
        user_id="demo_user"
    )
    
    while True:
        try:
            user_input = input("\n📝 You: ").strip()
            
            if user_input.lower() in ['quit', 'exit', 'q']:
                print("\n👋 Goodbye!")
                break
            
            if not user_input:
                continue
            
            # Create user message content
            user_content = types.Content(
                role="user",
                parts=[types.Part(text=user_input)]
            )
            
            # Run the agent and collect response
            response_text = ""
            async for event in runner.run_async(
                session_id=session.id,
                user_id="demo_user",
                new_message=user_content
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if hasattr(part, 'text') and part.text:
                            response_text = part.text
            
            print(f"🤖 Agent: {response_text}")
            
        except KeyboardInterrupt:
            print("\n\n👋 Goodbye!")
            break


def main():
    """Main entry point."""
    import sys
    
    print("\n🔹 Lunara - ADK Agent Demo")
    print("  1. Run demo queries")
    print("  2. Interactive chat")
    
    if len(sys.argv) > 1:
        choice = sys.argv[1]
    else:
        choice = input("\nSelect mode (1 or 2): ").strip()
    
    if choice == "2":
        asyncio.run(interactive_chat())
    else:
        asyncio.run(run_agent_demo())


if __name__ == "__main__":
    main()
