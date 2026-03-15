"use client";

import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { FileText, Loader2, Check } from "lucide-react";
import { TiptapEditor } from "./tiptap-editor";
import { EditorToolbar } from "./editor-toolbar";
import { preprocessReportHtml } from "@/lib/preprocess-report-html";
import type { TiptapEditorHandle } from "./tiptap-editor";
import type { ReportItem } from "@/types/report";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DocumentCanvasProps {
  items: ReportItem[];
  title: string;
  onTitleChange: (title: string) => void;
  onDeleteItem: (itemId: string) => void;
  onUpdateItem: (itemId: string, content: string) => void;
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
  onUpdateItem,
  isGenerating,
}: DocumentCanvasProps) {
  const editorRef = useRef<TiptapEditorHandle>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Combine all HTML items into a single string for the editor
  const editorContent = useMemo(() => {
    const htmlItems = items.filter((item) => item.type === "html");
    if (htmlItems.length === 0) return "";
    const combined = htmlItems.map((item) => item.content).join("\n");
    return preprocessReportHtml(combined);
  }, [items]);

  // Find the first HTML item's ID for saving
  const firstHtmlItemId = useMemo(() => {
    const htmlItem = items.find((item) => item.type === "html");
    return htmlItem?.id ?? null;
  }, [items]);

  // Debounced save handler
  const handleEditorUpdate = useCallback(
    (html: string) => {
      if (!firstHtmlItemId) return;

      // Clear previous timer
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      setSaveStatus("saving");

      // Debounce: save after 1 second of inactivity
      saveTimerRef.current = setTimeout(() => {
        onUpdateItem(firstHtmlItemId, html);
        setSaveStatus("saved");
        // Reset to idle after showing "saved" briefly
        setTimeout(() => setSaveStatus("idle"), 1500);
      }, 1000);
    },
    [firstHtmlItemId, onUpdateItem]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const isEmpty = items.length === 0 && !isGenerating;
  const editor = editorRef.current?.editor ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* ---- Title bar ---- */}
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

        {/* Save status indicator */}
        {saveStatus === "saving" && (
          <span className="text-xs text-muted-foreground">Saving...</span>
        )}
        {saveStatus === "saved" && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3" />
            Saved
          </span>
        )}
      </div>

      {/* ---- Toolbar (only when editor has content) ---- */}
      {items.length > 0 && (
        <div className="flex items-center border-b border-border px-4 py-1">
          <EditorToolbar editor={editor} />
        </div>
      )}

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
            /* Tiptap editor on a white "paper" card */
            <div className="rounded-lg border border-border bg-background p-8 shadow-sm">
              <TiptapEditor
                ref={editorRef}
                content={editorContent}
                isGenerating={isGenerating}
                onUpdate={handleEditorUpdate}
              />

              {/* Generating spinner at the bottom */}
              {isGenerating && items.length > 0 && (
                <div className="mt-6 flex items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
