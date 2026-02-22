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
    html: str                         # text / lists / paragraphs only — NO image tags
    chart_index: Optional[int] = None # 0-based index of chart to insert after this section


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
    model="gemini-3-flash-preview",
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
    model="gemini-3-flash-preview",
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
        "4) chart_index: for each section that should be immediately followed by a chart,\n"
        "   set chart_index to the 0-based index of that chart (matching chart_captions order).\n"
        "   Example: if chart 0 belongs after the 'Top Tracks' section, set chart_index=0 there.\n"
        "   Leave chart_index null (omit it) for sections that have no chart.\n"
        "   Each chart_index value should be used at most once across all sections.\n"
        "5) Return ONLY valid JSON matching the schema — no markdown fences, no extra text."
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
        version: Optional[int] = None,
    ) -> Optional[str]:
        """Load a PNG artifact and return base64-encoded string.

        Pass version to retrieve a specific saved version (e.g. when the agent
        saves multiple charts under the same filename as successive versions).
        If version is None, the latest version is returned.
        """
        try:
            artifact_part = await artifact_service.load_artifact(
                app_name=app_name,
                user_id=user_id,
                session_id=session_id,
                filename=filename,
                version=version,
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
        """Compose a final HTML report from DynamicReport dict + rendered chart blocks.

        Charts are placed inline immediately after the section whose chart_index matches
        their 0-based position in chart_blocks.  Any charts not referenced by a section
        are appended at the end under a 'Charts' heading.
        """
        title = report_data.get("title") or "Generated Report"
        summary_html = report_data.get("summary_html") or "<p>No summary provided.</p>"
        sections = report_data.get("sections") or []
        notes = report_data.get("notes") or ""

        placed_chart_indices: set = set()
        section_parts: List[str] = []

        for s in sections:
            heading = s.get("heading", "Section")
            body_html = s.get("html", "")
            chart_idx = s.get("chart_index")

            section_parts.append(
                f"<section><h2>{heading}</h2>{body_html}</section>"
            )

            # Insert chart inline right after this section when one is assigned
            if (
                chart_idx is not None
                and isinstance(chart_idx, int)
                and 0 <= chart_idx < len(chart_blocks)
            ):
                section_parts.append(chart_blocks[chart_idx])
                placed_chart_indices.add(chart_idx)

        section_html = "".join(section_parts)

        # Any charts not placed inline → append at end under "Charts"
        remaining = [
            chart_blocks[i]
            for i in range(len(chart_blocks))
            if i not in placed_chart_indices
        ]
        charts_html = (
            "<section><h2>Charts</h2>" + "".join(remaining) + "</section>"
            if remaining else ""
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

        # List of (filename, version) tuples — one entry per artifact save event.
        # The agent may save multiple charts under the same filename as successive
        # versions (e.g. chart.png/0, chart.png/1, chart.png/2), so we must
        # use .items() to capture every version rather than deduplicating on filename.
        png_artifacts: List[tuple] = []
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

            # Collect (filename, version) pairs from artifact_delta.
            # artifact_delta is dict[str, int]: filename → version number just saved.
            if (
                getattr(event, "actions", None)
                and getattr(event.actions, "artifact_delta", None)
            ):
                for fn, ver in event.actions.artifact_delta.items():
                    if fn.lower().endswith(".png"):
                        png_artifacts.append((fn, ver))

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
        # png_artifacts is a list of (filename, version) tuples in save order.
        # Load each specific version so we get every chart the agent produced,
        # even when multiple charts were saved under the same filename.
        chart_captions: List[str] = report_data.get("chart_captions") or []
        chart_blocks: List[str] = []

        for filename, version in png_artifacts:
            img_b64 = await self._load_png_as_base64(
                artifact_service, app_name, user_id, session.id, filename, version=version
            )
            if not img_b64:
                continue
            # Skip blank/empty figures — a real chart base64-encodes to at least ~13 KB.
            # Matplotlib sometimes saves an empty figure (~7 KB raw) before the real plot.
            if len(img_b64) < 13000:
                continue
            idx = len(chart_blocks)
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
