import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://con.peweo.dev";
const REPORT_DIR = "/tmp/qa-report";
const bugs: Array<{
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  page: string;
  steps: string[];
  expected: string;
  actual: string;
  screenshot?: string;
}> = [];

function bug(
  id: string,
  severity: "critical" | "high" | "medium" | "low",
  title: string,
  page: string,
  steps: string[],
  expected: string,
  actual: string,
  screenshot?: string
) {
  bugs.push({ id, severity, title, page, steps, expected, actual, screenshot });
}

async function screenshot(page: Page, name: string): Promise<string> {
  const p = path.join(REPORT_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

test.beforeAll(() => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
});

test("homepage loads", async ({ page }) => {
  const resp = await page.goto(BASE_URL, { timeout: 15000, waitUntil: "domcontentloaded" });
  const sc = await screenshot(page, "01-homepage");
  if (!resp || resp.status() >= 400) {
    bug("B001", "critical", `Homepage returned HTTP ${resp?.status()}`, "/", ["Navigate to " + BASE_URL], "HTTP 200 with page content", `HTTP ${resp?.status()}`);
  }
  const title = await page.title();
  console.log("Homepage title:", title);
  console.log("Homepage URL:", page.url());
  await screenshot(page, "01-homepage");
});

test("registration page loads", async ({ page }) => {
  await page.goto(BASE_URL + "/register", { timeout: 15000, waitUntil: "domcontentloaded" });
  const sc = await screenshot(page, "02-register-page");
  const url = page.url();
  console.log("Register URL:", url);
  // Check for registration form elements
  const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input[id*="name" i]').first();
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitBtn = page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Sign up"), button:has-text("Create")').first();

  const hasEmail = await emailInput.isVisible().catch(() => false);
  const hasPassword = await passwordInput.isVisible().catch(() => false);
  const hasSubmit = await submitBtn.isVisible().catch(() => false);

  if (!hasEmail) bug("B002", "critical", "Registration form missing email input", "/register", ["Navigate to /register"], "Email input visible", "Email input not found");
  if (!hasPassword) bug("B003", "critical", "Registration form missing password input", "/register", ["Navigate to /register"], "Password input visible", "Password input not found");
  if (!hasSubmit) bug("B004", "critical", "Registration form missing submit button", "/register", ["Navigate to /register"], "Submit button visible", "Submit button not found");
});

test("registration flow", async ({ page }) => {
  await page.goto(BASE_URL + "/register", { timeout: 15000, waitUntil: "domcontentloaded" });

  const timestamp = Date.now();
  const testEmail = `qa-test-${timestamp}@example.com`;
  const testPassword = "TestPassword123!";
  const testName = "QA Tester";

  // Fill name if present
  const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input[id*="name" i]').first();
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(testName);
  }

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitBtn = page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Sign up"), button:has-text("Create account")').first();

  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(testEmail);
  }
  if (await passwordInput.isVisible().catch(() => false)) {
    await passwordInput.fill(testPassword);
  }

  await screenshot(page, "03-register-filled");

  if (await submitBtn.isVisible().catch(() => false)) {
    await submitBtn.click();
    await page.waitForTimeout(3000);
    await screenshot(page, "04-register-submitted");
    const currentUrl = page.url();
    console.log("After register URL:", currentUrl);

    // Check for error messages
    const errorEl = page.locator('[role="alert"], .error, [class*="error"], [class*="toast"], [data-sonner-toast]').first();
    const hasError = await errorEl.isVisible().catch(() => false);
    if (hasError) {
      const errorText = await errorEl.textContent().catch(() => "unknown");
      bug("B005", "critical", `Registration fails with error: "${errorText}"`, "/register",
        ["Navigate to /register", `Fill name: "${testName}"`, `Fill email: "${testEmail}"`, `Fill password: "${testPassword}"`, "Click submit"],
        "User registers successfully and is redirected",
        `Error shown: "${errorText}"`,
        "04-register-submitted.png"
      );
      console.log("Registration error:", errorText);
    }

    // Log credentials if registration appeared to succeed
    if (currentUrl !== BASE_URL + "/register" && !hasError) {
      console.log("REGISTERED ACCOUNT:", testEmail, testPassword);
    }
  }
});

