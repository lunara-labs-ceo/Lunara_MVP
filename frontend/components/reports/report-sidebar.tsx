"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  History,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ReportSession } from "@/types/report";
import type { ChatArtifact } from "@/types/chat";

// ---- Props ----

interface ReportSidebarProps {
  sessions: ReportSession[];
  activeSessionId: string | null;
  onSessionSelect: (session: ReportSession) => void;
  onSessionCreate: () => void;
  onSessionDelete: (sessionId: string) => void;
  artifacts: ChatArtifact[];
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

// ---- Component ----

export function ReportSidebar({
  sessions,
  activeSessionId,
  onSessionSelect,
  onSessionCreate,
  onSessionDelete,
  artifacts,
  isCollapsed,
}: ReportSidebarProps) {
  // Don't render content when collapsed (parent handles icon-only view)
  if (isCollapsed) return null;

  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    sessions: true,
    artifacts: false,
  });

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
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
            <EmptyState text="No artifacts saved. Save queries in Chat Agent first." />
          ) : (
            artifacts.map((artifact) => (
              <ArtifactItem key={artifact.id} artifact={artifact} />
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
  session: ReportSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex cursor-pointer items-start gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors",
        isActive
          ? "bg-foreground text-background font-medium"
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
        <p
          className={cn(
            "text-[10px]",
            isActive ? "text-background/60" : "text-muted-foreground"
          )}
        >
          {formatRelativeDate(session.updated_at || session.created_at)}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={cn(
          "mt-0.5 flex-shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100",
          isActive
            ? "text-background/60 hover:text-background"
            : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        )}
        aria-label={`Delete session ${session.name}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function ArtifactItem({ artifact }: { artifact: ChatArtifact }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs text-foreground">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {artifact.title || "Untitled query"}
        </p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {artifact.sql.slice(0, 60)}
        </p>
      </div>
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
