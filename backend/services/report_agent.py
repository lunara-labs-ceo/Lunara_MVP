from __future__ import annotations

import base64
import html
import json
import os
from datetime import datetime
from typing import Any, AsyncIterator, Dict, List, Optional

from pydantic import BaseModel

from google.adk.agents import LlmAgent
from google.adk.artifacts import GcsArtifactService, InMemoryArtifactService
from google.adk.code_executors import BuiltInCodeExecutor
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

# GCP credentials and config are set up by main.py before this module is imported.


# ─────────────────────────────────────────────
# Pydantic schema for the Reporter agent output
# ─────────────────────────────────────────────

class ReportSection(BaseModel):
    heading: str
    html: str  # text / lists / paragraphs only — NO image tags


class DynamicReport(BaseModel):
    title: str
    summary_html: str
    sections: List[ReportSection] = []
    chart_captions: List[str] = []   # one caption per chart, in generation order
    notes: str = ""


# ─────────────────────────────────────────────
# Agent definitions (module-level singletons)
# ─────────────────────────────────────────────

_ANALYST_AGENT = LlmAgent(
    model="gemini-2.0-flash",
    name="Analyst",
    description="Analyzes data artifacts and generates charts via code execution",
    instruction=(
        "You are a data analyst. You will be given JSON data artifacts and a user request.\n\n"
        "Your job:\n"
        "1) Analyze the data and identify key insights.\n"
        "2) If the user asks for charts, generate them with Python (matplotlib) using code execution.\n"
        "   Save each chart with a SEQUENTIAL filename: chart_1.png, chart_2.png, chart_3.png, …\n"
        "   NEVER use timestamps or reuse the same filename for different charts.\n"
        "3) Write a concise plain-text summary of:\n"
        "   - Key findings from the data\n"
        "   - Which charts you created and what each shows\n"
        "Output ONLY your plain-text summary — no JSON, no schema, no markdown headers."
    ),
    code_executor=BuiltInCodeExecutor(),
    output_key="analysis",
)

_REPORTER_AGENT = LlmAgent(
    model="gemini-2.0-flash",
    name="Reporter",
    description="Formats analyst findings into a structured HTML report",
    instruction=(
        "You are a report formatter. You will receive an analyst's findings and must produce a\n"
        "structured report conforming exactly to the required JSON schema.\n\n"
        "Rules:\n"
        "1) Use ONLY the analyst's findings — do not invent data.\n"
        "2) section 'html' fields: plain HTML text only — <p>, <ul>, <li>, <strong>, <em>.\n"
        "   NEVER include <img>, <figure>, <canvas>, or any image-related tags.\n"
        "3) chart_captions: list one short caption per chart the analyst created, in order.\n"
        "   If no charts were created, leave as an empty list.\n"
        "4) Return ONLY valid JSON matching the schema — no markdown fences, no extra text."
    ),
    output_schema=DynamicReport,
    output_key="report_output",
)


# ─────────────────────────────────────────────
# Service class
# ─────────────────────────────────────────────

