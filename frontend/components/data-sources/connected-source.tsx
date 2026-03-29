"use client";

import { useState } from "react";
import { Database, FileSpreadsheet, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ConnectedSourceProps {
  id: string;
  name: string;
  type: string;
  status: "connected" | "error" | "pending";
  config?: Record<string, unknown> | null;
  createdAt: string;
  onDelete: (id: string) => void;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ConnectedSource({
  id,
  name,
  type,
  status,
  config,
  createdAt,
  onDelete,
}: ConnectedSourceProps) {
  const isFileUpload = type === "file_upload";
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      onDelete(id);
    } catch {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/30">
      {/* Left side: icon + name + metadata */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/5 text-primary dark:bg-primary/10">
          {isFileUpload ? (
            <FileSpreadsheet className="size-4" />
          ) : (
            <Database className="size-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
          <p className="text-xs text-muted-foreground">
            {isFileUpload
              ? `CSV Upload${config?.row_count ? ` \u00b7 ${Number(config.row_count).toLocaleString()} rows` : ""}`
              : type === "postgres"
                ? "PostgreSQL"
                : type}{" "}
            &middot; {isFileUpload ? "Uploaded" : "Connected"}{" "}
            {formatRelativeTime(createdAt)}
          </p>
        </div>
      </div>

      {/* Right side: status badge + delete */}
      <div className="flex items-center gap-2 shrink-0">
        {status === "connected" && (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/25 gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Connected
          </Badge>
        )}
        {status === "error" && (
          <Badge variant="destructive" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-white/80" />
            Error
          </Badge>
        )}
        {status === "pending" && (
          <Badge variant="secondary" className="gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full bg-muted-foreground",
                "animate-pulse"
              )}
            />
            Pending
          </Badge>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-muted-foreground hover:text-destructive"
        >
          {isDeleting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          <span className="sr-only">Delete connection</span>
        </Button>
      </div>
    </div>
  );
}
