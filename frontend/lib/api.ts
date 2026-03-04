"use client";

import { useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function useApiClient() {
  const { getToken } = useAuth();

  // Store getToken in a ref so our returned functions never change identity
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Stable function — same reference across renders
  const fetchApi = useCallback(
    async <T = unknown>(
      path: string,
      options: RequestInit = {}
    ): Promise<T> => {
      const token = await getTokenRef.current();
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
    },
    [] // no deps — always stable
  );

  const fetchApiStream = useCallback(
    async (path: string, options: RequestInit = {}): Promise<Response> => {
      const token = await getTokenRef.current();
      return fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    },
    [] // no deps — always stable
  );

  return { fetchApi, fetchApiStream };
}
