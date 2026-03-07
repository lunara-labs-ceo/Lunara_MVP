"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  History,
  FileCode,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type {
  ChatSession,
  ChatArtifact,
  SemanticModel,
  SemanticTable,
} from "@/types/chat";

// ---- Props ----

interface ChatSidebarProps {
  // Sessions
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionSelect: (session: ChatSession) => void;
  onSessionCreate: () => void;
  onSessionDelete: (sessionId: string) => void;
  // Artifacts
  artifacts: ChatArtifact[];
  onArtifactSelect: (artifact: ChatArtifact) => void;
  onArtifactDelete: (artifactId: string) => void;
  // Schema
  semanticModel: SemanticModel | null;
  // Collapsed state
  isCollapsed: boolean;
}

// ---- Helpers ----

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SEMANTIC_TYPE_STYLES: Record<string, string> = {
  dimension:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  measure:
    "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  time: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
};

function semanticBadge(semanticType?: string): {
  label: string;
  className: string;
} | null {
  if (!semanticType) return null;
  const lower = semanticType.toLowerCase();
  if (lower.includes("dimension") || lower === "dim") {
    return { label: "DIM", className: SEMANTIC_TYPE_STYLES.dimension };
  }
  if (lower.includes("measure") || lower === "mea") {
    return { label: "MEA", className: SEMANTIC_TYPE_STYLES.measure };
  }
  if (lower.includes("time") || lower.includes("date") || lower === "temporal") {
    return { label: "TIME", className: SEMANTIC_TYPE_STYLES.time };
  }
  return null;
}

// ---- Component ----

export function ChatSidebar({
  sessions,
  activeSessionId,
  onSessionSelect,
  onSessionCreate,
  onSessionDelete,
  artifacts,
  onArtifactSelect,
  onArtifactDelete,
  semanticModel,
  isCollapsed,
}: ChatSidebarProps) {
  // Don't render content when collapsed (parent handles icon-only view)
  if (isCollapsed) return null;

  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    sessions: true,
    artifacts: false,
    tables: false,
  });

  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleTable(tableId: string) {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId);
      else next.add(tableId);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {/* ---- Sessions Section ---- */}
      <SectionHeader
        title="Sessions"
        icon={History}
        isExpanded={expandedSections.sessions}
        onToggle={() => toggleSection("sessions")}
        action={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onSessionCreate();
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="New session"
          >
            <Plus className="size-3" />
          </Button>
        }
      />
      {expandedSections.sessions && (
        <div className="flex flex-col gap-0.5">
          {sessions.length === 0 ? (
            <EmptyState text="No sessions yet" />
          ) : (
            sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onSelect={() => onSessionSelect(session)}
                onDelete={() => onSessionDelete(session.id)}
              />
            ))
          )}
        </div>
      )}

      {/* ---- Artifacts Section ---- */}
      <SectionHeader
        title="Artifacts"
        icon={FileCode}
        isExpanded={expandedSections.artifacts}
        onToggle={() => toggleSection("artifacts")}
        badge={artifacts.length > 0 ? artifacts.length : undefined}
      />
      {expandedSections.artifacts && (
        <div className="flex flex-col gap-0.5">
          {artifacts.length === 0 ? (
            <EmptyState text="No artifacts saved" />
          ) : (
            artifacts.map((artifact) => (
              <ArtifactItem
                key={artifact.id}
                artifact={artifact}
                onSelect={() => onArtifactSelect(artifact)}
                onDelete={() => onArtifactDelete(artifact.id)}
              />
            ))
          )}
        </div>
      )}

      {/* ---- Tables/Schema Section ---- */}
      <SectionHeader
        title="Tables"
        icon={Table2}
        isExpanded={expandedSections.tables}
        onToggle={() => toggleSection("tables")}
      />
      {expandedSections.tables && (
        <div className="flex flex-col gap-0.5">
          {!semanticModel || semanticModel.tables.length === 0 ? (
            <EmptyState text="No semantic model" />
          ) : (
            semanticModel.tables.map((table) => (
              <TableItem
                key={table.table_id || table.name}
                table={table}
                isExpanded={expandedTables.has(table.table_id || table.name)}
                onToggle={() => toggleTable(table.table_id || table.name)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---- Sub-components ----

function SectionHeader({
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  action,
  badge,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isExpanded: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  badge?: number;
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/50"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {isExpanded ? (
        <ChevronDown className="size-3 text-muted-foreground" />
      ) : (
        <ChevronRight className="size-3 text-muted-foreground" />
      )}
      <Icon className="size-3 text-muted-foreground" />
      <span className="flex-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {badge !== undefined && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {badge}
        </span>
      )}
      {action}
    </div>
  );
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex cursor-pointer items-start gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors",
        isActive
          ? "border-l-2 border-primary bg-primary/10 text-primary"
          : "text-foreground hover:bg-muted/50"
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{session.name || "Untitled"}</p>
        <p className="text-[10px] text-muted-foreground">
          {formatRelativeDate(session.updated_at || session.created_at)}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="mt-0.5 flex-shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        aria-label={`Delete session ${session.name}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function ArtifactItem({
  artifact,
  onSelect,
  onDelete,
}: {
  artifact: ChatArtifact;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group flex cursor-pointer items-start gap-1.5 rounded-md px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {artifact.title || "Untitled query"}
        </p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {artifact.sql.slice(0, 60)}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="mt-0.5 flex-shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        aria-label={`Delete artifact ${artifact.title}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function TableItem({
  table,
  isExpanded,
  onToggle,
}: {
  table: SemanticTable;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <div
        className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/50"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {isExpanded ? (
          <ChevronDown className="size-2.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-2.5 text-muted-foreground" />
        )}
        <span className="truncate font-medium">{table.name}</span>
      </div>
      {isExpanded && (
        <div className="ml-5 flex flex-col gap-0.5 py-0.5">
          {table.columns.map((col) => {
            const badge = semanticBadge(col.semantic_type);
            return (
              <div
                key={col.name}
                className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-muted-foreground"
              >
                <span className="truncate">{col.name}</span>
                {badge && (
                  <span
                    className={cn(
                      "flex-shrink-0 rounded px-1 py-0.5 font-mono text-[10px] leading-none",
                      badge.className
                    )}
                  >
                    {badge.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-3">
      <p className="text-center text-xs text-muted-foreground/60">{text}</p>
    </div>
  );
}
