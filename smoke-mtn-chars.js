// Visual regression: mountain characters (waving) in platform mode.
// Spawns its own local server so it can be run from any directory.
const { chromium } = require('/usr/local/lib/node_modules/playwright/index.js');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

async function waitForServer(port, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((res, rej) => {
        const req = http.get(`http://127.0.0.1:${port}/`, r => res(r.statusCode));
        req.on('error', rej); req.end();
      });
      return;
    } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
}

(async () => {
  const PORT = 8889;
  const ROOT = path.resolve(__dirname);
  const server = spawn('node', ['serve.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  await waitForServer(PORT);

  const browser = await chromium.launch({
    headless: true, executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?cb=` + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__catRunner);
  // platform mode
  await page.evaluate(() => window.__catRunner.startWithMode('platform'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ROOT, 'screenshot-mtn-chars.png') });
  await page.keyboard.press('Space');
  await page.waitForTimeout(50);
  await page.screenshot({ path: path.join(ROOT, 'screenshot-mtn-chars-jump.png') });
  await browser.close();
  server.kill();
  if (errs.length) { console.error('FAIL:'); errs.forEach(e => console.error('  -', e)); process.exit(1); }
  console.log('OK');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
