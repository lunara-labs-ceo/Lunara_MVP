import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false, // Serial by default — Clerk auth state is shared
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "html",
  timeout: 60_000,

  use: {
    baseURL,
    trace: "retry-with-trace",
    screenshot: "only-on-failure",
  },

  projects: [
    // 1. Global setup — initializes Clerk testing token + authenticates a test user
    {
      name: "global-setup",
      testDir: "./e2e",
      testMatch: /global\.setup\.ts/,
    },

    // 2. Public route tests — no auth needed
    {
      name: "public",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /public-routes\.spec\.ts/,
      dependencies: ["global-setup"],
    },

    // 3. Auth flow tests — sign-in, sign-up, sign-out
    {
      name: "auth-flows",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /auth-flow\.spec\.ts/,
      dependencies: ["global-setup"],
    },

    // 4. Route protection tests — unauthenticated redirects
    {
      name: "route-protection",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /route-protection\.spec\.ts/,
      dependencies: ["global-setup"],
    },

    // 5. Authenticated tests — uses saved auth state
    {
      name: "authenticated",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.clerk/user.json",
      },
      testMatch: /authenticated\.spec\.ts/,
      dependencies: ["global-setup"],
    },

    // 6. Backend API auth tests
    {
      name: "api-auth",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /api-auth\.spec\.ts/,
      dependencies: ["global-setup"],
    },
  ],

  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
