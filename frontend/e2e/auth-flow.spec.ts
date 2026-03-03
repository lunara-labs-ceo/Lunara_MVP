import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { clerk } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("Sign-in flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("sign-in page renders Clerk component", async ({ page }) => {
    await page.goto("/sign-in");
    // Clerk component should render
    await expect(page.locator("[data-clerk-component]")).toBeVisible({
      timeout: 15_000,
    });
    // Should have an email/identifier input
    const identifierInput = page.locator('input[name="identifier"]');
    await expect(identifierInput).toBeVisible({ timeout: 10_000 });
  });

  test("sign-in with valid credentials redirects to dashboard", async ({
    page,
  }) => {
    const username = process.env.E2E_CLERK_USER_USERNAME;
    const password = process.env.E2E_CLERK_USER_PASSWORD;
    if (!username || !password) {
      test.skip(true, "Missing E2E credentials");
      return;
    }

    await page.goto("/sign-in");
    await page.waitForSelector("[data-clerk-component]", { timeout: 15_000 });

    // Enter email
    await page.locator('input[name="identifier"]').fill(username);
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    // Enter password
    const passwordInput = page.locator('input[name="password"]');
    await passwordInput.waitFor({ state: "visible", timeout: 10_000 });
    await passwordInput.fill(password);
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    // Should redirect to dashboard
    await page.waitForURL("**/dashboard**", { timeout: 30_000 });
    await expect(page.locator("text=Welcome")).toBeVisible({ timeout: 10_000 });
  });

  test("sign-in with Clerk helper (signIn.create)", async ({ page }) => {
    const username = process.env.E2E_CLERK_USER_USERNAME;
    const password = process.env.E2E_CLERK_USER_PASSWORD;
    if (!username || !password) {
      test.skip(true, "Missing E2E credentials");
      return;
    }

    await page.goto("/");

    // Use Clerk's programmatic sign-in helper
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: username,
        password: password,
      },
    });

    // Navigate to protected route
    await page.goto("/dashboard");
    await expect(page.locator("text=Welcome")).toBeVisible({ timeout: 10_000 });
  });

  test("sign-in with invalid credentials shows error", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForSelector("[data-clerk-component]", { timeout: 15_000 });

    // Enter a fake email
    await page
      .locator('input[name="identifier"]')
      .fill("nonexistent@example.com");
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    // Should show an error message (Clerk shows "Couldn't find your account")
    // Wait for any error element to appear
    const errorVisible = await page
      .locator('[data-clerk-component] [role="alert"], .cl-formFieldErrorText')
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    // If Clerk shows the password step anyway (some configs), try wrong password
    if (!errorVisible) {
      const passwordInput = page.locator('input[name="password"]');
      const hasPassword = await passwordInput
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      if (hasPassword) {
        await passwordInput.fill("wrongpassword123");
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        // Should show error
        await expect(
          page
            .locator(
              '[data-clerk-component] [role="alert"], .cl-formFieldErrorText'
            )
            .first()
        ).toBeVisible({ timeout: 10_000 });
      }
    }

    // Should NOT have redirected to dashboard
    expect(page.url()).not.toContain("/dashboard");
  });
});

test.describe("Sign-out flow", () => {
  test("sign-out using Clerk helper redirects to landing", async ({
    page,
  }) => {
    const username = process.env.E2E_CLERK_USER_USERNAME;
    const password = process.env.E2E_CLERK_USER_PASSWORD;
    if (!username || !password) {
      test.skip(true, "Missing E2E credentials");
      return;
    }

    await setupClerkTestingToken({ page });
    await page.goto("/");

    // Sign in first
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: username,
        password: password,
      },
    });

    // Verify signed in
    await page.goto("/dashboard");
    await expect(page.locator("text=Welcome")).toBeVisible({ timeout: 10_000 });

    // Sign out using Clerk helper
    await clerk.signOut({ page });

    // Navigate to a protected route — should redirect to sign-in
    await page.goto("/dashboard");
    await page.waitForURL("**/sign-in**", { timeout: 15_000 });
  });
});
