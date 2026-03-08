"use client";

import { useEffect, useRef } from "react";
import { FileText, Loader2 } from "lucide-react";
import { ReportContentItem } from "./report-content-item";
import type { ReportItem } from "@/types/report";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DocumentCanvasProps {
  items: ReportItem[];
  title: string;
  onTitleChange: (title: string) => void;
  onDeleteItem: (itemId: string) => void;
  isGenerating: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentCanvas({
  items,
  title,
  onTitleChange,
  onDeleteItem,
  isGenerating,
}: DocumentCanvasProps) {
  // Scroll-into-view ref for the bottom sentinel
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length]);

  const isEmpty = items.length === 0 && !isGenerating;

  return (
    <div className="flex h-full flex-col">
      {/* ---- Toolbar ---- */}
      <div className="flex h-10 items-center gap-2 border-b border-border px-4">
        <FileText className="size-4 text-muted-foreground" />
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={() => onTitleChange(title)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="flex-1 border-none bg-transparent text-sm font-medium text-foreground outline-none"
          placeholder="Untitled Report"
        />
      </div>

      {/* ---- Document area ---- */}
      <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
        <div className="mx-auto max-w-[800px]">
          {isEmpty ? (
            /* Empty state */
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <FileText className="size-10 text-muted-foreground/30" />
              <h3 className="text-base font-medium text-muted-foreground">
                Start Building Your Report
              </h3>
              <p className="text-sm text-muted-foreground/60">
                Chat with the Report Copilot to generate content
              </p>
            </div>
          ) : (
            /* Content items on a white "paper" card */
            <div className="rounded-lg border border-border bg-background p-8 shadow-sm">
              <div className="space-y-6">
                {items.map((item) => (
                  <ReportContentItem
                    key={item.id}
                    item={item}
                    onDelete={onDeleteItem}
                  />
                ))}
              </div>

              {/* Generating spinner at the bottom */}
              {isGenerating && items.length > 0 && (
                <div className="mt-6 flex items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Scroll sentinel */}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
