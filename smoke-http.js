const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newContext({ viewport: { width: 1000, height: 600 } }).then(c => c.newPage());
  const errs = [];
  page.on('pageerror',  e => errs.push('pageerror: ' + e.message));
  page.on('console',    m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('requestfailed', r => errs.push('requestfailed: ' + r.url() + ' ' + r.failure().errorText));
  const url = process.argv[2];
  console.log('loading', url);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__catRunner);
  const s0 = await page.evaluate(() => window.__catRunner.state());
  console.log('initial:', JSON.stringify(s0));
  await page.evaluate(() => window.__catRunner.start());
  await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__catRunner.jump()); await page.waitForTimeout(700); }
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-http.png' });
  const s1 = await page.evaluate(() => window.__catRunner.state());
  console.log('after 4 jumps:', JSON.stringify(s1));
  if (errs.length) { console.error('ERRORS:'); errs.forEach(e => console.error(' ', e)); process.exit(1); }
  if (!s1.started) { console.error('not started'); process.exit(2); }
  console.log('HTTP SMOKE OK');
  await browser.close();
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
