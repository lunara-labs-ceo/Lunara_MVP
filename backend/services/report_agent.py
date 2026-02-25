from __future__ import annotations

import base64
import html
import json
import os
from datetime import datetime
from typing import Any, AsyncIterator, Dict, List, Optional

from pydantic import BaseModel, Field

from google.adk.agents import LlmAgent
from google.adk.artifacts import GcsArtifactService, InMemoryArtifactService
from google.adk.code_executors.agent_engine_sandbox_code_executor import (
    AgentEngineSandboxCodeExecutor,
)
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

# GCP credentials and config are set up by main.py before this module is imported.


# ─────────────────────────────────────────────
# Pydantic schema for the Analyst → Reporter handoff
# ─────────────────────────────────────────────

class ChartEntry(BaseModel):
    filename: str = Field(description="The exact filename of the generated chart (e.g., '0.png')")
    description: str = Field(description="What the chart shows and its key insight")
    placement_hint: str = Field(description="Where this chart belongs in the report narrative")


class AnalysisManifest(BaseModel):
    summary_text: str = Field(description="Plain-text summary of the overall analysis findings")
    charts: List[ChartEntry] = Field(default=[], description="List of all generated charts, in chronological order")


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

# Agent Engine resource name (auto-creates sandboxes per session).
_AGENT_ENGINE_RESOURCE_NAME = os.environ.get(
    "AGENT_ENGINE_RESOURCE_NAME",
    "projects/1025045538344/locations/us-central1/"
    "reasoningEngines/651943325061873664",
)

_ANALYST_AGENT = LlmAgent(
    model="gemini-3-flash-preview",
    name="Analyst",
    description="Analyzes data artifacts and generates charts via code execution",
    instruction=(
        "You are Lunara's friendly data analyst. You're warm, approachable, and genuinely\n"
        "excited about helping users explore their data. Think of yourself as a sharp but kind\n"
        "colleague who makes data feel accessible and interesting.\n\n"
        "CONVERSATION FLOW — this is important:\n"
        "- If the user greets you (hi, hello, hey, etc.), greet them back warmly! Mention\n"
        "  that you can see their data artifacts and ask what they'd like to explore or build.\n"
        "  Do NOT immediately start analyzing or generating charts.\n"
        "- If the user asks a question about the data, answer it conversationally. Explain\n"
        "  findings like you're talking to a smart friend, not writing a textbook.\n"
        "- ONLY when the user explicitly asks you to build a report, generate charts, or\n"
        "  analyze the data (e.g. 'build me a report', 'create some charts', 'analyze this'),\n"
        "  should you run code and generate charts.\n\n"
        "When you DO generate charts (only when asked):\n"
        "   CRITICAL RULES:\n"
        "   - Generate EACH chart in its OWN SEPARATE code execution block.\n"
        "   - Use ONLY plt.savefig() to save. NEVER call plt.show().\n"
        "   - Call plt.close() after each savefig() to clear the figure.\n"
        "   - Use descriptive filenames: revenue_bar.png, users_line.png, etc.\n"
        "   - NEVER reuse the same filename for different charts.\n\n"
        "After charts are done, wrap up with a conversational summary. Tell the story\n"
        "the data is telling — what's interesting, surprising, or noteworthy.\n"
    ),
    code_executor=AgentEngineSandboxCodeExecutor(
        agent_engine_resource_name=_AGENT_ENGINE_RESOURCE_NAME,
    ),
    output_key="analysis",
)

_REPORTER_AGENT = LlmAgent(
    model="gemini-3-flash-preview",
    name="Reporter",
    description="Formats analyst findings into a polished, structured HTML report",
    instruction=(
        "You are Lunara's report writer. You take an analyst's findings and craft them into\n"
        "a polished, well-structured report that feels professional yet approachable.\n\n"
        "Your writing style: clear, confident, and warm. Use natural language — not robotic bullet\n"
        "points. Write as if you're presenting insights to a stakeholder who's smart but busy.\n"
        "Make the report feel like something worth reading, not a chore.\n\n"
        "Rules for the JSON output:\n"
        "1) Use ONLY the analyst's findings — do not invent data.\n"
        "2) section 'html' fields: use <p>, <ul>, <li>, <strong>, <em>.\n"
        "   NEVER include <img>, <figure>, <canvas>, or any image-related tags.\n"
        "3) chart_captions: one short, descriptive caption per chart, in order.\n"
        "   If no charts, leave as an empty list.\n"
        "4) chart_index: for sections that should be followed by a chart, set chart_index\n"
        "   to the 0-based index of that chart (matching chart_captions order).\n"
        "   Leave null for sections without a chart. Each index used at most once.\n"
        "5) Return ONLY valid JSON matching the schema — no markdown fences, no extra text.\n"
        "6) Write a compelling title and summary_html that give the reader immediate value.\n"
    ),
    output_schema=DynamicReport,
    output_key="report_output",
)


# ─────────────────────────────────────────────
# Service class
# ─────────────────────────────────────────────

