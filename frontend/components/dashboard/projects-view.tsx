"use client";

import { useProjects } from "@/hooks/use-projects";
import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { ProjectCard } from "@/components/dashboard/project-card";
import { ProjectCardSkeleton } from "@/components/dashboard/project-card-skeleton";
import { EmptyProjects } from "@/components/dashboard/empty-projects";
import { AlertCircle } from "lucide-react";

export function ProjectsView() {
  const { projects, isLoading, error, createProject, deleteProject } = useProjects();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your data projects and analytics workspaces.
          </p>
        </div>
        <CreateProjectDialog onSubmit={createProject} />
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Project grid */}
      <div className="mt-8">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyProjects />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} onDelete={deleteProject} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
