// Screenshot SNES-jungle-style platform mode
const { chromium } = require('/usr/local/lib/node_modules/playwright/index.js');
const http = require('http');
const { spawn } = require('child_process');

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
  const PORT = 8900;
  const server = spawn('node', ['serve.js'], {
    cwd: __dirname, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  await waitForServer(PORT);

  const browser = await chromium.launch({
    headless: true, executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('pageerror:', e.message));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__catRunner);
  await page.click('#platformBtn');
  await page.waitForTimeout(800);

  // Let some animation cycles complete
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-snes-jungle.png' });

  // Also a centered view
  await page.evaluate(() => {
    window.__cat.x = 300; window.__cat.y = 100;
    window.__cat.vx = 0; window.__cat.vy = 0; window.__cat.onGround = true;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-snes-jungle2.png' });

  // Bonus: full mobile viewport
  const mobileCtx = await browser.newContext({
    viewport: { width: 414, height: 800 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 2,
  });
  const mPage = await mobileCtx.newPage();
  await mPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await mPage.waitForFunction(() => !!window.__catRunner);
  await mPage.click('#platformBtn');
  await mPage.waitForTimeout(1500);
  await mPage.screenshot({ path: '/workspace/annabelle-catgame/screenshot-snes-jungle-mobile.png' });

  await browser.close();
  server.kill();
  console.log('Screenshots saved.');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