class ReportAgentService:
    """Two-agent report pipeline with structured handoff.

    Architecture:
    - Agent 1 (Analyst): code_executor + output_schema=AnalysisManifest
      → generates charts saved as GCS artifacts, outputs a validated manifest
        listing every chart filename, description, and placement hint in order.
    - Agent 2 (Reporter): output_schema=DynamicReport, output_key="report_output"
      → reads the structured manifest, produces validated DynamicReport dict.
    - Backend loads charts using the manifest's explicit filename list and
      composes the final HTML with charts placed in the correct order.
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

        yield {"type": "status", "content": "Analyzing data and generating charts..."}

        artifact_version_map: Dict[str, int] = {}  # filename → version

        async for event in analyst_runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=analyst_message,
        ):
            # Track artifact filenames from the executor
            if getattr(event, "actions", None) and getattr(event.actions, "artifact_delta", None):
                for fn, ver in event.actions.artifact_delta.items():
                    artifact_version_map[fn] = ver

            # Stream analyst text and generated code to the UI
            if event.content and event.content.parts:
                for part in event.content.parts:
                    # Plain text summary
                    text = getattr(part, "text", None)
                    if text and text.strip() and not getattr(part, "thought", False):
                        yield {"type": "text", "content": text}
                    # Python code the agent writes for chart generation
                    ec = getattr(part, "executable_code", None)
                    if ec is not None:
                        code_text = getattr(ec, "code", str(ec))
                        if code_text and code_text.strip():
                            yield {"type": "code", "language": "python", "content": code_text}

        # ── Read analysis text from session state ──────────────────────────────
        cur_session = await session_service.get_session(
            app_name=app_name, user_id=user_id, session_id=session.id
        )
        analysis_text = cur_session.state.get("analysis", "")

        # ── If no charts were generated, this was just a conversation — skip report ──
        named_artifacts = [
            fn for fn in artifact_version_map
            if not fn.startswith("code_execution_image_") and fn.lower().endswith(".png")
        ]
        if not named_artifacts:
            return

        # ── Step 2: Run Reporter (structured output, no tools) ────────────────
        reporter_runner = Runner(
            agent=_REPORTER_AGENT,
            app_name=app_name,
            session_service=session_service,
            artifact_service=artifact_service,
        )

        # ── Load charts from artifact deltas ──────────────────────────────────
        # The sandbox executor creates both auto-named files (code_execution_image_*)
        # and our custom-named files (from plt.savefig). We keep only the custom ones.
        chart_b64s: List[str] = []
        chart_filenames: List[str] = []

        for filename in sorted(artifact_version_map.keys()):
            # Skip auto-generated sandbox images
            if filename.startswith("code_execution_image_"):
                continue
            if not filename.lower().endswith(".png"):
                continue
            img_b64 = await self._load_png_as_base64(
                artifact_service, app_name, user_id, session.id,
                filename,
            )
            if not img_b64:
                continue
            # Skip blank/empty figures (< ~9.5 KB raw → < 13 KB b64).
            if len(img_b64) < 13000:
                continue
            chart_b64s.append(img_b64)
            chart_filenames.append(filename)

        # ── Build the Reporter prompt with chart info ─────────────────────────
        chart_manifest_text = ""
        if chart_filenames:
            chart_lines = []
            for idx, fname in enumerate(chart_filenames):
                chart_lines.append(f"  chart_index={idx}: {fname}")
            chart_manifest_text = (
                f"\n\nThere are exactly {len(chart_b64s)} chart(s) available.\n"
                + "\n".join(chart_lines)
                + f"\nUse chart_index values 0 to {len(chart_b64s) - 1} only."
            )
        else:
            chart_manifest_text = "\n\nNo charts were generated."

        reporter_message = types.Content(
            role="user",
            parts=[types.Part(
                text=(
                    f"Original user request: {prompt}\n\n"
                    f"Analyst findings:\n{analysis_text}"
                    f"{chart_manifest_text}\n\n"
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

        # Fallback: if Reporter produced no output, show analyst manifest text raw
        if not report_data:
            fallback_text = analysis_text or json.dumps(manifest, indent=2) or "No output from agent."
            fallback_html = (
                "<div class=\"lunara-report\">"
                "<h1>Generated Report</h1>"
                "<section><h2>Response</h2>"
                f"<pre>{html.escape(fallback_text)}</pre>"
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

        # ── Build chart_blocks using manifest descriptions + Reporter captions ─
        # Primary caption source: Reporter's chart_captions (human-friendly).
        # Fallback: manifest descriptions from the Analyst.
        reporter_captions: List[str] = report_data.get("chart_captions") or []
        chart_blocks: List[str] = []

        for idx, img_b64 in enumerate(chart_b64s):
            # Prefer Reporter caption, fall back to manifest description
            if idx < len(reporter_captions) and reporter_captions[idx]:
                caption = reporter_captions[idx]
            elif idx < len(chart_descriptions):
                caption = chart_descriptions[idx]
            else:
                caption = f"Chart {idx + 1}"
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
