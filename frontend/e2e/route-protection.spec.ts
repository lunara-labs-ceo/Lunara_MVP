import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

test.describe("Route protection — unauthenticated redirects", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  const protectedRoutes = [
    { path: "/dashboard", name: "Dashboard" },
    { path: "/chat", name: "Chat" },
    { path: "/reports", name: "Reports" },
    { path: "/settings", name: "Settings" },
    { path: "/onboarding", name: "Onboarding" },
  ];

  for (const route of protectedRoutes) {
    test(`${route.name} (${route.path}) redirects to sign-in when not authenticated`, async ({
      page,
    }) => {
      // Attempt to visit protected route without auth
      await page.goto(route.path);

      // Should redirect to sign-in page
      await page.waitForURL("**/sign-in**", { timeout: 15_000 });
      expect(page.url()).toContain("/sign-in");
    });
  }

  test("nested protected routes also redirect", async ({ page }) => {
    // Test nested paths under protected route patterns
    await page.goto("/dashboard/projects/123");
    await page.waitForURL("**/sign-in**", { timeout: 15_000 });
    expect(page.url()).toContain("/sign-in");
  });

  test("public routes do NOT redirect", async ({ page }) => {
    // Landing page should be accessible
    await page.goto("/");
    await expect(page).toHaveURL("/");
    // Should not be redirected to sign-in
    expect(page.url()).not.toContain("/sign-in");
  });

  test("sign-in page does NOT redirect (no infinite loop)", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    // Should stay on sign-in, not loop
    await page.waitForTimeout(2_000);
    expect(page.url()).toContain("/sign-in");
    // Clerk component should render
    await expect(page.locator("[data-clerk-component]")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("sign-up page does NOT redirect (no infinite loop)", async ({
    page,
  }) => {
    await page.goto("/sign-up");
    await page.waitForTimeout(2_000);
    expect(page.url()).toContain("/sign-up");
    await expect(page.locator("[data-clerk-component]")).toBeVisible({
      timeout: 15_000,
    });
  });
});
