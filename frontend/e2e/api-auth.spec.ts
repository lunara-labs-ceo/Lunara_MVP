import { test, expect } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Backend API auth tests.
 *
 * These verify that the FastAPI backend rejects unauthenticated requests
 * with 401/403 status codes. The backend must be running for these tests.
 *
 * Run the backend separately:
 *   cd backend && source venv/bin/activate && uvicorn main:app --reload
 */
test.describe("Backend API — unauthenticated requests return 401", () => {
  // Skip all tests in this suite if the backend isn't running
  test.beforeAll(async ({ request }) => {
    try {
      await request.get(`${API_URL}/docs`, { timeout: 5_000 });
    } catch {
      test.skip(true, "Backend not running — skipping API auth tests");
    }
  });

  const protectedEndpoints = [
    { method: "POST", path: "/api/v1/chat/query", name: "Chat query" },
    { method: "POST", path: "/api/v1/chat/execute", name: "Chat execute" },
    {
      method: "POST",
      path: "/api/v1/semantic/generate",
      name: "Semantic generate",
    },
    {
      method: "GET",
      path: "/api/v1/semantic/models",
      name: "Semantic models list",
    },
    {
      method: "POST",
      path: "/api/v1/semantic/detect-relationships",
      name: "Detect relationships",
    },
    {
      method: "POST",
      path: "/api/v1/connection/bigquery",
      name: "Connection BigQuery",
    },
    {
      method: "GET",
      path: "/api/v1/connection/status",
      name: "Connection status",
    },
    {
      method: "DELETE",
      path: "/api/v1/connection/disconnect",
      name: "Connection disconnect",
    },
    { method: "GET", path: "/api/v1/datasets", name: "Datasets list" },
  ];

  for (const endpoint of protectedEndpoints) {
    test(`${endpoint.name} (${endpoint.method} ${endpoint.path}) returns 401 without token`, async ({
      request,
    }) => {
      let response;
      const url = `${API_URL}${endpoint.path}`;

      if (endpoint.method === "GET") {
        response = await request.get(url, { timeout: 10_000 });
      } else if (endpoint.method === "DELETE") {
        response = await request.delete(url, { timeout: 10_000 });
      } else {
        response = await request.post(url, {
          data: {},
          timeout: 10_000,
        });
      }

      // Should be 401 Unauthorized or 403 Forbidden
      expect([401, 403]).toContain(response.status());
    });
  }

  test("API request with invalid token returns 401", async ({ request }) => {
    const response = await request.post(`${API_URL}/api/v1/chat/query`, {
      headers: {
        Authorization: "Bearer fake-invalid-token-12345",
      },
      data: {},
      timeout: 10_000,
    });

    expect([401, 403]).toContain(response.status());
  });

  test("API request with expired token returns 401", async ({ request }) => {
    // A properly formatted but expired JWT (HS256, not RS256 — will fail verification)
    const expiredToken =
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMzQ1Iiwib3JnX2lkIjoib3JnXzEyMzQ1IiwiZXhwIjoxMDAwMDAwMDAwLCJpYXQiOjEwMDAwMDAwMDAsImlzcyI6Imh0dHBzOi8vZmFrZS5jbGVyay5kZXYifQ.fake_signature";

    const response = await request.post(`${API_URL}/api/v1/chat/query`, {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
      data: {},
      timeout: 10_000,
    });

    expect([401, 403]).toContain(response.status());
  });

  test("API docs endpoint is accessible without auth", async ({ request }) => {
    // FastAPI auto-generated docs should still be accessible
    const response = await request.get(`${API_URL}/docs`, { timeout: 10_000 });
    expect(response.status()).toBe(200);
  });
});
