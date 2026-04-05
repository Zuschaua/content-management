const { chromium } = require('@playwright/test');
const { mkdirSync } = require('fs');

(async () => {
  mkdirSync('/tmp/qa-screenshots', { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  const ts = Date.now();
  const testEmail = `qa-e2e-${ts}@test.example.com`;

  console.log('Step 1: Navigate to /register');
  const resp = await page.goto('https://con.peweo.dev/register', { waitUntil: 'networkidle' });
  console.log('HTTP status:', resp.status(), '| URL:', page.url());
  await page.screenshot({ path: '/tmp/qa-screenshots/01-register-page.png', fullPage: true });

  console.log('Step 2: Fill in form');
  await page.fill('#name', 'QA Test User');
  await page.fill('#email', testEmail);
  await page.fill('#password', 'TestPassword123');
  await page.screenshot({ path: '/tmp/qa-screenshots/02-form-filled.png', fullPage: true });

  console.log('Step 3: Intercept network to verify API URL used');
  const apiRequests = [];
  page.on('request', req => {
    if (req.url().includes('/auth/register')) apiRequests.push(req.url());
  });

  console.log('Step 4: Submit form');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => null),
    page.click('button[type="submit"]')
  ]);

  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/qa-screenshots/03-after-submit.png', fullPage: true });

  console.log('Final URL:', page.url());
  console.log('Page title:', await page.title());
  const heading = await page.locator('h1, h2').first().textContent().catch(() => 'N/A');
  console.log('First heading:', heading);
  console.log('API requests made:', apiRequests.length ? apiRequests : 'none captured');
  console.log('Console errors:', errors.length ? errors : 'none');

  const errorText = await page.locator('[class*="error"], [class*="Error"], [role="alert"]').allTextContents().catch(() => []);
  if (errorText.filter(t => t.trim()).length) console.log('Error messages on page:', errorText.filter(t => t.trim()));

  await browser.close();
  console.log('Screenshots saved to /tmp/qa-screenshots/');
})();