test("login page loads", async ({ page }) => {
  await page.goto(BASE_URL + "/login", { timeout: 15000, waitUntil: "domcontentloaded" });
  await screenshot(page, "05-login-page");
  const url = page.url();
  console.log("Login page URL:", url);

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();

  const hasEmail = await emailInput.isVisible().catch(() => false);
  const hasPassword = await passwordInput.isVisible().catch(() => false);
  const hasSubmit = await submitBtn.isVisible().catch(() => false);

  if (!hasEmail) bug("B006", "high", "Login form missing email input", "/login", ["Navigate to /login"], "Email input visible", "Email input not found");
  if (!hasPassword) bug("B007", "high", "Login form missing password input", "/login", ["Navigate to /login"], "Password input visible", "Password input not found");
  if (!hasSubmit) bug("B008", "high", "Login form missing submit button", "/login", ["Navigate to /login"], "Submit button visible", "Submit button not found");
});

test("login with invalid credentials", async ({ page }) => {
  await page.goto(BASE_URL + "/login", { timeout: 15000, waitUntil: "domcontentloaded" });

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();

  if (await emailInput.isVisible().catch(() => false)) await emailInput.fill("wrong@example.com");
  if (await passwordInput.isVisible().catch(() => false)) await passwordInput.fill("wrongpassword");
  if (await submitBtn.isVisible().catch(() => false)) {
    await submitBtn.click();
    await page.waitForTimeout(2000);
    await screenshot(page, "06-login-invalid");
    const errorEl = page.locator('[role="alert"], .error, [class*="error"], [class*="toast"], [data-sonner-toast]').first();
    const hasError = await errorEl.isVisible().catch(() => false);
    if (!hasError) {
      bug("B009", "medium", "Login with invalid credentials shows no error message", "/login",
        ["Navigate to /login", "Fill invalid email/password", "Click submit"],
        "Error message shown for invalid credentials",
        "No error message visible"
      );
    }
  }
});

test("navigation and key pages", async ({ page }) => {
  await page.goto(BASE_URL, { timeout: 15000, waitUntil: "domcontentloaded" });

  // Check main navigation links
  const navLinks = await page.locator("nav a, header a").allTextContents().catch(() => [] as string[]);
  console.log("Nav links:", navLinks);

  // Try to find dashboard or main app area
  const dashboardLink = page.locator('a[href*="dashboard"], a:has-text("Dashboard")').first();
  if (await dashboardLink.isVisible().catch(() => false)) {
    await dashboardLink.click();
    await page.waitForTimeout(2000);
    await screenshot(page, "07-dashboard");
    console.log("Dashboard URL:", page.url());
  }
});

test("console errors check", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", err => consoleErrors.push(err.message));

  await page.goto(BASE_URL, { timeout: 15000, waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  if (consoleErrors.length > 0) {
    bug("B010", "medium", `${consoleErrors.length} console error(s) on homepage`,
      "/",
      ["Navigate to homepage", "Open browser console"],
      "No console errors",
      consoleErrors.slice(0, 5).join("; ")
    );
    console.log("Console errors:", consoleErrors);
  }
});

test("generate report", async () => {
  const report = {
    generatedAt: new Date().toISOString(),
    site: BASE_URL,
    totalBugs: bugs.length,
    critical: bugs.filter(b => b.severity === "critical").length,
    high: bugs.filter(b => b.severity === "high").length,
    medium: bugs.filter(b => b.severity === "medium").length,
    low: bugs.filter(b => b.severity === "low").length,
    bugs,
  };
  fs.writeFileSync(path.join(REPORT_DIR, "qa-report.json"), JSON.stringify(report, null, 2));
  console.log("=== QA REPORT ===");
  console.log(JSON.stringify(report, null, 2));
});
