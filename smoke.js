// Headless smoke test for index.html using playwright CLI's bundled libs.
// Goal: prove the page loads, canvas renders, jump works, no console errors.
const { chromium } = require('/usr/local/lib/node_modules/playwright/index.js');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, 'index.html'));
  await page.waitForFunction(() => !!window.__catRunner);
  const s0 = await page.evaluate(() => window.__catRunner.state());
  console.log('initial state:', JSON.stringify(s0));
  await page.evaluate(() => window.__catRunner.start());
  await page.waitForTimeout(500);
  // jump a few times
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__catRunner.jump());
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(800);
  const s1 = await page.evaluate(() => window.__catRunner.state());
  console.log('after jumps:', JSON.stringify(s1));
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-running.png' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-mid.png' });
  const s2 = await page.evaluate(() => window.__catRunner.state());
  console.log('mid game:', JSON.stringify(s2));
  if (errs.length) { console.error('ERRORS:', errs); process.exit(1); }
  if (!s1.started) { console.error('game did not start'); process.exit(2); }
  console.log('SMOKE OK');
  await browser.close();
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
