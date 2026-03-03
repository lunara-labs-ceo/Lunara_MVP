import { clerkSetup } from "@clerk/testing/playwright";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test as setup, expect } from "@playwright/test";

setup.describe.configure({ mode: "serial" });

/**
 * Step 1: Initialize Clerk testing environment.
 * This obtains a Testing Token so Clerk's bot detection doesn't block Playwright.
 */
setup("initialize clerk", async () => {
  await clerkSetup();
});

/**
 * Step 2: Authenticate a test user and save the session state.
 *
 * Requires these env vars:
 *   E2E_CLERK_USER_USERNAME — email of a test user in your Clerk dev instance
 *   E2E_CLERK_USER_PASSWORD — password for that test user
 *
 * The authenticated state is saved to playwright/.clerk/user.json
 * so subsequent tests can reuse it without signing in again.
 */
setup("authenticate", async ({ page }) => {
  const username = process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Missing E2E_CLERK_USER_USERNAME or E2E_CLERK_USER_PASSWORD env vars. " +
        "Create a test user in your Clerk dashboard and set these in .env.local or your shell."
    );
  }

  // Enable Clerk testing token for this page
  await setupClerkTestingToken({ page });

  // Navigate to sign-in
  await page.goto("/sign-in");

  // Wait for Clerk sign-in component to render
  await page.waitForSelector("[data-clerk-component]", { timeout: 15_000 });

  // Fill in email
  const emailInput = page.locator('input[name="identifier"]');
  await emailInput.waitFor({ state: "visible", timeout: 10_000 });
  await emailInput.fill(username);

  // Click continue (exact match to avoid hitting Google OAuth button)
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  await continueButton.click();

  // Wait for password field
  const passwordInput = page.locator('input[name="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: 10_000 });
  await passwordInput.fill(password);

  // Click sign in
  const signInButton = page.getByRole("button", { name: "Continue", exact: true });
  await signInButton.click();

  // Wait for redirect to dashboard (or wherever AFTER_SIGN_IN_URL points)
  await page.waitForURL("**/dashboard**", { timeout: 30_000 });

  // Verify we're actually authenticated
  await expect(page.locator("text=Welcome")).toBeVisible({ timeout: 10_000 });

  // Save the authenticated session state
  await page.context().storageState({ path: "playwright/.clerk/user.json" });
});
