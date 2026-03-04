"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Sparkles,
  Play,
  Save,
  RefreshCw,
  Table2,
  Link2,
  Clock,
  Hash,
  Type,
  MessageSquare,
  ChevronRight,
  Loader2,
  CheckCircle,
  Layers,
  AlertCircle,
} from "lucide-react";
import { useApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SemanticColumn {
  name: string;
  type: string;
  description: string | null;
  semantic_type: "dimension" | "measure" | "time";
  aggregation: string | null;
}

interface SemanticTable {
  table_id: string;
  name: string;
  description?: string | null;
  columns: SemanticColumn[];
}

interface Relationship {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  relationship_type: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

interface SemanticModelData {
  tables: SemanticTable[];
}

interface StreamMessage {
  content: string;
  type: "text" | "status" | "phase" | "done" | "complete" | "error";
}

type TabKey = "dimensions" | "measures" | "time" | "relationships";

const AGGREGATION_OPTIONS = [
  "SUM",
  "AVG",
  "COUNT",
  "MIN",
  "MAX",
  "COUNT_DISTINCT",
] as const;

const SEMANTIC_TYPE_OPTIONS: { value: SemanticColumn["semantic_type"]; label: string }[] = [
  { value: "dimension", label: "Dimension" },
  { value: "measure", label: "Measure" },
  { value: "time", label: "Time" },
];

const TAB_CONFIG: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "dimensions", label: "Dimensions", icon: Type },
  { key: "measures", label: "Measures", icon: Hash },
  { key: "time", label: "Time", icon: Clock },
  { key: "relationships", label: "Relationships", icon: Link2 },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SemanticLayerPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const { fetchApi, fetchApiStream } = useApiClient();

  // -- State ----------------------------------------------------------------

  const [model, setModel] = useState<SemanticModelData | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [selectedTableIndex, setSelectedTableIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("dimensions");
  const [existingModelId, setExistingModelId] = useState<string | null>(null);

  // Streaming / generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamMessages, setStreamMessages] = useState<StreamMessage[]>([]);
  const [agentStatus, setAgentStatus] = useState("Waiting to start...");

  // Save
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Loading
  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selected tables from localStorage
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [dataSourceId, setDataSourceId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // -- Auto-scroll chat output ----------------------------------------------

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamMessages]);

  // -- Load selected tables from localStorage -------------------------------

  useEffect(() => {
    const stored = localStorage.getItem("lunara_selected_tables");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setSelectedTables(parsed);
      } catch {
        // ignore parse errors
      }
    }

    const storedDsId = localStorage.getItem("lunara_data_source_id");
    if (storedDsId) setDataSourceId(storedDsId);
  }, []);

  // -- Update agent status based on table count -----------------------------

  useEffect(() => {
    if (!isLoadingModel && !model && selectedTables.length > 0) {
      setAgentStatus(`${selectedTables.length} tables ready for analysis`);
    } else if (!isLoadingModel && !model && selectedTables.length === 0) {
      setAgentStatus("No tables selected. Go back to Schema Browser.");
    }
  }, [isLoadingModel, model, selectedTables.length]);

  // -- Load existing model from API -----------------------------------------

  const loadExistingModel = useCallback(async () => {
    if (!projectId) return;

    setIsLoadingModel(true);
    setLoadError(null);

    try {
      const data = await fetchApi<{
        id: string;
        model: { tables: SemanticTable[]; relationships?: Relationship[] };
      } | null>(`/api/v1/semantic/model?project_id=${encodeURIComponent(projectId)}`);

      if (data && data.model) {
        setExistingModelId(data.id);
        setModel({ tables: data.model.tables || [] });
        setRelationships(data.model.relationships || []);
        setAgentStatus(`Loaded saved model (${data.model.tables?.length || 0} tables)`);
      }
    } catch (err) {
      // 404 means no model yet -- that's fine
      if (err instanceof Error && err.message.includes("404")) {
        // No model saved yet, show blank state
      } else {
        console.error("Failed to load semantic model:", err);
        setLoadError(
          err instanceof Error ? err.message : "Failed to load model."
        );
      }
    } finally {
      setIsLoadingModel(false);
    }
  }, [projectId, fetchApi]);

  useEffect(() => {
    loadExistingModel();
  }, [loadExistingModel]);

  // -- Start generation (SSE stream) ----------------------------------------

  async function startGeneration() {
    if (isGenerating || selectedTables.length === 0) return;
    if (!dataSourceId) {
      setStreamMessages([
        {
          content:
            "No data source selected. Please connect a data source and select tables from the Schema Browser first.",
          type: "error",
        },
      ]);
      return;
    }

    setIsGenerating(true);
    setStreamMessages([]);
    setModel(null);
    setRelationships([]);
    setAgentStatus("Processing...");
    setSelectedTableIndex(0);

    try {
      const response = await fetchApiStream(
        `/api/v1/semantic/generate?data_source_id=${encodeURIComponent(dataSourceId)}`,
        {
          method: "POST",
          body: JSON.stringify({ tables: selectedTables }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              handleStreamEvent(data);
            } catch {
              // ignore unparseable lines
            }
          }
        }
      }

      setAgentStatus("Generation complete!");
    } catch (err) {
      console.error("Generation error:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setStreamMessages((prev) => [
        ...prev,
        { content: `Failed to connect: ${msg}`, type: "error" },
      ]);
      setAgentStatus("Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleStreamEvent(data: { type: string; content?: string; data?: Record<string, unknown> }) {
    switch (data.type) {
      case "text":
      case "status":
      case "phase":
      case "done":
      case "complete":
      case "error":
        setStreamMessages((prev) => [
          ...prev,
          { content: data.content || "", type: data.type as StreamMessage["type"] },
        ]);
        break;
      case "model":
        if (data.data) {
          const modelData = data.data as unknown as SemanticModelData;
          setModel(modelData);
          setStreamMessages((prev) => [
            ...prev,
            {
              content: `Generated semantic model with ${modelData.tables?.length || 0} tables`,
              type: "status",
            },
          ]);
        }
        break;
      case "relationships":
        if (data.data && (data.data as Record<string, unknown>).relationships) {
          const rels = (data.data as { relationships: Relationship[] }).relationships;
          setRelationships(rels);
          setStreamMessages((prev) => [
            ...prev,
            {
              content: `Detected ${rels.length} relationships`,
              type: "status",
            },
          ]);
        }
        break;
    }
  }

  // -- Save model -----------------------------------------------------------

  async function saveModel() {
    if (!model?.tables?.length || !projectId) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await fetchApi("/api/v1/semantic/model", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          model: {
            tables: model.tables,
            relationships,
          },
        }),
      });

      setSaveSuccess(true);
      setAgentStatus("Model saved!");
      setStreamMessages((prev) => [
        ...prev,
        { content: "Semantic model saved to database!", type: "done" },
      ]);

      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Save error:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setStreamMessages((prev) => [
        ...prev,
        { content: `Failed to save: ${msg}`, type: "error" },
      ]);
    } finally {
      setIsSaving(false);
    }
  }

  // -- Column editing -------------------------------------------------------

  function updateColumn(
    tableIndex: number,
    columnName: string,
    field: keyof SemanticColumn,
    value: string | null
  ) {
    setModel((prev) => {
      if (!prev) return prev;
      const tables = [...prev.tables];
      const table = { ...tables[tableIndex] };
      const columns = [...table.columns];
      const colIdx = columns.findIndex((c) => c.name === columnName);
      if (colIdx === -1) return prev;

      const col = { ...columns[colIdx] };

      if (field === "semantic_type") {
        col.semantic_type = value as SemanticColumn["semantic_type"];
        if (value === "measure" && !col.aggregation) {
          col.aggregation = "SUM";
        } else if (value !== "measure") {
          col.aggregation = null;
        }
      } else if (field === "description") {
        col.description = value;
      } else if (field === "aggregation") {
        col.aggregation = value;
      }

      columns[colIdx] = col;
      table.columns = columns;
      tables[tableIndex] = table;
      return { tables };
    });
  }

  // -- Derived data ---------------------------------------------------------

  const currentTable = model?.tables?.[selectedTableIndex] ?? null;

  const dimensions = currentTable?.columns.filter((c) => c.semantic_type === "dimension") ?? [];
  const measures = currentTable?.columns.filter((c) => c.semantic_type === "measure") ?? [];
  const timeColumns = currentTable?.columns.filter((c) => c.semantic_type === "time") ?? [];
  const tableRelationships = currentTable
    ? relationships.filter(
        (r) => r.from_table === currentTable.table_id || r.to_table === currentTable.table_id
      )
    : [];

  const tabCounts: Record<TabKey, number> = {
    dimensions: dimensions.length,
    measures: measures.length,
    time: timeColumns.length,
    relationships: tableRelationships.length,
  };

  // -- Render helpers -------------------------------------------------------

  function getMessageIcon(type: StreamMessage["type"]) {
    switch (type) {
      case "error": return "x";
      case "status": return "~";
      case "done": return "+";
      case "complete": return "*";
      case "phase": return ">";
      default: return "-";
    }
  }

  function getMessageColor(type: StreamMessage["type"]) {
    switch (type) {
      case "error": return "text-red-400";
      case "status": return "text-amber-400";
      case "done": return "text-green-400";
      case "complete": return "text-green-400";
      case "phase": return "text-blue-400";
      default: return "text-zinc-400";
    }
  }

  // -- Render: Loading state ------------------------------------------------

  if (isLoadingModel) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <Skeleton className="h-7 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
        <div className="grid grid-cols-[280px_1fr] gap-6">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  // -- Render: Error state --------------------------------------------------

  if (loadError) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Semantic Layer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate and manage your semantic layer for AI-powered analytics.
          </p>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-3">
          <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Failed to load model</p>
            <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => loadExistingModel()}
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // -- Render: Main page ----------------------------------------------------

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Semantic Layer
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate and configure your semantic layer from selected tables.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/dashboard/${projectId}/chat`)}
        >
          <MessageSquare className="size-3.5" />
          Query Agent
        </Button>
      </div>

      {/* AI Analysis panel */}
      <section className="rounded-xl border bg-card">
        <div className="flex items-center gap-3 p-4 border-b">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">AI Analysis</p>
            <p className="text-xs text-muted-foreground truncate">{agentStatus}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!model?.tables?.length || isSaving}
              onClick={saveModel}
            >
              {isSaving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : saveSuccess ? (
                <CheckCircle className="size-3.5" />
              ) : (
                <Save className="size-3.5" />
              )}
              {isSaving
                ? "Saving..."
                : saveSuccess
                  ? "Saved!"
                  : existingModelId
                    ? "Update Layer"
                    : "Save Layer"}
            </Button>
            <Button
              size="sm"
              disabled={isGenerating || selectedTables.length === 0}
              onClick={startGeneration}
            >
              {isGenerating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : model ? (
                <RefreshCw className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
              {isGenerating
                ? "Generating..."
                : model
                  ? "Regenerate"
                  : "Start Generation"}
            </Button>
          </div>
        </div>

        {/* Chat output */}
        <div className="bg-zinc-950 dark:bg-zinc-900/50 rounded-b-xl">
          <ScrollArea className="h-56">
            <div className="p-4 font-mono text-[13px] leading-relaxed space-y-0.5">
              {streamMessages.length === 0 && (
                <p className="text-zinc-500 italic">
                  {selectedTables.length > 0
                    ? 'Click "Start Generation" to begin analyzing your tables...'
                    : "No tables selected. Go to Schema Browser to pick tables."}
                </p>
              )}
              {streamMessages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${getMessageColor(msg.type)}`}>
                  <span className="shrink-0 select-none">{getMessageIcon(msg.type)}</span>
                  <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                </div>
              ))}
              {isGenerating && (
                <span className="inline-block text-green-400 animate-pulse">
                  _
                </span>
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
        </div>
      </section>

      {/* Content layout: sidebar + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 min-h-[500px]">
        {/* Models sidebar */}
        <div className="rounded-xl border bg-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Generated Models
            </span>
            <Badge variant="secondary" className="text-[11px]">
              {model?.tables?.length ?? 0} tables
            </Badge>
          </div>

          <ScrollArea className="flex-1">
            {!model?.tables?.length ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <Table2 className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  No models generated yet
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Run generation to analyze your tables
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {model.tables.map((table, index) => {
                  const tableName =
                    table.name || table.table_id.split(".").pop() || table.table_id;
                  const isActive = index === selectedTableIndex;
                  return (
                    <button
                      key={table.table_id}
                      onClick={() => {
                        setSelectedTableIndex(index);
                        setActiveTab("dimensions");
                      }}
                      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        isActive
                          ? "bg-primary/8 border border-primary/20 dark:bg-primary/10"
                          : "hover:bg-muted border border-transparent"
                      }`}
                    >
                      <Table2
                        className={`size-4 shrink-0 ${
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground/50"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm truncate ${
                            isActive ? "font-medium" : "text-foreground/80"
                          }`}
                        >
                          {tableName}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {table.columns?.length ?? 0} columns
                        </p>
                      </div>
                      {isActive && (
                        <ChevronRight className="size-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Detail panel */}
        <div className="rounded-xl border bg-card flex flex-col overflow-hidden">
          {!currentTable ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 px-4 text-center">
              <Layers className="size-14 text-muted-foreground/20 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">
                No Table Selected
              </h3>
              <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">
                Run generation to analyze your tables, then select one from the
                sidebar to view and edit its columns.
              </p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b">
                <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/50">
                  <Table2 className="size-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold truncate">
                    {currentTable.name ||
                      currentTable.table_id.split(".").pop()}
                  </h2>
                  <p className="text-xs text-muted-foreground font-mono">
                    {currentTable.table_id}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b px-5 overflow-x-auto">
                {TAB_CONFIG.map((tab) => {
                  const isActive = activeTab === tab.key;
                  const count = tabCounts[tab.key];
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-2 px-1 py-3 mr-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        isActive
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground/80"
                      }`}
                    >
                      <tab.icon className="size-3.5" />
                      {tab.label}
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <ScrollArea className="flex-1">
                <div className="p-5 space-y-2.5">
                  {/* Dimensions tab */}
                  {activeTab === "dimensions" && (
                    <>
                      {dimensions.length === 0 ? (
                        <EmptyTabState label="dimensions" />
                      ) : (
                        dimensions.map((col) => (
                          <ColumnCard
                            key={col.name}
                            column={col}
                            tableIndex={selectedTableIndex}
                            onUpdate={updateColumn}
                          />
                        ))
                      )}
                    </>
                  )}

                  {/* Measures tab */}
                  {activeTab === "measures" && (
                    <>
                      {measures.length === 0 ? (
                        <EmptyTabState label="measures" />
                      ) : (
                        measures.map((col) => (
                          <ColumnCard
                            key={col.name}
                            column={col}
                            tableIndex={selectedTableIndex}
                            onUpdate={updateColumn}
                            showAggregation
                          />
                        ))
                      )}
                    </>
                  )}

                  {/* Time tab */}
                  {activeTab === "time" && (
                    <>
                      {timeColumns.length === 0 ? (
                        <EmptyTabState label="time columns" />
                      ) : (
                        timeColumns.map((col) => (
                          <ColumnCard
                            key={col.name}
                            column={col}
                            tableIndex={selectedTableIndex}
                            onUpdate={updateColumn}
                          />
                        ))
                      )}
                    </>
                  )}

                  {/* Relationships tab */}
                  {activeTab === "relationships" && (
                    <>
                      {tableRelationships.length === 0 ? (
                        <EmptyTabState label="relationships" />
                      ) : (
                        tableRelationships.map((rel, i) => (
                          <RelationshipCard key={i} relationship={rel} />
                        ))
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyTabState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-muted-foreground">No {label} found</p>
    </div>
  );
}

function ColumnCard({
  column,
  tableIndex,
  onUpdate,
  showAggregation = false,
}: {
  column: SemanticColumn;
  tableIndex: number;
  onUpdate: (
    tableIndex: number,
    columnName: string,
    field: keyof SemanticColumn,
    value: string | null
  ) => void;
  showAggregation?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3.5 transition-colors hover:border-primary/30">
      {/* Column name + data type */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-sm font-semibold">{column.name}</span>
        <span className="text-[11px] font-mono bg-background px-1.5 py-0.5 rounded text-muted-foreground">
          {column.type}
        </span>
      </div>

      {/* Description input */}
      <input
        type="text"
        placeholder="Add description..."
        defaultValue={column.description || ""}
        onBlur={(e) =>
          onUpdate(tableIndex, column.name, "description", e.target.value || null)
        }
        className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 mb-2.5"
      />

      {/* Controls row */}
      <div className="flex items-center gap-2">
        <select
          value={column.semantic_type}
          onChange={(e) =>
            onUpdate(
              tableIndex,
              column.name,
              "semantic_type",
              e.target.value
            )
          }
          className="rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 cursor-pointer"
        >
          {SEMANTIC_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {(showAggregation || column.semantic_type === "measure") && (
          <select
            value={column.aggregation || "SUM"}
            onChange={(e) =>
              onUpdate(tableIndex, column.name, "aggregation", e.target.value)
            }
            className="rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 cursor-pointer"
          >
            {AGGREGATION_OPTIONS.map((agg) => (
              <option key={agg} value={agg}>
                {agg}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function RelationshipCard({ relationship }: { relationship: Relationship }) {
  const fromTable = relationship.from_table.split(".").pop() || relationship.from_table;
  const toTable = relationship.to_table.split(".").pop() || relationship.to_table;

  const confidenceStyles: Record<string, string> = {
    high: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    low: "bg-muted text-muted-foreground",
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3.5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="size-4 text-primary" />
        <span className="text-sm font-semibold">{relationship.relationship_type}</span>
        <span
          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
            confidenceStyles[relationship.confidence] || confidenceStyles.low
          }`}
        >
          {relationship.confidence}
        </span>
      </div>

      {/* Path */}
      <div className="font-mono text-[13px] text-foreground/80">
        <span className="text-primary">{fromTable}</span>
        .<span className="font-bold">{relationship.from_column}</span>
        <span className="mx-2 text-muted-foreground/40">&rarr;</span>
        <span className="text-primary">{toTable}</span>
        .<span className="font-bold">{relationship.to_column}</span>
      </div>

      {/* Reasoning */}
      {relationship.reasoning && (
        <p className="text-xs text-muted-foreground/60 mt-2 italic leading-relaxed">
          {relationship.reasoning}
        </p>
      )}
    </div>
  );
}
