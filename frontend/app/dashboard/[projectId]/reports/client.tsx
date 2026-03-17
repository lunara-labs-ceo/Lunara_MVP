"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  History,
  FileCode,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ResizeHandle } from "@/components/chat/resize-handle";
import { ReportChatPanel } from "@/components/reports/report-chat-panel";
import { ReportSidebar } from "@/components/reports/report-sidebar";
import { DocumentCanvas } from "@/components/reports/document-canvas";
import { useResize } from "@/hooks/use-resize";
import { useApiClient } from "@/lib/api";
import { useReportStream } from "@/hooks/use-report-stream";
import type { ReportMessage, ReportSession, ReportItem } from "@/types/report";
import type { ChatArtifact } from "@/types/chat";

const SIDEBAR_WIDTH_EXPANDED = 240;
const SIDEBAR_WIDTH_COLLAPSED = 40;
const CHAT_DEFAULT_WIDTH = 380;
const CHAT_MIN_WIDTH = 280;
const CHAT_MAX_WIDTH = 600;

export function ReportClient() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    size: chatWidth,
    isDragging: isChatDragging,
    handleMouseDown: handleChatMouseDown,
  } = useResize({
    direction: "vertical",
    initialSize: CHAT_DEFAULT_WIDTH,
    minSize: CHAT_MIN_WIDTH,
    maxSize: CHAT_MAX_WIDTH,
    reverse: true,
  });

  // URL params & routing
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();

  // API client (Clerk-authenticated)
  const { fetchApi } = useApiClient();

  // Streaming hook (SSE)
  const {
    sendPrompt,
    isStreaming,
    streamingText,
    streamingCodeBlocks,
    statusText,
    abortStream,
  } = useReportStream();

  // Message history
  const [messages, setMessages] = useState<ReportMessage[]>([]);
  const messagesRef = useRef<ReportMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Report state
  const [reportItems, setReportItems] = useState<ReportItem[]>([]);
  const [reportTitle, setReportTitle] = useState("Untitled Report");

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ReportSession[]>([]);
  const [artifacts, setArtifacts] = useState<ChatArtifact[]>([]);

  // Prerequisites
  const [dataSourceId, setDataSourceId] = useState<string | null>(null);
  const [isLoadingPrereqs, setIsLoadingPrereqs] = useState(true);
  const [prereqError, setPrereqError] = useState<string | null>(null);

  // ---------- Load prerequisites on mount ----------

  useEffect(() => {
    let cancelled = false;

    async function loadPrereqs() {
      setIsLoadingPrereqs(true);
      setPrereqError(null);

      // Resolve data source ID (localStorage first, then API fallback)
      let resolvedDsId = localStorage.getItem("lunara_data_source_id");
      if (!resolvedDsId) {
        try {
          const connections = await fetchApi<
            { id: string; status: string }[]
          >(
            `/api/v1/connections?project_id=${encodeURIComponent(projectId)}`
          );
          const connected = connections.find((c) => c.status === "connected");
          if (connected) resolvedDsId = connected.id;
        } catch (err) {
          console.error("Failed to load connections:", err);
        }
      }

      if (cancelled) return;

      if (!resolvedDsId) {
        setPrereqError(
          "No connected data source found. Connect a database in Data Sources first."
        );
        setIsLoadingPrereqs(false);
        return;
      }
      setDataSourceId(resolvedDsId);
      if (!cancelled) setIsLoadingPrereqs(false);
    }

    loadPrereqs();
    return () => {
      cancelled = true;
    };
  }, [projectId, fetchApi]);

  // ---------- Load sessions + artifacts once prereqs finish ----------

  useEffect(() => {
    if (!projectId || isLoadingPrereqs) return;

    // Load report sessions
    fetchApi<ReportSession[]>(
      `/api/v1/reports/sessions?project_id=${encodeURIComponent(projectId)}`
    )
      .then((data) => setSessions(data || []))
      .catch((err) => console.error("Failed to load report sessions:", err));

    // Load chat artifacts (these are available for report generation)
    fetchApi<ChatArtifact[]>(
      `/api/v1/chat/artifacts?project_id=${encodeURIComponent(projectId)}`
    )
      .then((data) => setArtifacts(data || []))
      .catch((err) => console.error("Failed to load artifacts:", err));
  }, [projectId, isLoadingPrereqs, fetchApi]);

  // ---------- Session management ----------

  const handleSessionSelect = useCallback(
    async (session: ReportSession) => {
      setSessionId(session.id);
      setReportTitle(session.name || "Untitled Report");

      // Load full session (messages)
      try {
        const fullSession = await fetchApi<ReportSession>(
          `/api/v1/reports/sessions/${session.id}`
        );
        const msgs =
          typeof fullSession.messages === "string"
            ? JSON.parse(fullSession.messages)
            : fullSession.messages;
        setMessages(msgs || []);
      } catch (err) {
        console.error("Failed to load session:", err);
        setMessages([]);
      }

      // Load report items
      try {
        const items = await fetchApi<ReportItem[]>(
          `/api/v1/reports/items?report_id=${session.id}`
        );
        setReportItems(items || []);
      } catch (err) {
        console.error("Failed to load report items:", err);
        setReportItems([]);
      }
    },
    [fetchApi]
  );

  const handleSessionCreate = useCallback(async () => {
    try {
      const session = await fetchApi<ReportSession>(
        "/api/v1/reports/sessions",
        {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            name: "New Chat",
          }),
        }
      );
      setSessionId(session.id);
      setMessages([]);
      setReportItems([]);
      setReportTitle("Untitled Report");
      setSessions((prev) => [session, ...prev]);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }, [projectId, fetchApi]);

  const handleSessionDelete = useCallback(
    async (sessionIdToDelete: string) => {
      try {
        await fetchApi(`/api/v1/reports/sessions/${sessionIdToDelete}`, {
          method: "DELETE",
        });
        setSessions((prev) =>
          prev.filter((s) => s.id !== sessionIdToDelete)
        );
        if (sessionIdToDelete === sessionId) {
          setSessionId(null);
          setMessages([]);
          setReportItems([]);
          setReportTitle("Untitled Report");
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    },
    [sessionId, fetchApi]
  );

  // ---------- Title management ----------

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setReportTitle(newTitle);
      if (sessionId) {
        fetchApi(`/api/v1/reports/sessions/${sessionId}`, {
          method: "PATCH",
          body: JSON.stringify({ name: newTitle }),
        }).catch((err) => console.error("Failed to save title:", err));

        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, name: newTitle } : s
          )
        );
      }
    },
    [sessionId, fetchApi]
  );

  // ---------- Item management ----------

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      try {
        await fetchApi(`/api/v1/reports/items/${itemId}`, {
          method: "DELETE",
        });
        setReportItems((prev) => prev.filter((item) => item.id !== itemId));
      } catch (err) {
        console.error("Failed to delete item:", err);
      }
    },
    [fetchApi]
  );

  const handleUpdateItem = useCallback(
    async (itemId: string, content: string) => {
      // Check item still exists in state (may have been replaced by a new generation)
      const exists = reportItems.some((item) => item.id === itemId);
      if (!exists) return;

      try {
        await fetchApi(`/api/v1/reports/items/${itemId}`, {
          method: "PATCH",
          body: JSON.stringify({ content }),
        });
        setReportItems((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, content } : item
          )
        );
      } catch {
        // Silently ignore — item may have been deleted by a report regeneration
      }
    },
    [fetchApi, reportItems]
  );

  // ---------- Send message ----------

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      // 1. Auto-create session if none exists
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        try {
          const session = await fetchApi<ReportSession>(
            "/api/v1/reports/sessions",
            {
              method: "POST",
              body: JSON.stringify({
                project_id: projectId,
                name:
                  text.slice(0, 50) + (text.length > 50 ? "..." : ""),
              }),
            }
          );
          activeSessionId = session.id;
          setSessionId(session.id);
          setReportTitle(session.name);
          setSessions((prev) => [session, ...prev]);
        } catch (err) {
          console.error("Failed to create session:", err);
        }
      }

      if (!activeSessionId) return;

      // 2. Snapshot current messages, add user message
      const currentMessages = messagesRef.current;
      const userMsg: ReportMessage = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // 3. Prepare artifacts for the request
      const artifactsForRequest = artifacts.map((a) => ({
        title: a.title,
        sql: a.sql,
        data: a.data,
      }));

      // 4. Stream response
      const result = await sendPrompt(text, {
        reportId: activeSessionId,
        artifacts: artifactsForRequest,
        history: currentMessages,
      });

      // 5. Add assistant message
      const assistantMsg: ReportMessage = {
        role: "assistant",
        content: result.fullText,
        codeBlocks:
          result.codeBlocks.length > 0 ? result.codeBlocks : null,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // 6. Process content items — REPLACE existing items (not append)
      // Save new items first (so canvas transitions atomically)
      const newItems: ReportItem[] = [];
      for (const item of result.contentItems) {
        try {
          const saved = await fetchApi<ReportItem>(
            "/api/v1/reports/items",
            {
              method: "POST",
              body: JSON.stringify({
                report_id: activeSessionId,
                type: item.type,
                title: item.title || "",
                content: item.content || "",
                position: newItems.length,
              }),
            }
          );
          newItems.push(saved);
        } catch (err) {
          console.error("Failed to save report item:", err);
          newItems.push(item);
        }
      }

      // Delete old items from backend (fire-and-forget)
      for (const existing of reportItems) {
        fetchApi(`/api/v1/reports/items/${existing.id}`, {
          method: "DELETE",
        }).catch((err) => console.error("Failed to delete old item:", err));
      }

      // Atomic state replacement
      setReportItems(newItems);

      // 7. Persist messages (fire-and-forget)
      const allMsgs = [...currentMessages, userMsg, assistantMsg];
      fetchApi(`/api/v1/reports/sessions/${activeSessionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          messages: allMsgs.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      }).catch((err) => console.error("Failed to persist session:", err));

      // 8. Update sessions list
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                name:
                  text.slice(0, 50) + (text.length > 50 ? "..." : ""),
                updated_at: new Date().toISOString(),
              }
            : s
        )
      );
    },
    [
      isStreaming,
      sessionId,
      projectId,
      artifacts,
      reportItems,
      fetchApi,
      sendPrompt,
    ]
  );

  // ---------- Layout ----------

  const sidebarWidth = sidebarOpen
    ? SIDEBAR_WIDTH_EXPANDED
    : SIDEBAR_WIDTH_COLLAPSED;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ---- Left Sidebar ---- */}
      <aside
        style={{ width: sidebarWidth }}
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-muted/30 transition-[width] duration-200"
        )}
      >
        {/* Sidebar header with toggle */}
        <div className="flex h-10 items-center justify-between border-b border-border px-2">
          {sidebarOpen && (
            <span className="truncate px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Explorer
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? (
              <ChevronLeft className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </Button>
        </div>

        {/* Sidebar body */}
        <div className="flex-1 overflow-y-auto">
          {sidebarOpen ? (
            <ReportSidebar
              sessions={sessions}
              activeSessionId={sessionId}
              onSessionSelect={handleSessionSelect}
              onSessionCreate={handleSessionCreate}
              onSessionDelete={handleSessionDelete}
              artifacts={artifacts}
              isCollapsed={false}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-3">
              <CollapsedIcon icon={History} label="Sessions" />
              <CollapsedIcon icon={FileCode} label="Artifacts" />
            </div>
          )}
        </div>
      </aside>

      {/* ---- Center Panel (Document Canvas) ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {isLoadingPrereqs ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : prereqError ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="space-y-3 text-center">
              <AlertCircle className="mx-auto size-8 text-destructive" />
              <p className="text-sm text-muted-foreground">{prereqError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(`/dashboard/${projectId}/data-sources`)
                }
              >
                Go to Data Sources
              </Button>
            </div>
          </div>
        ) : (
          <DocumentCanvas
            items={reportItems}
            title={reportTitle}
            onTitleChange={handleTitleChange}
            onDeleteItem={handleDeleteItem}
            onUpdateItem={handleUpdateItem}
            isGenerating={isStreaming}
          />
        )}
      </div>

      {/* ---- Resize Handle ---- */}
      <ResizeHandle
        direction="vertical"
        isDragging={isChatDragging}
        onMouseDown={handleChatMouseDown}
      />

      {/* ---- Right Chat Panel ---- */}
      <div
        style={{ width: chatWidth }}
        className="flex shrink-0 flex-col border-l border-border bg-background"
      >
        <div className="flex h-10 items-center gap-2 border-b border-border px-4">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            Quill
          </span>
        </div>
        <ReportChatPanel
          messages={messages}
          isStreaming={isStreaming}
          streamingText={streamingText}
          streamingCodeBlocks={streamingCodeBlocks}
          statusText={statusText}
          onSendMessage={handleSendMessage}
          onStopStreaming={abortStream}
        />
      </div>
    </div>
  );
}

/* ---------- Small helper components ---------- */

function CollapsedIcon({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground"
      aria-label={label}
    >
      <Icon className="size-3.5" />
    </Button>
  );
}
