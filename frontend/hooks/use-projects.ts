"use client";

import { useState, useEffect, useCallback } from "react";
import { useApiClient } from "@/lib/api";
import type { Project } from "@/types/project";

/**
 * Hook for managing projects via the backend API.
 *
 * Replaces the old localStorage-based implementation — projects now
 * live in Supabase and are scoped to the user's Clerk organization.
 */
export function useProjects() {
  const { fetchApi } = useApiClient();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchApi<Project[]>("/api/v1/projects");
        if (!cancelled) setProjects(data);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load projects:", err);
          setError(err instanceof Error ? err.message : "Failed to load projects");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchApi]);

  const createProject = useCallback(
    async (data: { name: string; description: string | null }): Promise<Project> => {
      const created = await fetchApi<Project>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify(data),
      });

      setProjects((prev) => [created, ...prev]);
      return created;
    },
    [fetchApi]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await fetchApi(`/api/v1/projects/${id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    },
    [fetchApi]
  );

  const updateProject = useCallback(
    async (id: string, data: { name?: string; description?: string | null }) => {
      const updated = await fetchApi<Project>(`/api/v1/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    },
    [fetchApi]
  );

  return {
    projects,
    isLoading,
    error,
    createProject,
    deleteProject,
    updateProject,
  };
}
