"use client";

import { FolderOpen } from "lucide-react";

export function EmptyProjects() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <FolderOpen className="size-7 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-base font-semibold">No projects yet</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Create your first project to connect a data source and start chatting
        with your data.
      </p>
    </div>
  );
}
