# Report Agent v3 - Inverted Architecture
# Parent: ReportAgent (code executor) → Sub-agent: DataAgent (data tools)

from .agent import root_agent, data_agent

__all__ = ["root_agent", "data_agent"]
