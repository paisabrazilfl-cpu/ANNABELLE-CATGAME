// Visual regression: difficulty-easing features in platform mode
// (LEVEL banner, checkpoints, respawn message). Spawns its own local server.
const { chromium } = require('playwright');
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
  const PORT = 8902;
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
  await page.evaluate(() => window.__catRunner.startWithMode('platform'));
  // capture the LEVEL banner at t=1s
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ROOT, 'screenshot-easier-banner.png') });
  // check banner is visible
  const bannerState = await page.evaluate(() => ({
    levelBanner: window.__world.levelBanner,
    level: window.__world.level,
    lives: window.__world.lives,
    checkpoint: window.__world.checkpoint,
  }));
  console.log('banner state:', JSON.stringify(bannerState));
  // play through — run right
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ROOT, 'screenshot-easier-play.png') });
  // walk past the midpoint to trigger checkpoint
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');
  const cpState = await page.evaluate(() => ({
    checkpoint: window.__world.checkpoint,
    catX: window.__cat.x,
  }));
  console.log('after passing midpoint:', JSON.stringify(cpState));
  await page.screenshot({ path: path.join(ROOT, 'screenshot-easier-mid.png') });
  // jump to test
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ROOT, 'screenshot-easier-jump.png') });
  await browser.close();
  server.kill();
  if (errs.length) { console.error('FAIL:'); errs.forEach(e => console.error('  -', e)); process.exit(1); }
  console.log('OK');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
