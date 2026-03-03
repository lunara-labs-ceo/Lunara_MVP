import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

test.describe("Public routes", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("landing page loads without auth", async ({ page }) => {
    await page.goto("/");
    // Page should load successfully
    await expect(page).toHaveURL("/");
    // Header should be visible
    await expect(page.locator("header")).toBeVisible();
    // Lunara brand should be present
    await expect(page.locator('text="Lunara"').first()).toBeVisible();
  });

  test("landing page shows Log In and Get Access for signed-out users", async ({
    page,
  }) => {
    await page.goto("/");
    // Should see signed-out CTAs
    await expect(page.getByRole("link", { name: /log in/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /get access/i })
    ).toBeVisible();
    // Should NOT see dashboard link or UserButton
    await expect(
      page.getByRole("link", { name: /dashboard/i })
    ).not.toBeVisible();
  });

  test("sign-in page loads without auth", async ({ page }) => {
    await page.goto("/sign-in");
    // Should show Clerk sign-in component
    await expect(page.locator("[data-clerk-component]")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("sign-up page loads without auth", async ({ page }) => {
    await page.goto("/sign-up");
    // Should show Clerk sign-up component
    await expect(page.locator("[data-clerk-component]")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("landing page has working nav links", async ({ page }) => {
    await page.goto("/");
    // Check that nav links exist (these are anchor links to sections)
    const nav = page.locator("header nav");
    await expect(nav).toBeVisible();

    // Log In link should point to /sign-in
    const loginLink = page.getByRole("link", { name: /log in/i });
    await expect(loginLink).toHaveAttribute("href", /\/sign-in/);

    // Get Access link should point to /sign-up
    const signUpLink = page.getByRole("link", { name: /get access/i });
    await expect(signUpLink).toHaveAttribute("href", /\/sign-up/);
  });

  test("theme toggle exists in header", async ({ page }) => {
    await page.goto("/");
    // Theme toggle button should be present
    const themeToggle = page.getByRole("button", { name: /toggle theme/i });
    await expect(themeToggle).toBeVisible();
  });
});
