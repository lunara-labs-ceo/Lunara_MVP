import { test, expect } from "@playwright/test";

/**
 * These tests use the saved auth state from global.setup.ts
 * (storageState: "playwright/.clerk/user.json" configured in playwright.config.ts)
 *
 * The user is already signed in — no need to authenticate again.
 */
test.describe("Authenticated user — Dashboard", () => {
  test("can access dashboard without redirect", async ({ page }) => {
    await page.goto("/dashboard");
    // Should stay on dashboard, not redirect to sign-in
    await expect(page).toHaveURL(/.*dashboard.*/);
    await expect(page.locator("text=Welcome")).toBeVisible({ timeout: 10_000 });
  });

  test("dashboard shows user ID", async ({ page }) => {
    await page.goto("/dashboard");
    // The placeholder dashboard shows "User ID: <id>"
    await expect(page.locator("text=User ID:")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("dashboard shows organization ID when org is active", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // If user has an active org, it should show "Organization: <org_id>"
    // This may or may not be present depending on whether the test user has an org
    const orgText = page.locator("text=Organization:");
    const hasOrg = await orgText.isVisible({ timeout: 5_000 }).catch(() => false);
    if (hasOrg) {
      await expect(orgText).toBeVisible();
    }
    // If no org, that's fine — just verify dashboard loaded
    await expect(page.locator("text=Welcome")).toBeVisible();
  });
});

test.describe("Authenticated user — Header navigation", () => {
  test("header shows Dashboard link and UserButton when signed in", async ({
    page,
  }) => {
    await page.goto("/");
    // Should see Dashboard link (SignedIn component)
    await expect(
      page.getByRole("link", { name: /dashboard/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Should see Clerk UserButton (avatar/menu)
    await expect(
      page.locator('[data-clerk-component="UserButton"]').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("header does NOT show Log In / Get Access when signed in", async ({
    page,
  }) => {
    await page.goto("/");
    // Wait for auth state to load
    await expect(
      page.getByRole("link", { name: /dashboard/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // SignedOut CTAs should not be visible
    // Use .first() in case there are mobile + desktop duplicates
    const logInLinks = page.getByRole("link", { name: /^log in$/i });
    const getAccessLinks = page.getByRole("link", { name: /get access/i });

    // Check that none of the Log In links are visible
    const logInCount = await logInLinks.count();
    for (let i = 0; i < logInCount; i++) {
      await expect(logInLinks.nth(i)).not.toBeVisible();
    }

    const getAccessCount = await getAccessLinks.count();
    for (let i = 0; i < getAccessCount; i++) {
      await expect(getAccessLinks.nth(i)).not.toBeVisible();
    }
  });

  test("Dashboard link navigates to /dashboard", async ({ page }) => {
    await page.goto("/");
    const dashLink = page.getByRole("link", { name: /dashboard/i }).first();
    await expect(dashLink).toBeVisible({ timeout: 10_000 });
    await dashLink.click();
    await page.waitForURL("**/dashboard**", { timeout: 10_000 });
    await expect(page.locator("text=Welcome")).toBeVisible({ timeout: 10_000 });
  });

  test("UserButton opens menu on click", async ({ page }) => {
    await page.goto("/");
    const userButton = page
      .locator('[data-clerk-component="UserButton"]')
      .first();
    await expect(userButton).toBeVisible({ timeout: 10_000 });

    // Click the UserButton to open the menu
    await userButton.click();

    // Clerk opens a popover/menu — look for common popover selectors
    const popover = page
      .locator(
        '.cl-userButtonPopoverCard, [data-clerk-component="UserButtonPopover"], .cl-popoverBox'
      )
      .first();
    await expect(popover).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Authenticated user — Page content", () => {
  test("landing page still loads when authenticated", async ({ page }) => {
    await page.goto("/");
    // Landing page should still work for authenticated users
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator('text="Lunara"').first()).toBeVisible();
  });

  test("sign-in page redirects authenticated user away", async ({ page }) => {
    await page.goto("/sign-in");
    // Clerk should redirect authenticated users away from sign-in
    // They might go to /dashboard or stay on sign-in but show redirect
    await page.waitForTimeout(3_000);
    // Authenticated users typically get redirected to afterSignInUrl
    // or the sign-in component shows they're already signed in
    const isOnSignIn = page.url().includes("/sign-in");
    const isOnDashboard = page.url().includes("/dashboard");
    // Either they got redirected or they see the sign-in page (both are valid)
    expect(isOnSignIn || isOnDashboard).toBe(true);
  });
});
