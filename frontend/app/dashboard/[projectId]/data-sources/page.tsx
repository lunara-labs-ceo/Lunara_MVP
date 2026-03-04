"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Database } from "lucide-react";
import { useApiClient } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectorCard } from "@/components/data-sources/connector-card";
import { ConnectionDialog } from "@/components/data-sources/connection-dialog";
import { ConnectedSource } from "@/components/data-sources/connected-source";
import { Supabase as SupabaseIcon } from "@/components/ui/svgs/supabase";
import { BigQueryIcon } from "@/components/ui/svgs/bigquery";
import { MySQLIcon } from "@/components/ui/svgs/mysql";

// ---- Types ----------------------------------------------------------------

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

interface ConnectorDefinition {
  name: string;
  description: string;
  icon: React.ReactNode;
  status: "ready" | "coming-soon";
}

// ---- Constants ------------------------------------------------------------

const CONNECTORS: ConnectorDefinition[] = [
  {
    name: "Supabase",
    description: "Connect your Supabase PostgreSQL database — works with any Postgres-compatible host.",
    icon: <SupabaseIcon className="size-8" />,
    status: "ready",
  },
  {
    name: "BigQuery",
    description: "Google BigQuery data warehouse for large-scale analytics.",
    icon: <BigQueryIcon className="size-8" />,
    status: "coming-soon",
  },
  {
    name: "Snowflake",
    description: "Cloud data platform for modern data engineering.",
    icon: (
      <Image
        src="/snowflake-icon.svg"
        alt="Snowflake"
        width={32}
        height={32}
        className="size-8"
      />
    ),
    status: "coming-soon",
  },
  {
    name: "MySQL",
    description: "Open-source relational database for web applications.",
    icon: <MySQLIcon className="size-8" />,
    status: "coming-soon",
  },
];

// ---- Page -----------------------------------------------------------------

export default function DataSourcesPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { fetchApi } = useApiClient();

  const [connections, setConnections] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // -- Fetch connections ---------------------------------------------------

  const loadConnections = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await fetchApi<DataSource[]>(
        `/api/v1/connections?project_id=${encodeURIComponent(projectId)}`
      );
      setConnections(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load data sources."
      );
    } finally {
      setIsLoading(false);
    }
  }, [projectId, fetchApi]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // -- Delete a connection -------------------------------------------------

  async function handleDelete(connectionId: string) {
    // Optimistic: remove from list immediately
    setConnections((prev) => prev.filter((c) => c.id !== connectionId));

    try {
      await fetchApi(`/api/v1/connections/${connectionId}`, {
        method: "DELETE",
      });
    } catch {
      // If delete failed, re-fetch the list to restore correct state
      loadConnections();
    }
  }

  // -- Render --------------------------------------------------------------

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-10">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data Sources</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your database so Lunara can analyze your data. Start by
          connecting a PostgreSQL database.
        </p>
      </div>

      {/* Available Connectors */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Available Connectors
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CONNECTORS.map((connector) => (
            <ConnectorCard
              key={connector.name}
              name={connector.name}
              description={connector.description}
              icon={connector.icon}
              status={connector.status}
              onClick={
                connector.status === "ready"
                  ? () => setDialogOpen(true)
                  : undefined
              }
            />
          ))}
        </div>
      </section>

      {/* Connected Sources */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Connected Sources
        </h2>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border px-4 py-3"
              >
                <Skeleton className="h-9 w-9 rounded-md" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {!isLoading && loadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !loadError && connections.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <Database className="size-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              No data sources connected yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Click the PostgreSQL card above to get started.
            </p>
          </div>
        )}

        {/* Connections list */}
        {!isLoading && !loadError && connections.length > 0 && (
          <div className="space-y-3">
            {connections.map((conn) => (
              <ConnectedSource
                key={conn.id}
                id={conn.id}
                name={conn.name}
                type={conn.type}
                status={conn.status}
                createdAt={conn.created_at ?? new Date().toISOString()}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* Connection dialog */}
      <ConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        onSuccess={loadConnections}
      />
    </div>
  );
}
