const { chromium } = require('/usr/local/lib/node_modules/playwright/index.js');
(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await page.goto('http://127.0.0.1:8889/?cb=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__catRunner);
  await page.click('#platformBtn');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-mtn-chars.png' });
  await page.keyboard.press('Space');
  await page.waitForTimeout(50);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-mtn-chars-jump.png' });
  await browser.close();
  if (errs.length) { console.error('FAIL:'); errs.forEach(e => console.error('  -', e)); process.exit(1); }
  console.log('OK');
})();
