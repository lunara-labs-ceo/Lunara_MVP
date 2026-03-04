"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Search,
  Database,
  Table2,
  Eye,
  Sparkles,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { useApiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataSource {
  id: string;
  project_id: string;
  type: string;
  name: string;
  config: Record<string, unknown> | null;
  status: "connected" | "error" | "pending";
  created_at: string | null;
  updated_at: string | null;
}

interface SchemaInfo {
  name: string;
  description: string | null;
}

interface TableInfo {
  name: string;
  schema_name: string;
  table_type: string; // "BASE TABLE" | "VIEW"
  row_count: number | null;
}

interface SchemasResponse {
  connection_id: string;
  schemas: SchemaInfo[];
  count: number;
}

interface TablesResponse {
  connection_id: string;
  schema_name: string;
  tables: TableInfo[];
  count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(num: number | null | undefined): string {
  if (num == null) return "--";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SchemaPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const { fetchApi } = useApiClient();

  // ---- Connection state --------------------------------------------------
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // ---- Schema state ------------------------------------------------------
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(false);
  const [schemasError, setSchemasError] = useState<string | null>(null);
  const [schemaFilter, setSchemaFilter] = useState("");
  const [activeSchema, setActiveSchema] = useState<string | null>(null);

  // ---- Table state -------------------------------------------------------
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());

  // ---- Derived -----------------------------------------------------------
  const filteredSchemas = useMemo(
    () =>
      schemas.filter((s) =>
        s.name.toLowerCase().includes(schemaFilter.toLowerCase())
      ),
    [schemas, schemaFilter]
  );

  const filteredTables = useMemo(
    () =>
      tables.filter((t) =>
        t.name.toLowerCase().includes(tableSearch.toLowerCase())
      ),
    [tables, tableSearch]
  );

  const selectedCount = selectedTables.size;

  // ---- Step 1: Load connection for this project --------------------------
  const loadConnection = useCallback(async () => {
    if (!projectId) return;
    setConnectionLoading(true);
    setConnectionError(null);

    try {
      const connections = await fetchApi<DataSource[]>(
        `/api/v1/connections?project_id=${encodeURIComponent(projectId)}`
      );
      const connected = connections.find((c) => c.status === "connected");
      if (connected) {
        setConnectionId(connected.id);
      } else if (connections.length > 0) {
        setConnectionError(
          "Your data source is not connected. Please check your connection settings."
        );
      } else {
        setConnectionError(
          "No data source connected. Connect a database first."
        );
      }
    } catch (err) {
      setConnectionError(
        err instanceof Error ? err.message : "Failed to load connections."
      );
    } finally {
      setConnectionLoading(false);
    }
  }, [projectId, fetchApi]);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  // ---- Step 2: Load schemas once we have a connectionId ------------------
  const loadSchemas = useCallback(async () => {
    if (!connectionId) return;
    setSchemasLoading(true);
    setSchemasError(null);

    try {
      const data = await fetchApi<SchemasResponse>(
        `/api/v1/schemas/${encodeURIComponent(connectionId)}/schemas`
      );
      setSchemas(data.schemas);
      // Auto-select first schema
      if (data.schemas.length > 0) {
        setActiveSchema(data.schemas[0].name);
      }
    } catch (err) {
      setSchemasError(
        err instanceof Error ? err.message : "Failed to load schemas."
      );
    } finally {
      setSchemasLoading(false);
    }
  }, [connectionId, fetchApi]);

  useEffect(() => {
    loadSchemas();
  }, [loadSchemas]);

  // ---- Step 3: Load tables when a schema is selected ---------------------
  const loadTables = useCallback(async () => {
    if (!connectionId || !activeSchema) return;
    setTablesLoading(true);
    setTablesError(null);
    setTables([]);
    setTableSearch("");

    try {
      const data = await fetchApi<TablesResponse>(
        `/api/v1/schemas/${encodeURIComponent(connectionId)}/schemas/${encodeURIComponent(activeSchema)}/tables`
      );
      setTables(data.tables);
    } catch (err) {
      setTablesError(
        err instanceof Error ? err.message : "Failed to load tables."
      );
    } finally {
      setTablesLoading(false);
    }
  }, [connectionId, activeSchema, fetchApi]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  // ---- Table selection ---------------------------------------------------
  function toggleTable(fullId: string) {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(fullId)) {
        next.delete(fullId);
      } else {
        next.add(fullId);
      }
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      for (const t of filteredTables) {
        next.add(`${activeSchema}.${t.name}`);
      }
      return next;
    });
  }

  function deselectAllVisible() {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      for (const t of filteredTables) {
        next.delete(`${activeSchema}.${t.name}`);
      }
      return next;
    });
  }

  // ---- Generate handler --------------------------------------------------
  function handleGenerate() {
    if (selectedCount === 0) return;
    localStorage.setItem(
      "lunara_selected_tables",
      JSON.stringify([...selectedTables])
    );
    router.push(`/dashboard/${projectId}/semantic`);
  }

  // ---- Loading state for the whole page (connection loading) -------------
  if (connectionLoading) {
    return (
      <div className="flex h-full">
        {/* Sidebar skeleton */}
        <div className="w-64 shrink-0 border-r border-border bg-muted/30">
          <div className="p-4 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full" />
            <div className="space-y-2 pt-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </div>
        </div>
        {/* Main skeleton */}
        <div className="flex-1 p-8 space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-80" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- Connection error state --------------------------------------------
  if (connectionError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Cannot Browse Schema</h2>
            <p className="text-sm text-muted-foreground">{connectionError}</p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/dashboard/${projectId}/data-sources`)
            }
          >
            <Database className="size-4" />
            Go to Data Sources
          </Button>
        </div>
      </div>
    );
  }

  // ---- Main render -------------------------------------------------------
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* ---- Left sidebar: schemas ---- */}
        <aside className="w-64 shrink-0 border-r border-border bg-muted/30 flex flex-col">
          <div className="p-4 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Schemas
              </span>
              <Badge variant="secondary" className="text-xs tabular-nums">
                {schemas.length}
              </Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={schemaFilter}
                onChange={(e) => setSchemaFilter(e.target.value)}
                placeholder="Filter schemas..."
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          <Separator />

          <ScrollArea className="flex-1">
            <div className="p-2">
              {schemasLoading ? (
                <div className="space-y-1.5 p-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : schemasError ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-destructive">{schemasError}</p>
                </div>
              ) : filteredSchemas.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    {schemaFilter
                      ? "No schemas match your filter."
                      : "No schemas found."}
                  </p>
                </div>
              ) : (
                filteredSchemas.map((schema) => (
                  <button
                    key={schema.name}
                    onClick={() => {
                      setActiveSchema(schema.name);
                      setTableSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      activeSchema === schema.name
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Database className="size-4 shrink-0" />
                    <span className="truncate">{schema.name}</span>
                    {activeSchema === schema.name && (
                      <ChevronRight className="ml-auto size-3.5 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* ---- Main content: tables ---- */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="shrink-0 px-6 pt-6 pb-4 lg:px-8 space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {activeSchema ? activeSchema : "Schema Browser"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Select the tables to include in your semantic layer.
              </p>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Search tables..."
                  className="pl-9"
                />
              </div>

              <div className="flex items-center gap-3 ml-auto">
                {activeSchema && tables.length > 0 && (
                  <>
                    <Badge variant="outline" className="tabular-nums">
                      {filteredTables.length}{" "}
                      {filteredTables.length === 1 ? "table" : "tables"}
                    </Badge>
                    <button
                      onClick={selectAllVisible}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Select All
                    </button>
                    <Separator orientation="vertical" className="h-4" />
                    <button
                      onClick={deselectAllVisible}
                      className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Deselect All
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Table list */}
          <ScrollArea className="flex-1">
            <div className="px-6 py-4 lg:px-8 pb-28">
              {!activeSchema ? (
                /* No schema selected */
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted mb-4">
                    <Database className="size-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Select a schema to view tables
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Choose a schema from the sidebar to browse its tables and
                    views.
                  </p>
                </div>
              ) : tablesLoading ? (
                /* Loading skeleton */
                <div className="space-y-0">
                  {/* Table header skeleton */}
                  <div className="grid grid-cols-[40px_1fr_100px_100px] gap-4 px-4 py-3 border-b border-border">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[40px_1fr_100px_100px] gap-4 items-center px-4 py-3.5 border-b border-border/50"
                    >
                      <Skeleton className="h-4 w-4" />
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-8 rounded-md" />
                        <Skeleton className="h-4 w-40" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  ))}
                </div>
              ) : tablesError ? (
                /* Error state */
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
                    <AlertCircle className="size-5 text-destructive" />
                  </div>
                  <p className="text-sm font-medium">Failed to load tables</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tablesError}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={loadTables}
                  >
                    Try Again
                  </Button>
                </div>
              ) : filteredTables.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted mb-4">
                    <Table2 className="size-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {tableSearch
                      ? "No tables match your search."
                      : "No tables found in this schema."}
                  </p>
                </div>
              ) : (
                /* Table */
                <div className="rounded-lg border border-border overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[40px_1fr_100px_100px] gap-4 bg-muted/50 px-4 py-2.5 border-b border-border">
                    <span className="sr-only">Select</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Table Name
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Type
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Rows
                    </span>
                  </div>

                  {/* Table rows */}
                  {filteredTables.map((table) => {
                    const fullId = `${activeSchema}.${table.name}`;
                    const isSelected = selectedTables.has(fullId);
                    const isView = table.table_type === "VIEW";

                    return (
                      <label
                        key={table.name}
                        className={cn(
                          "grid grid-cols-[40px_1fr_100px_100px] gap-4 items-center px-4 py-3 border-b border-border/50 cursor-pointer transition-colors",
                          isSelected
                            ? "bg-primary/5"
                            : "hover:bg-accent/50"
                        )}
                      >
                        {/* Checkbox */}
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTable(fullId)}
                            className="size-4 rounded border-input accent-primary cursor-pointer"
                          />
                        </div>

                        {/* Name with icon */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-md",
                              isView
                                ? "bg-violet-500/10 text-violet-500"
                                : "bg-primary/10 text-primary"
                            )}
                          >
                            {isView ? (
                              <Eye className="size-4" />
                            ) : (
                              <Table2 className="size-4" />
                            )}
                          </div>
                          <span className="font-mono text-sm font-medium truncate">
                            {table.name}
                          </span>
                        </div>

                        {/* Type badge */}
                        <div>
                          <Badge
                            variant={isView ? "outline" : "secondary"}
                            className={cn(
                              "text-[10px] uppercase tracking-wider",
                              isView &&
                                "border-violet-500/30 text-violet-500 bg-violet-500/5"
                            )}
                          >
                            {isView ? "View" : "Table"}
                          </Badge>
                        </div>

                        {/* Row count */}
                        <span className="font-mono text-sm text-muted-foreground tabular-nums">
                          {formatNumber(table.row_count)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ---- Sticky footer ---- */}
      <div className="shrink-0 border-t border-border bg-background px-6 py-3 lg:px-8">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">
              {selectedCount} {selectedCount === 1 ? "table" : "tables"}
            </span>{" "}
            selected
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() =>
                router.push(`/dashboard/${projectId}/data-sources`)
              }
            >
              Back
            </Button>
            <Button
              disabled={selectedCount === 0}
              onClick={handleGenerate}
            >
              <Sparkles className="size-4" />
              Generate Semantic Layer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
