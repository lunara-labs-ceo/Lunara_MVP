"use client";

import { useCallback, useRef, useEffect } from "react";
import { Play, Trash2, Bookmark, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ResizeHandle } from "@/components/chat/resize-handle";
import { ResultsTable } from "@/components/chat/results-table";
import type { EditorTab } from "@/types/chat";

interface SqlEditorPanelProps {
  tabs: EditorTab[];
  activeTabIndex: number;
  onTabSwitch: (index: number) => void;
  onTabClose: (index: number) => void;
  onTabAdd: () => void;
  onSqlChange: (sql: string) => void;
  onRunQuery: () => void;
  onClearEditor: () => void;
  onSaveArtifact: () => void;
  resultsHeight: number;
  isResultsDragging: boolean;
  onResultsMouseDown: (e: React.MouseEvent) => void;
}

export function SqlEditorPanel({
  tabs,
  activeTabIndex,
  onTabSwitch,
  onTabClose,
  onTabAdd,
  onSqlChange,
  onRunQuery,
  onClearEditor,
  onSaveArtifact,
  resultsHeight,
  isResultsDragging,
  onResultsMouseDown,
}: SqlEditorPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeTab = tabs[activeTabIndex];

  // Focus textarea when switching tabs
  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeTabIndex]);

  // Cmd+Enter / Ctrl+Enter keyboard shortcut
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onRunQuery();
      }
    },
    [onRunQuery]
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ---- Tab bar ---- */}
      <div className="flex h-9 shrink-0 items-center border-b border-border bg-muted/30">
        <div className="flex flex-1 items-center overflow-x-auto">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              onClick={() => onTabSwitch(index)}
              className={cn(
                "group relative flex h-9 shrink-0 items-center gap-1.5 px-3 text-xs transition-colors",
                index === activeTabIndex
                  ? "border-b-2 border-primary bg-background text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <span className="truncate max-w-[120px]">{tab.name}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(index);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onTabClose(index);
                  }
                }}
                className={cn(
                  "ml-0.5 inline-flex size-4 items-center justify-center rounded-sm transition-colors",
                  "opacity-0 group-hover:opacity-100",
                  index === activeTabIndex && "opacity-60",
                  "hover:bg-muted-foreground/20"
                )}
                aria-label={`Close ${tab.name}`}
              >
                <X className="size-3" />
              </span>
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onTabAdd}
          className="mx-1 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="New query tab"
        >
          <Plus className="size-3" />
        </Button>
      </div>

      {/* ---- Toolbar ---- */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Button
          variant="default"
          size="sm"
          onClick={onRunQuery}
          disabled={!activeTab?.sql.trim()}
          className="gap-1.5"
        >
          <Play className="size-3" />
          Run
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearEditor}
          disabled={!activeTab?.sql.trim()}
          className="text-muted-foreground"
          aria-label="Clear editor"
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSaveArtifact}
          disabled={activeTab?.queryStatus !== "complete"}
          className="text-muted-foreground"
          aria-label="Save artifact"
        >
          <Bookmark className="size-3.5" />
        </Button>

        {/* Status indicator (right-aligned) */}
        <div className="ml-auto flex items-center gap-1.5">
          <StatusDot status={activeTab?.queryStatus ?? "ready"} />
          <span className="text-xs text-muted-foreground">
            <StatusText
              status={activeTab?.queryStatus ?? "ready"}
              rowCount={activeTab?.rowCount ?? 0}
            />
          </span>
        </div>
      </div>

      {/* ---- Editor + Results split ---- */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* SQL Textarea */}
        <textarea
          ref={textareaRef}
          value={activeTab?.sql ?? ""}
          onChange={(e) => onSqlChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write your SQL query here..."
          spellCheck={false}
          className={cn(
            "flex-1 resize-none bg-background p-4",
            "font-mono text-[13px] leading-relaxed text-foreground",
            "placeholder:text-muted-foreground/50",
            "min-h-[120px] w-full border-0 outline-none focus:ring-0"
          )}
        />

        {/* Resize handle between editor and results */}
        <ResizeHandle
          direction="horizontal"
          isDragging={isResultsDragging}
          onMouseDown={onResultsMouseDown}
        />

        {/* Results table area */}
        <div
          style={{ height: resultsHeight }}
          className={cn(
            "flex shrink-0 flex-col overflow-hidden border-t border-border",
            isResultsDragging && "select-none"
          )}
        >
          <ResultsTable
            data={activeTab?.results ?? null}
            rowCount={activeTab?.rowCount ?? 0}
            queryStatus={activeTab?.queryStatus ?? "ready"}
            errorMessage={activeTab?.errorMessage}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- Status helpers ---------- */

function StatusDot({ status }: { status: EditorTab["queryStatus"] }) {
  return (
    <span
      className={cn(
        "inline-block size-2 rounded-full",
        status === "ready" && "bg-muted-foreground/40",
        status === "running" && "animate-pulse bg-amber-500",
        status === "complete" && "bg-green-500",
        status === "error" && "bg-red-500"
      )}
    />
  );
}

function StatusText({
  status,
  rowCount,
}: {
  status: EditorTab["queryStatus"];
  rowCount: number;
}) {
  switch (status) {
    case "ready":
      return "Ready";
    case "running":
      return "Running...";
    case "complete":
      return `${rowCount.toLocaleString()} rows`;
    case "error":
      return "Error";
    default:
      return null;
  }
}