class ReportAgentService:
    """Two-agent report pipeline.

    Architecture:
    - Agent 1 (Analyst): code_executor=BuiltInCodeExecutor(), output_key="analysis"
      → generates charts saved as GCS artifacts, writes text summary to session state
    - Agent 2 (Reporter): output_schema=DynamicReport, output_key="report_output"
      → reads analyst summary, produces validated DynamicReport dict in session state
    - Backend loads charts from GcsArtifactService and composes final HTML
    """

    APP_NAME = "lunara_reports"

    def __init__(self, report_id: str, artifacts: Optional[List[Dict[str, Any]]] = None):
        self.report_id = report_id
        self._artifacts = artifacts or []
        self._content_items: List[Dict[str, Any]] = []

    # ── Artifact service (GCS in prod, InMemory locally) ─────────────────────

    @staticmethod
    def _make_artifact_service():
        bucket = os.environ.get("GCS_ARTIFACT_BUCKET", "")
        if bucket:
            return GcsArtifactService(bucket_name=bucket)
        return InMemoryArtifactService()

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _get_artifacts(self) -> List[Dict[str, Any]]:
        """Return enriched artifact dicts from frontend (loaded from Supabase chat_artifacts)."""
        enriched = []
        for art in self._artifacts:
            data = art.get("data") or []
            enriched.append({
                "title": art.get("title", "Unnamed Artifact"),
                "sql": art.get("sql", ""),
                "data": data,
                "row_count": len(data) if isinstance(data, list) else 0,
            })
        return enriched

    @staticmethod
    async def _load_png_as_base64(
        artifact_service,
        app_name: str,
        user_id: str,
        session_id: str,
        filename: str,
    ) -> Optional[str]:
        """Load a PNG artifact and return base64-encoded string."""
        try:
            artifact_part = await artifact_service.load_artifact(
                app_name=app_name,
                user_id=user_id,
                session_id=session_id,
                filename=filename,
            )
            if not artifact_part or not getattr(artifact_part, "inline_data", None):
                return None
            raw = artifact_part.inline_data.data
            if isinstance(raw, bytes):
                return base64.b64encode(raw).decode("utf-8")
            if isinstance(raw, str):
                return raw
            return None
        except Exception:
            return None

    @staticmethod
    def _compose_html(
        report_data: Dict[str, Any],
        chart_blocks: List[str],
    ) -> str:
        """Compose a final HTML report from DynamicReport dict + rendered chart blocks."""
        title = report_data.get("title") or "Generated Report"
        summary_html = report_data.get("summary_html") or "<p>No summary provided.</p>"
        sections = report_data.get("sections") or []
        notes = report_data.get("notes") or ""

        section_html = "".join(
            f"<section><h2>{s.get('heading', 'Section')}</h2>{s.get('html', '')}</section>"
            for s in sections
        )

        charts_html = (
            "<section><h2>Charts</h2>" + "".join(chart_blocks) + "</section>"
            if chart_blocks else ""
        )

        notes_html = f"<p><em>{notes}</em></p>" if notes else ""

        return f"""<div class="lunara-report">
  <h1>{title}</h1>
  <section>
    <h2>Summary</h2>
    {summary_html}
  </section>
  {section_html}
  {charts_html}
  {notes_html}
</div>""".strip()

    @staticmethod
    def _build_history_prompt(history: List[Dict[str, Any]]) -> str:
        """Build a conversation history block to inject into the analyst prompt."""
        if not history:
            return ""
        lines = ["\n\n--- CONVERSATION HISTORY (for context) ---"]
        for msg in history:
            role = msg.get("role", "user").upper()
            content = msg.get("content", "")
            if content:
                lines.append(f"{role}: {content[:500]}")
        lines.append("--- END HISTORY ---\n")
        return "\n".join(lines)

    def get_content_items(self) -> List[Dict[str, Any]]:
        return self._content_items.copy()

    # ── Main entry point ─────────────────────────────────────────────────────

    async def generate_content(
        self, prompt: str, history: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncIterator[Dict[str, Any]]:

        artifacts = self._get_artifacts()
        if not artifacts:
            yield {
                "type": "error",
                "content": "No artifacts found. Please save at least one query artifact from the Chat Agent first.",
            }
            return

        yield {"type": "status", "content": "Loaded artifacts"}

        # ── Shared services ───────────────────────────────────────────────────
        artifact_service = self._make_artifact_service()
        session_service = InMemorySessionService()

        app_name = self.APP_NAME
        user_id = f"report_{self.report_id}"

        session = await session_service.create_session(
            app_name=app_name,
            user_id=user_id,
            state={},
        )

        # ── Build analyst prompt ──────────────────────────────────────────────
        history_context = self._build_history_prompt(history) if history else ""
        analyst_prompt_text = (
            f"{history_context}"
            f"User request: {prompt}\n\n"
            "Artifacts JSON:\n"
            f"{json.dumps(artifacts, ensure_ascii=True)}"
        )
        analyst_message = types.Content(
            role="user", parts=[types.Part(text=analyst_prompt_text)]
        )

        # ── Step 1: Run Analyst (code execution + chart generation) ──────────
        analyst_runner = Runner(
            agent=_ANALYST_AGENT,
            app_name=app_name,
            session_service=session_service,
            artifact_service=artifact_service,
        )

        png_filenames: List[str] = []
        yield {"type": "status", "content": "Analyzing data and generating charts..."}

        async for event in analyst_runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=analyst_message,
        ):
            # Stream analyst text to the UI
            if event.content and event.content.parts:
                for part in event.content.parts:
                    text = getattr(part, "text", None)
                    if text and text.strip() and not getattr(part, "thought", False):
                        yield {"type": "text", "content": text}

            # Collect chart filenames from artifact_delta
            if (
                getattr(event, "actions", None)
                and getattr(event.actions, "artifact_delta", None)
            ):
                for fn in event.actions.artifact_delta.keys():
                    if fn.lower().endswith(".png"):
                        png_filenames.append(fn)

        # ── Read analyst output from session state ────────────────────────────
        cur_session = await session_service.get_session(
            app_name=app_name, user_id=user_id, session_id=session.id
        )
        analysis_text = cur_session.state.get("analysis", "")

        # ── Step 2: Run Reporter (structured output, no tools) ────────────────
        reporter_runner = Runner(
            agent=_REPORTER_AGENT,
            app_name=app_name,
            session_service=session_service,
            artifact_service=artifact_service,
        )

        reporter_message = types.Content(
            role="user",
            parts=[types.Part(
                text=(
                    f"Original user request: {prompt}\n\n"
                    f"Analyst findings:\n{analysis_text}\n\n"
                    "Now generate the structured report."
                )
            )],
        )

        yield {"type": "status", "content": "Formatting report..."}

        async for _event in reporter_runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=reporter_message,
        ):
            pass  # Reporter output goes to session.state["report_output"] via output_key

        # ── Read structured report from session state ─────────────────────────
        final_session = await session_service.get_session(
            app_name=app_name, user_id=user_id, session_id=session.id
        )
        report_data: Dict[str, Any] = final_session.state.get("report_output") or {}

        # Fallback: if Reporter produced no output, show analyst text raw
        if not report_data:
            fallback_html = (
                "<div class=\"lunara-report\">"
                "<h1>Generated Report</h1>"
                "<section><h2>Response</h2>"
                f"<pre>{html.escape(analysis_text or 'No output from agent.')}</pre>"
                "</section></div>"
            )
            item = {
                "id": int(datetime.now().timestamp() * 1000),
                "type": "html",
                "title": "Generated Report",
                "content": fallback_html,
                "created_at": datetime.now().isoformat(),
            }
            self._content_items.append(item)
            yield {"type": "content_item", "item": item}
            yield {"type": "done", "items_added": 1}
            return

        # ── Load charts from artifact service ─────────────────────────────────
        ordered_unique = list(dict.fromkeys(png_filenames))
        chart_captions: List[str] = report_data.get("chart_captions") or []
        chart_blocks: List[str] = []

        for idx, filename in enumerate(ordered_unique):
            img_b64 = await self._load_png_as_base64(
                artifact_service, app_name, user_id, session.id, filename
            )
            if not img_b64:
                continue
            caption = chart_captions[idx] if idx < len(chart_captions) else f"Chart {idx + 1}"
            chart_blocks.append(
                "<figure style=\"margin: 20px 0;\">"
                f"<img src=\"data:image/png;base64,{img_b64}\" alt=\"{caption}\""
                " style=\"max-width: 100%; border: 1px solid #e5e5e5; border-radius: 8px;\"/>"
                f"<figcaption style=\"margin-top: 8px; color: #666; font-size: 14px;\">{caption}</figcaption>"
                "</figure>"
            )

        # ── Compose and yield final report ────────────────────────────────────
        final_html = self._compose_html(report_data, chart_blocks)
        title = report_data.get("title") or "Generated Report"

        item = {
            "id": int(datetime.now().timestamp() * 1000),
            "type": "html",
            "title": title,
            "content": final_html,
            "created_at": datetime.now().isoformat(),
        }
        self._content_items.append(item)

        yield {"type": "content_item", "item": item}
        yield {"type": "done", "items_added": 1}
