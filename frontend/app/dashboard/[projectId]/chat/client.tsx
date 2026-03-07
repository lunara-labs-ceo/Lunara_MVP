"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  History,
  FileCode,
  Table2,
  MessageSquare,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ResizeHandle } from "@/components/chat/resize-handle";
import { ChatPanel } from "@/components/chat/chat-panel";
import { SqlEditorPanel } from "@/components/chat/sql-editor-panel";
import { useResize } from "@/hooks/use-resize";
import { useApiClient } from "@/lib/api";
import { useChatStream } from "@/hooks/use-chat-stream";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { SaveArtifactDialog } from "@/components/chat/save-artifact-dialog";
import type { ChatMessage, ChatSession, ChatArtifact, SemanticModel, EditorTab } from "@/types/chat";

const SIDEBAR_WIDTH_EXPANDED = 240;
const SIDEBAR_WIDTH_COLLAPSED = 40;
const CHAT_DEFAULT_WIDTH = 380;
const CHAT_MIN_WIDTH = 280;
const CHAT_MAX_WIDTH = 600;

export function ChatClient() {
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

  const {
    size: resultsHeight,
    isDragging: isResultsDragging,
    handleMouseDown: handleResultsMouseDown,
  } = useResize({
    direction: "horizontal",
    initialSize: 250,
    minSize: 100,
    maxSize: 500,
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
    sendMessage: streamSendMessage,
    isStreaming,
    streamingText,
    streamingThinking,
    isThinkingStreaming,
    generatedSql,
    abortStream,
  } = useChatStream();

  // Message history
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Editor tab state
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([
    { id: 1, name: "Query 1", sql: "", results: null, rowCount: 0, queryStatus: "ready" },
  ]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const tabIdCounter = useRef(1);

  // Prerequisites (loaded on mount)
  const [dataSourceId, setDataSourceId] = useState<string | null>(null);
  const [semanticModel, setSemanticModel] = useState<SemanticModel | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingPrereqs, setIsLoadingPrereqs] = useState(true);
  const [prereqError, setPrereqError] = useState<string | null>(null);

  // Sidebar data
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [artifacts, setArtifacts] = useState<ChatArtifact[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  // Load data source + semantic model on mount
  useEffect(() => {
    let cancelled = false;

    async function loadPrereqs() {
      setIsLoadingPrereqs(true);
      setPrereqError(null);

      // 1. Resolve data source ID (localStorage first, then API fallback)
      let resolvedDsId = localStorage.getItem("lunara_data_source_id");
      if (!resolvedDsId) {
        try {
          const connections = await fetchApi<{ id: string; status: string }[]>(
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
        setPrereqError("No connected data source found. Connect a database in Data Sources first.");
        setIsLoadingPrereqs(false);
        return;
      }
      setDataSourceId(resolvedDsId);

      // 2. Load semantic model (non-blocking — 404 is OK, agent works without it)
      try {
        const data = await fetchApi<{ model: SemanticModel }>(
          `/api/v1/semantic/model?project_id=${encodeURIComponent(projectId)}`
        );
        if (!cancelled && data?.model) setSemanticModel(data.model);
      } catch (err) {
        // 404 = no model yet — that's fine
        if (err instanceof Error && !err.message.includes("404")) {
          console.error("Failed to load semantic model:", err);
        }
      }

      if (!cancelled) setIsLoadingPrereqs(false);
    }

    loadPrereqs();
    return () => { cancelled = true; };
  }, [projectId, fetchApi]);

  // Load sessions + artifacts once prereqs finish
  useEffect(() => {
    if (!projectId || isLoadingPrereqs) return;

    // Load sessions
    fetchApi<ChatSession[]>(
      `/api/v1/chat/sessions?project_id=${encodeURIComponent(projectId)}`
    )
      .then((data) => setSessions(data || []))
      .catch((err) => console.error("Failed to load sessions:", err));

    // Load artifacts
    fetchApi<ChatArtifact[]>(
      `/api/v1/chat/artifacts?project_id=${encodeURIComponent(projectId)}`
    )
      .then((data) => setArtifacts(data || []))
      .catch((err) => console.error("Failed to load artifacts:", err));
  }, [projectId, isLoadingPrereqs, fetchApi]);

  // ---- Session management callbacks ----

  const handleSessionSelect = useCallback(
    async (session: ChatSession) => {
      setSessionId(session.id);
      try {
        const fullSession = await fetchApi<ChatSession>(
          `/api/v1/chat/sessions/${session.id}`
        );
        const msgs =
          typeof fullSession.messages === "string"
            ? JSON.parse(fullSession.messages)
            : fullSession.messages;
        setMessages(msgs || []);
      } catch (err) {
        console.error("Failed to load session:", err);
      }
    },
    [fetchApi]
  );

  const handleSessionCreate = useCallback(async () => {
    try {
      const session = await fetchApi<ChatSession>("/api/v1/chat/sessions", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          name: "New Chat",
        }),
      });
      setSessionId(session.id);
      setMessages([]);
      setSessions((prev) => [session, ...prev]);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }, [projectId, fetchApi]);

  const handleSessionDelete = useCallback(
    async (sessionIdToDelete: string) => {
      try {
        await fetchApi(`/api/v1/chat/sessions/${sessionIdToDelete}`, {
          method: "DELETE",
        });
        setSessions((prev) => prev.filter((s) => s.id !== sessionIdToDelete));
        if (sessionIdToDelete === sessionId) {
          setSessionId(null);
          setMessages([]);
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    },
    [sessionId, fetchApi]
  );

  // ---- Artifact callbacks ----

  const handleArtifactSelect = useCallback((artifact: ChatArtifact) => {
    tabIdCounter.current += 1;
    const newTab: EditorTab = {
      id: tabIdCounter.current,
      name: artifact.title.slice(0, 20) || `Query ${tabIdCounter.current}`,
      sql: artifact.sql,
      results: null,
      rowCount: 0,
      queryStatus: "ready",
    };
    setEditorTabs((prev) => {
      setActiveTabIndex(prev.length);
      return [...prev, newTab];
    });
  }, []);

  const handleArtifactDelete = useCallback(
    async (artifactId: string) => {
      try {
        await fetchApi(`/api/v1/chat/artifacts/${artifactId}`, {
          method: "DELETE",
        });
        setArtifacts((prev) => prev.filter((a) => a.id !== artifactId));
      } catch (err) {
        console.error("Failed to delete artifact:", err);
      }
    },
    [fetchApi]
  );

  const handleSaveArtifact = useCallback(
    async (title: string) => {
      const tab = editorTabs[activeTabIndex];
      if (!tab?.results || !dataSourceId) return;

      try {
        const artifact = await fetchApi<ChatArtifact>(
          "/api/v1/chat/artifacts",
          {
            method: "POST",
            body: JSON.stringify({
              project_id: projectId,
              title,
              sql: tab.sql,
              data: tab.results,
              session_id: sessionId,
            }),
          }
        );
        setArtifacts((prev) => [artifact, ...prev]);
        setSaveDialogOpen(false);
      } catch (err) {
        console.error("Failed to save artifact:", err);
      }
    },
    [editorTabs, activeTabIndex, dataSourceId, projectId, sessionId, fetchApi]
  );

  const handleSendMessage = useCallback(async (text: string) => {
    if (!dataSourceId || isStreaming) return;

    // 1. Auto-create session on first message
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      try {
        const session = await fetchApi<ChatSession>(
          "/api/v1/chat/sessions",
          {
            method: "POST",
            body: JSON.stringify({
              project_id: projectId,
              name: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
            }),
          }
        );
        activeSessionId = session.id;
        setSessionId(session.id);
        setSessions((prev) => [session, ...prev]);
      } catch (err) {
        console.error("Failed to create session:", err);
        // Proceed anyway — chat still works without persistence
      }
    }

    // 2. Snapshot current messages, add user message to UI
    const currentMessages = messagesRef.current;
    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 3. Stream response from backend
    const result = await streamSendMessage(text, {
      dataSourceId,
      semanticModel,
      sessionId: activeSessionId,
      history: currentMessages,
    });

    // 4. Finalize — add completed assistant message
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: result.fullText,
      thinking: result.thinkingText || null,
      sql: result.generatedSql || null,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    // 5. Persist session (fire-and-forget)
    if (activeSessionId) {
      const allMsgs = [...currentMessages, userMsg, assistantMsg];
      fetchApi(`/api/v1/chat/sessions/${activeSessionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          messages: allMsgs.map((m) => ({
            role: m.role,
            content: m.content,
            sql: m.sql || null,
          })),
        }),
      }).catch((err) => console.error("Failed to persist session:", err));

      // Update sessions list with latest name
      setSessions((prev) => {
        const existing = prev.find((s) => s.id === activeSessionId);
        if (existing) {
          return prev.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  name: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
                  updated_at: new Date().toISOString(),
                }
              : s
          );
        }
        return prev;
      });
    }
  }, [dataSourceId, isStreaming, sessionId, projectId, semanticModel, fetchApi, streamSendMessage]);

  // ---- Editor tab management callbacks ----

  const handleTabSwitch = useCallback((index: number) => {
    setActiveTabIndex(index);
  }, []);

  const handleTabClose = useCallback((index: number) => {
    setEditorTabs((prev) => {
      if (prev.length === 1) {
        // Last tab — clear it instead of closing
        return [{ id: prev[0].id, name: prev[0].name, sql: "", results: null, rowCount: 0, queryStatus: "ready" as const }];
      }
      return prev.filter((_, i) => i !== index);
    });
    setActiveTabIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return Math.max(0, prev - 1);
      return prev;
    });
  }, []);

  const handleTabAdd = useCallback(() => {
    tabIdCounter.current += 1;
    const newTab: EditorTab = {
      id: tabIdCounter.current,
      name: `Query ${tabIdCounter.current}`,
      sql: "",
      results: null,
      rowCount: 0,
      queryStatus: "ready",
    };
    setEditorTabs((prev) => {
      setActiveTabIndex(prev.length); // new tab is at end
      return [...prev, newTab];
    });
  }, []);

  const handleSqlChange = useCallback((sql: string) => {
    setEditorTabs((prev) =>
      prev.map((tab, i) => (i === activeTabIndex ? { ...tab, sql } : tab))
    );
  }, [activeTabIndex]);

  const handleRunQuery = useCallback(async () => {
    const tab = editorTabs[activeTabIndex];
    if (!tab?.sql.trim() || !dataSourceId) return;

    // Set running status
    setEditorTabs((prev) =>
      prev.map((t, i) =>
        i === activeTabIndex
          ? { ...t, queryStatus: "running" as const, results: null, rowCount: 0, errorMessage: null }
          : t
      )
    );

    try {
      const result = await fetchApi<{ success: boolean; data?: Record<string, unknown>[]; error?: string }>(
        `/api/v1/chat/execute?data_source_id=${encodeURIComponent(dataSourceId)}`,
        {
          method: "POST",
          body: JSON.stringify({ sql: tab.sql }),
        }
      );

      if (result.success && result.data) {
        setEditorTabs((prev) =>
          prev.map((t, i) =>
            i === activeTabIndex
              ? { ...t, queryStatus: "complete" as const, results: result.data!, rowCount: result.data!.length }
              : t
          )
        );
      } else {
        setEditorTabs((prev) =>
          prev.map((t, i) =>
            i === activeTabIndex
              ? { ...t, queryStatus: "error" as const, errorMessage: result.error || "Query failed" }
              : t
          )
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Query execution failed";
      setEditorTabs((prev) =>
        prev.map((t, i) =>
          i === activeTabIndex
            ? { ...t, queryStatus: "error" as const, errorMessage: errorMsg }
            : t
        )
      );
    }
  }, [editorTabs, activeTabIndex, dataSourceId, fetchApi]);

  const handleClearEditor = useCallback(() => {
    setEditorTabs((prev) =>
      prev.map((tab, i) =>
        i === activeTabIndex
          ? { ...tab, sql: "", results: null, rowCount: 0, queryStatus: "ready" as const, errorMessage: null }
          : tab
      )
    );
  }, [activeTabIndex]);

  const handleRunSqlFromChat = useCallback((sql: string) => {
    // Put SQL in the active tab
    setEditorTabs((prev) =>
      prev.map((tab, i) =>
        i === activeTabIndex ? { ...tab, sql, results: null, rowCount: 0, queryStatus: "ready" as const } : tab
      )
    );
  }, [activeTabIndex]);

  // Auto-populate editor when agent generates SQL
  useEffect(() => {
    if (generatedSql) {
      setEditorTabs((prev) =>
        prev.map((tab, i) =>
          i === activeTabIndex ? { ...tab, sql: generatedSql, queryStatus: "ready" as const } : tab
        )
      );
    }
  }, [generatedSql, activeTabIndex]);

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
            <ChatSidebar
              sessions={sessions}
              activeSessionId={sessionId}
              onSessionSelect={handleSessionSelect}
              onSessionCreate={handleSessionCreate}
              onSessionDelete={handleSessionDelete}
              artifacts={artifacts}
              onArtifactSelect={handleArtifactSelect}
              onArtifactDelete={handleArtifactDelete}
              semanticModel={semanticModel}
              isCollapsed={false}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-3">
              <CollapsedIcon icon={History} label="Sessions" />
              <CollapsedIcon icon={FileCode} label="Artifacts" />
              <CollapsedIcon icon={Table2} label="Tables" />
            </div>
          )}
        </div>
      </aside>

      {/* ---- Center Panel (SQL Editor) ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {isLoadingPrereqs ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : prereqError ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="text-center space-y-3">
              <AlertCircle className="size-8 text-destructive mx-auto" />
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
          <SqlEditorPanel
            tabs={editorTabs}
            activeTabIndex={activeTabIndex}
            onTabSwitch={handleTabSwitch}
            onTabClose={handleTabClose}
            onTabAdd={handleTabAdd}
            onSqlChange={handleSqlChange}
            onRunQuery={handleRunQuery}
            onClearEditor={handleClearEditor}
            onSaveArtifact={() => setSaveDialogOpen(true)}
            resultsHeight={resultsHeight}
            isResultsDragging={isResultsDragging}
            onResultsMouseDown={handleResultsMouseDown}
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
          <MessageSquare className="size-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Luna</span>
        </div>
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          streamingText={streamingText}
          streamingThinking={streamingThinking}
          isThinkingStreaming={isThinkingStreaming}
          onSendMessage={handleSendMessage}
          onRunSql={handleRunSqlFromChat}
          onStopStreaming={abortStream}
        />
      </div>

      {/* ---- Save Artifact Dialog ---- */}
      <SaveArtifactDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSaveArtifact}
        defaultTitle={
          editorTabs[activeTabIndex]?.sql.split("\n")[0]?.slice(0, 50) ||
          "Untitled Query"
        }
      />
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
