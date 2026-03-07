"use client";

import { Loader2, AlertCircle, TableIcon } from "lucide-react";
import type { EditorTab } from "@/types/chat";

interface ResultsTableProps {
  data: Record<string, unknown>[] | null;
  rowCount: number;
  queryStatus: EditorTab["queryStatus"];
  errorMessage?: string | null;
}

const MAX_DISPLAY_ROWS = 100;

export function ResultsTable({
  data,
  rowCount,
  queryStatus,
  errorMessage,
}: ResultsTableProps) {
  // Empty state — no query has been run yet
  if (queryStatus === "ready" && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground/50">
        <TableIcon className="size-8" />
        <p className="text-xs">Run a query to see results</p>
      </div>
    );
  }

  // Running state
  if (queryStatus === "running") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <p className="text-xs">Executing query...</p>
      </div>
    );
  }

  // Error state
  if (queryStatus === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-destructive">
        <AlertCircle className="size-5" />
        <p className="max-w-md text-center text-xs leading-relaxed">
          {errorMessage || "Query failed"}
        </p>
      </div>
    );
  }

  // Complete state — render table
  if (queryStatus === "complete" && data && data.length > 0) {
    const columns = Object.keys(data[0]);
    const displayRows = data.slice(0, MAX_DISPLAY_ROWS);

    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted">
                {/* Row number column */}
                <th className="whitespace-nowrap border-b border-r border-border px-2 py-1.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="whitespace-nowrap border-b border-r border-border px-3 py-1.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="even:bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  {/* Row number */}
                  <td className="whitespace-nowrap border-b border-r border-border px-2 py-1.5 text-right text-xs text-muted-foreground/50">
                    {rowIdx + 1}
                  </td>
                  {columns.map((col) => {
                    const value = row[col];
                    const isNull = value === null || value === undefined;
                    const isNumber =
                      typeof value === "number" ||
                      typeof value === "bigint";

                    return (
                      <td
                        key={col}
                        className={`max-w-[300px] truncate whitespace-nowrap border-b border-r border-border px-3 py-1.5 ${
                          isNumber ? "font-mono text-right" : ""
                        }`}
                      >
                        {isNull ? (
                          <span className="italic text-muted-foreground/50">
                            NULL
                          </span>
                        ) : (
                          String(value)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/30 px-3 py-1">
          <span className="text-xs text-muted-foreground">
            {rowCount.toLocaleString()} row{rowCount !== 1 ? "s" : ""}
          </span>
          {rowCount > MAX_DISPLAY_ROWS && (
            <span className="text-xs text-muted-foreground/70">
              Showing {MAX_DISPLAY_ROWS} of {rowCount.toLocaleString()} rows
            </span>
          )}
        </div>
      </div>
    );
  }

  // Complete but empty results
  if (queryStatus === "complete" && (!data || data.length === 0)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground/50">
        <TableIcon className="size-8" />
        <p className="text-xs">Query returned no rows</p>
      </div>
    );
  }

  // Fallback (should not reach)
  return null;
}
