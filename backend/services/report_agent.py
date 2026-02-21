from __future__ import annotations

import base64
import html
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional

from google.adk.agents import LlmAgent
from google.adk.artifacts import InMemoryArtifactService
from google.adk.code_executors import BuiltInCodeExecutor
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

# GCP credentials and config are set up by main.py before this module is imported.

class ReportAgentService:
    """Minimal report agent service.

    Architecture:
    - Artifacts are passed from the frontend (loaded from Supabase chat_artifacts)
    - Single ADK agent receives full artifact JSON in prompt
    - Same agent uses BuiltInCodeExecutor to generate charts when requested
    - Backend captures chart artifacts and builds one final HTML report item
    """

    def __init__(self, report_id: str, artifacts: Optional[List[Dict[str, Any]]] = None):
        self.report_id = report_id
        self._artifacts = artifacts or []
        self._content_items: List[Dict[str, Any]] = []

        self.agent = LlmAgent(
            model="gemini-3-flash-preview",
            name="ReportBuilder",
            description="Builds a basic HTML report from provided artifacts",
            instruction=(
                "You are Report Builder. You will be given full JSON artifacts and a user request.\n"
                "Build a clean, basic HTML report.\n\n"
                "Rules:\n"
                "1) Use only the provided artifacts.\n"
                "2) If user asks for charts, generate them with Python (matplotlib) using code execution.\n"
                "3) Save chart files as chart_1.png, chart_2.png, ... in request order.\n"
                "4) Keep output simple and business-readable.\n"
                "5) Return ONLY valid JSON, no markdown fences, no extra prose.\n"
                "6) NEVER put chart references, image tags, or placeholders like [Chart] inside section html fields.\n"
                "   Charts are appended automatically after your JSON response — just write text analysis in sections.\n\n"
                "Return JSON schema:\n"
                "{\n"
                "  \"title\": \"string\",\n"
                "  \"summary_html\": \"<p>...</p>\",\n"
                "  \"sections\": [\n"
                "    {\"heading\": \"string\", \"html\": \"<p>text analysis only, no chart tags</p>\"}\n"
                "  ],\n"
                "  \"chart_captions\": [\"caption for chart_1\", \"caption for chart_2\"],\n"
                "  \"notes\": \"optional short string\"\n"
                "}\n"
            ),
            code_executor=BuiltInCodeExecutor(),
        )

    def _get_artifacts(self) -> List[Dict[str, Any]]:
        """Return artifacts passed from the frontend (from Supabase chat_artifacts)."""
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
    def _extract_json(text: str) -> Optional[Dict[str, Any]]:
        """Parse the first valid JSON object from model text."""
        candidate = text.strip()

        if candidate.startswith("```"):
            candidate = re.sub(r"^```(?:json)?\s*", "", candidate, flags=re.IGNORECASE)
            candidate = re.sub(r"\s*```$", "", candidate)

        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        start = candidate.find("{")
        end = candidate.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None

        try:
            parsed = json.loads(candidate[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None

        return None

    @staticmethod
    async def _load_png_as_base64(
        artifact_service: InMemoryArtifactService,
        app_name: str,
        user_id: str,
        session_id: str,
        filename: str,
    ) -> Optional[str]:
        """Load a PNG artifact and return base64-encoded data."""
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
        title: str,
        summary_html: str,
        sections: List[Dict[str, str]],
        chart_blocks: List[str],
        notes: str,
    ) -> str:
        """Compose a basic HTML report document."""
        section_html = []
        for section in sections:
            heading = section.get("heading", "Section")
            body = section.get("html", "")
            section_html.append(
                f"<section><h2>{heading}</h2>{body}</section>"
            )

        charts_html = ""
        if chart_blocks:
            charts_html = "<section><h2>Charts</h2>" + "".join(chart_blocks) + "</section>"

        notes_html = f"<p><em>{notes}</em></p>" if notes else ""

        return f"""
<div class=\"lunara-report\">
  <h1>{title}</h1>
  <section>
    <h2>Summary</h2>
    {summary_html}
  </section>
  {''.join(section_html)}
  {charts_html}
  {notes_html}
</div>
""".strip()

    def get_content_items(self) -> List[Dict[str, Any]]:
        return self._content_items.copy()

    @staticmethod
    def _build_history_prompt(history: List[Dict[str, Any]]) -> str:
        """Build a conversation history prompt to inject context for multi-turn sessions."""
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

    async def generate_content(self, prompt: str, history: Optional[List[Dict[str, Any]]] = None) -> AsyncIterator[Dict[str, Any]]:
        artifacts = self._get_artifacts()
        if not artifacts:
            yield {
                "type": "error",
                "content": "No artifacts found. Please save at least one query artifact from the Chat Agent first.",
            }
            return

        yield {"type": "status", "content": "Loaded artifacts"}

        session_service = InMemorySessionService()
        artifact_service = InMemoryArtifactService()

        app_name = "lunara_reports"
        user_id = f"report_{self.report_id}"

        runner = Runner(
            agent=self.agent,
            app_name=app_name,
            session_service=session_service,
            artifact_service=artifact_service,
        )

        session = await session_service.create_session(
            app_name=app_name,
            user_id=user_id,
            state={},
        )

        # Inject conversation history if present (multi-turn context)
        history_context = self._build_history_prompt(history) if history else ""

        user_prompt = (
            f"{history_context}"
            "User request:\n"
            f"{prompt}\n\n"
            "Artifacts JSON:\n"
            f"{json.dumps(artifacts, ensure_ascii=True)}"
        )

        content = types.Content(role="user", parts=[types.Part(text=user_prompt)])

        text_chunks: List[str] = []
        png_filenames: List[str] = []

        yield {"type": "status", "content": "Analyzing data and generating report"}

        async for event in runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=content,
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if getattr(part, "text", None):
                        text = part.text
                        text_chunks.append(text)
                        yield {"type": "text", "content": text}

            if (
                getattr(event, "actions", None)
                and getattr(event.actions, "artifact_delta", None)
            ):
                for filename in event.actions.artifact_delta.keys():
                    if filename.lower().endswith(".png"):
                        png_filenames.append(filename)

        report_text = "".join(text_chunks).strip()
        parsed = self._extract_json(report_text)

        if not parsed:
            fallback_html = (
                "<div class=\"lunara-report\">"
                "<h1>Generated Report</h1>"
                "<section><h2>Response</h2>"
                f"<pre>{html.escape(report_text)}</pre>"
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

        title = parsed.get("title") or "Generated Report"
        summary_html = parsed.get("summary_html") or "<p>No summary provided.</p>"
        sections = parsed.get("sections") if isinstance(parsed.get("sections"), list) else []
        chart_captions = parsed.get("chart_captions") if isinstance(parsed.get("chart_captions"), list) else []
        notes = parsed.get("notes") or ""

        chart_blocks: List[str] = []
        if png_filenames:
            # Preserve creation order while removing duplicates.
            ordered_unique = list(dict.fromkeys(png_filenames))
            for idx, filename in enumerate(ordered_unique):
                img_base64 = await self._load_png_as_base64(
                    artifact_service=artifact_service,
                    app_name=app_name,
                    user_id=user_id,
                    session_id=session.id,
                    filename=filename,
                )
                if not img_base64:
                    continue
                caption = chart_captions[idx] if idx < len(chart_captions) else f"Chart {idx + 1}"
                chart_blocks.append(
                    "<figure style=\"margin: 20px 0;\">"
                    f"<img src=\"data:image/png;base64,{img_base64}\" alt=\"{caption}\" style=\"max-width: 100%; border: 1px solid #e5e5e5; border-radius: 8px;\"/>"
                    f"<figcaption style=\"margin-top: 8px; color: #666; font-size: 14px;\">{caption}</figcaption>"
                    "</figure>"
                )

        final_html = self._compose_html(
            title=title,
            summary_html=summary_html,
            sections=sections,
            chart_blocks=chart_blocks,
            notes=notes,
        )

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
