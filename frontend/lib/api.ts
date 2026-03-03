"use client";

import { useAuth } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function useApiClient() {
  const { getToken } = useAuth();

  async function fetchApi<T = unknown>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }

    return res.json();
  }

  async function fetchApiStream(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = await getToken();
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  return { fetchApi, fetchApiStream };
}
