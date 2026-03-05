"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";

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

interface PhaseState {
  status: "pending" | "active" | "complete" | "error";
  reasoningText: string;
  label: string;
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

  // Selected tables from localStorage
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [dataSourceId, setDataSourceId] = useState<string | null>(null);

  // Streaming / generation — phase-based state
  const [isGenerating, setIsGenerating] = useState(false);
  const INITIAL_PHASES: PhaseState[] = [
    { status: "pending", reasoningText: "", label: "Understanding your schema" },
    { status: "pending", reasoningText: "", label: "Discovering table connections" },
  ];
  const [phases, setPhases] = useState<PhaseState[]>(INITIAL_PHASES);
  const [activePhaseIndex, setActivePhaseIndex] = useState(-1);
  const activePhaseRef = useRef(-1); // ref mirror — always current inside event handler
  const [phaseStreaming, setPhaseStreaming] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Save
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Loading
  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Derived agent status for the header
  const tableCount = model?.tables?.length ?? 0;
  const agentStatus = useMemo(() => {
    if (isGenerating) return "Atlas is mapping your schema...";
    if (generationError) return "Atlas encountered an error";
    if (phases.every((p) => p.status === "complete")) return `Atlas mapped ${tableCount} tables successfully`;
    if (model) return `${tableCount} tables mapped`;
    if (selectedTables.length > 0) return `${selectedTables.length} tables ready for Atlas`;
    return "Select tables from Schema Browser to get started";
  }, [isGenerating, generationError, phases, model, selectedTables.length, tableCount]);

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
    if (storedDsId) {
      setDataSourceId(storedDsId);
    }
  }, []);

  // -- Fallback: resolve dataSourceId from project's connections -----------

  useEffect(() => {
    if (dataSourceId || !projectId) return;

    let cancelled = false;
    async function resolveDataSource() {
      try {
        const connections = await fetchApi<
          { id: string; status: string }[]
        >(
          `/api/v1/connections?project_id=${encodeURIComponent(projectId)}`
        );
        const connected = connections.find((c) => c.status === "connected");
        if (connected && !cancelled) {
          setDataSourceId(connected.id);
        }
      } catch {
        // non-fatal — user can still view a previously saved model
      }
    }
    resolveDataSource();
    return () => {
      cancelled = true;
    };
  }, [dataSourceId, projectId, fetchApi]);

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
      setGenerationError(
        "No data source connected. Head to Schema Browser to connect and select tables."
      );
      return;
    }

    setIsGenerating(true);
    setPhases([
      { status: "pending", reasoningText: "", label: "Understanding your schema" },
      { status: "pending", reasoningText: "", label: "Discovering table connections" },
    ]);
    setActivePhaseIndex(-1);
    activePhaseRef.current = -1;
    setPhaseStreaming(false);
    setGenerationError(null);
    setModel(null);
    setRelationships([]);
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
              const eventData = JSON.parse(line.slice(6));
              handleStreamEvent(eventData);
            } catch {
              // ignore unparseable lines
            }
          }
        }
      }
    } catch (err) {
      console.error("Generation error:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      setGenerationError(`Atlas couldn't connect: ${msg}`);
    } finally {
      setIsGenerating(false);
      setPhaseStreaming(false);
    }
  }

  function handleStreamEvent(data: { type: string; content?: string; data?: Record<string, unknown> }) {
    switch (data.type) {
      case "phase": {
        const content = data.content || "";
        let phaseIdx: number;
        if (content.includes("Phase 1") || content.toLowerCase().includes("analyzing")) {
          phaseIdx = 0;
        } else if (content.includes("Phase 2") || content.toLowerCase().includes("relationship")) {
          phaseIdx = 1;
        } else {
          phaseIdx = 0;
        }

        activePhaseRef.current = phaseIdx;
        setActivePhaseIndex(phaseIdx);
        setPhaseStreaming(true);
        setPhases((prev) =>
          prev.map((p, i) =>
            i === phaseIdx ? { ...p, status: "active" } : p
          )
        );
        break;
      }

      case "text":
      case "status": {
        const text = data.content || "";
        const idx = activePhaseRef.current;
        if (idx < 0) break; // no active phase yet
        setPhases((prev) =>
          prev.map((p, i) => {
            if (i !== idx) return p;
            return {
              ...p,
              reasoningText: p.reasoningText + (p.reasoningText ? "\n" : "") + text,
            };
          })
        );
        break;
      }

      case "model": {
        if (data.data) {
          const modelData = data.data as unknown as SemanticModelData;
          setModel(modelData);
        }
        break;
      }

      case "relationships": {
        if (data.data && (data.data as Record<string, unknown>).relationships) {
          const rels = (data.data as { relationships: Relationship[] }).relationships;
          setRelationships(rels);
        }
        break;
      }

      case "done": {
        const idx = activePhaseRef.current;
        setPhaseStreaming(false);
        setPhases((prev) =>
          prev.map((p, i) =>
            i === idx ? { ...p, status: "complete" } : p
          )
        );
        break;
      }

      case "complete": {
        setPhaseStreaming(false);
        setPhases((prev) =>
          prev.map((p) => (p.status !== "complete" ? { ...p, status: "complete" } : p))
        );
        break;
      }

      case "error": {
        const idx = activePhaseRef.current;
        setPhaseStreaming(false);
        setGenerationError(data.content || "Unknown error");
        setPhases((prev) =>
          prev.map((p, i) => {
            if (i !== idx) return p;
            return {
              ...p,
              status: "error",
              reasoningText: p.reasoningText + "\n" + (data.content || ""),
            };
          })
        );
        break;
      }
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
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Save error:", err);
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

  // -- Phase icon helper ----------------------------------------------------

  function getPhaseIcon(status: PhaseState["status"]) {
    switch (status) {
      case "complete": return CheckCircle;
      case "active": return Loader2;
      case "error": return AlertCircle;
      default: return Sparkles;
    }
  }

  function getPhaseIconClassName(status: PhaseState["status"]) {
    return status === "active" ? "animate-spin" : undefined;
  }

  const hasStarted = phases.some((p) => p.status !== "pending") || !!generationError;

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
          <h1 className="text-2xl font-semibold tracking-tight">Atlas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Semantic layer agent — analyzes your schema, classifies columns, and maps relationships automatically.
          </p>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-3">
          <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Failed to load semantic layer</p>
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
          <h1 className="text-2xl font-semibold tracking-tight">Atlas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Semantic layer agent — analyzes your schema, classifies columns, and maps relationships automatically.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/dashboard/${projectId}/chat`)}
        >
          <MessageSquare className="size-3.5" />
          Chat with Data
        </Button>
      </div>

      {/* Atlas panel */}
      <section className="rounded-xl border bg-card">
        {/* Header bar */}
        <div className="flex items-center gap-3 p-4 border-b">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">Atlas</p>
            <p className="text-sm text-muted-foreground truncate">{agentStatus}</p>
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
                    ? "Save Changes"
                    : "Save"}
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
                ? "Atlas is thinking..."
                : model
                  ? "Re-analyze"
                  : "Run Atlas"}
            </Button>
          </div>
        </div>

        {/* ChainOfThought + Reasoning — replaces the old terminal */}
        <div className="p-4">
          {!hasStarted ? (
            <p className="text-sm text-muted-foreground italic">
              {selectedTables.length > 0
                ? 'Click "Run Atlas" to map your schema...'
                : "No tables selected — head to Schema Browser to pick tables."}
            </p>
          ) : (
            <ChainOfThought defaultOpen>
              <ChainOfThoughtHeader>Atlas Progress</ChainOfThoughtHeader>
              <ChainOfThoughtContent>
                {phases.map((phase, index) => (
                  <ChainOfThoughtStep
                    key={index}
                    icon={getPhaseIcon(phase.status)}
                    iconClassName={getPhaseIconClassName(phase.status)}
                    label={phase.label}
                    status={phase.status}
                  >
                    {(phase.status === "active" ||
                      phase.status === "complete" ||
                      phase.status === "error") &&
                      phase.reasoningText && (
                        <Reasoning
                          isStreaming={phase.status === "active" && phaseStreaming}
                          defaultOpen={phase.status === "active"}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{phase.reasoningText}</ReasoningContent>
                        </Reasoning>
                      )}
                  </ChainOfThoughtStep>
                ))}

                {generationError && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive mt-2">
                    <AlertCircle className="size-4 mt-0.5 shrink-0" />
                    <span>{generationError}</span>
                  </div>
                )}
              </ChainOfThoughtContent>
            </ChainOfThought>
          )}
        </div>
      </section>

      {/* Content layout: sidebar + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 min-h-[500px]">
        {/* Models sidebar */}
        <div className="rounded-xl border bg-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tables
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
                  No tables mapped yet
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Run Atlas to map your schema
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
                Select a Table
              </h3>
              <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">
                Run Atlas to analyze your schema, then pick a table from the
                sidebar to inspect and edit its columns.
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
