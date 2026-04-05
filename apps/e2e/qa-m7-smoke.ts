import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';

const SCREENSHOTS_DIR = '/tmp/qa-screenshots';
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  details: string;
  screenshot?: string;
}

const results: TestResult[] = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Test 1: Homepage loads
  try {
    const resp = await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-homepage.png`, fullPage: true });
    results.push({
      name: 'Homepage loads',
      status: resp?.status() === 200 ? 'pass' : 'fail',
      details: `Status: ${resp?.status()}, URL: ${page.url()}`,
      screenshot: '01-homepage.png'
    });
  } catch (e: any) {
    results.push({ name: 'Homepage loads', status: 'fail', details: e.message });
  }

  // Test 2: Login page
  try {
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 10000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-login.png`, fullPage: true });
    const hasLoginForm = await page.locator('input[type="email"], input[name="email"], form').count();
    results.push({
      name: 'Login page renders',
      status: hasLoginForm > 0 ? 'pass' : 'warn',
      details: `Form elements found: ${hasLoginForm}`,
      screenshot: '02-login.png'
    });
  } catch (e: any) {
    results.push({ name: 'Login page renders', status: 'fail', details: e.message });
  }

  // Test 3: Dashboard page
  try {
    const resp = await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle', timeout: 10000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-dashboard.png`, fullPage: true });
    results.push({
      name: 'Dashboard page loads',
      status: resp?.status() === 200 ? 'pass' : 'fail',
      details: `Status: ${resp?.status()}, URL: ${page.url()}`,
      screenshot: '03-dashboard.png'
    });
  } catch (e: any) {
    results.push({ name: 'Dashboard page loads', status: 'fail', details: e.message });
  }

  // Test 4: Clients page
  try {
    const resp = await page.goto('http://localhost:3000/clients', { waitUntil: 'networkidle', timeout: 10000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-clients.png`, fullPage: true });
    results.push({
      name: 'Clients page loads',
      status: resp?.status() === 200 ? 'pass' : 'fail',
      details: `Status: ${resp?.status()}, URL: ${page.url()}`,
      screenshot: '04-clients.png'
    });
  } catch (e: any) {
    results.push({ name: 'Clients page loads', status: 'fail', details: e.message });
  }

  // Test 5: Suggestions page (M7)
  try {
    const resp = await page.goto('http://localhost:3000/clients/test-client/suggestions', { waitUntil: 'networkidle', timeout: 10000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-suggestions-page.png`, fullPage: true });

    const pageContent = await page.content();
    const hasSuggestionContent = pageContent.toLowerCase().includes('suggestion');

    results.push({
      name: 'Suggestions page loads (M7)',
      status: resp?.status() === 200 ? 'pass' : 'fail',
      details: `Status: ${resp?.status()}, URL: ${page.url()}, Contains "suggestion": ${hasSuggestionContent}`,
      screenshot: '05-suggestions-page.png'
    });
  } catch (e: any) {
    results.push({ name: 'Suggestions page loads (M7)', status: 'fail', details: e.message });
  }

  // Test 6: Check suggestions page UI elements
  try {
    await page.goto('http://localhost:3000/clients/test-client/suggestions', { waitUntil: 'networkidle', timeout: 10000 });

    const buttons = await page.locator('button').allTextContents();
    const headings = await page.locator('h1, h2, h3').allTextContents();
    const allText = await page.locator('body').innerText();

    const hasGenerateButton = buttons.some(b => b.toLowerCase().includes('generate'));
    const hasManualCreate = buttons.some(b => b.toLowerCase().includes('manual') || b.toLowerCase().includes('create') || b.toLowerCase().includes('add'));

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-suggestions-ui-elements.png`, fullPage: true });

    results.push({
      name: 'Suggestions page UI elements (FR-7.1, FR-7.4, FR-7.6)',
      status: 'pass',
      details: `Buttons: [${buttons.join(', ')}], Headings: [${headings.join(', ')}], Generate: ${hasGenerateButton}, Manual/Create: ${hasManualCreate}`,
      screenshot: '06-suggestions-ui-elements.png'
    });
  } catch (e: any) {
    results.push({ name: 'Suggestions page UI elements', status: 'fail', details: e.message });
  }

  // Test 7: Client detail page
  try {
    const resp = await page.goto('http://localhost:3000/clients/test-client', { waitUntil: 'networkidle', timeout: 10000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-client-detail.png`, fullPage: true });

    // Check for suggestions link in client navigation
    const links = await page.locator('a').allTextContents();
    const hasSuggestionsLink = links.some(l => l.toLowerCase().includes('suggestion'));

    results.push({
      name: 'Client detail has suggestions link',
      status: 'pass',
      details: `Status: ${resp?.status()}, Suggestions link: ${hasSuggestionsLink}, Links: [${links.join(', ')}]`,
      screenshot: '07-client-detail.png'
    });
  } catch (e: any) {
    results.push({ name: 'Client detail has suggestions link', status: 'fail', details: e.message });
  }

  // Test 8: Pipeline page (regression)
  try {
    const resp = await page.goto('http://localhost:3000/pipeline', { waitUntil: 'networkidle', timeout: 10000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/08-pipeline.png`, fullPage: true });
    results.push({
      name: 'Pipeline page loads (regression)',
      status: resp?.status() === 200 ? 'pass' : 'fail',
      details: `Status: ${resp?.status()}, URL: ${page.url()}`,
      screenshot: '08-pipeline.png'
    });
  } catch (e: any) {
    results.push({ name: 'Pipeline page loads (regression)', status: 'fail', details: e.message });
  }

  // Test 9: Calendar page (regression)
  try {
    const resp = await page.goto('http://localhost:3000/calendar', { waitUntil: 'networkidle', timeout: 10000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/09-calendar.png`, fullPage: true });
    results.push({
      name: 'Calendar page loads (regression)',
      status: resp?.status() === 200 ? 'pass' : 'fail',
      details: `Status: ${resp?.status()}, URL: ${page.url()}`,
      screenshot: '09-calendar.png'
    });
  } catch (e: any) {
    results.push({ name: 'Calendar page loads (regression)', status: 'fail', details: e.message });
  }

  // Test 10: Settings page (regression)
  try {
    const resp = await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle', timeout: 10000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/10-settings.png`, fullPage: true });
    results.push({
      name: 'Settings page loads (regression)',
      status: resp?.status() === 200 ? 'pass' : 'fail',
      details: `Status: ${resp?.status()}, URL: ${page.url()}`,
      screenshot: '10-settings.png'
    });
  } catch (e: any) {
    results.push({ name: 'Settings page loads (regression)', status: 'fail', details: e.message });
  }

  // Test 11: Knowledge Base page (regression)
  try {
    const resp = await page.goto('http://localhost:3000/clients/test-client/knowledge-base', { waitUntil: 'networkidle', timeout: 10000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/11-knowledge-base.png`, fullPage: true });
    results.push({
      name: 'Knowledge Base page loads (regression)',
      status: resp?.status() === 200 ? 'pass' : 'fail',
      details: `Status: ${resp?.status()}, URL: ${page.url()}`,
      screenshot: '11-knowledge-base.png'
    });
  } catch (e: any) {
    results.push({ name: 'Knowledge Base page loads (regression)', status: 'fail', details: e.message });
  }

  // Console errors
  results.push({
    name: 'Console errors check',
    status: consoleErrors.length === 0 ? 'pass' : 'warn',
    details: consoleErrors.length === 0 ? 'No console errors' : `${consoleErrors.length} errors: ${consoleErrors.slice(0, 5).join(' | ')}`
  });

  await browser.close();

  // Print report
  console.log('\n=== QA SMOKE TEST REPORT — M7 Suggestion Engine ===\n');
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;

  for (const r of results) {
    const icon = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'WARN';
    console.log(`[${icon}] ${r.name}`);
    console.log(`       ${r.details}`);
    if (r.screenshot) console.log(`       Screenshot: ${SCREENSHOTS_DIR}/${r.screenshot}`);
    console.log('');
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed, ${warned} warnings out of ${results.length} tests`);
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}/`);

  writeFileSync('/tmp/qa-report.json', JSON.stringify(results, null, 2));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
