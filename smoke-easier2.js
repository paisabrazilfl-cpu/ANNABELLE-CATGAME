// Visual regression: multiple checkpoints + TRY AGAIN message on respawn.
// Spawns its own local server.
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
  const PORT = 8911;
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
  await page.waitForTimeout(100);
  // capture the level banner
  await page.screenshot({ path: path.join(ROOT, 'screenshot-easier2-banner.png') });
  // walk to test multiple checkpoints
  await page.waitForTimeout(2700);
  await page.screenshot({ path: path.join(ROOT, 'screenshot-easier2-start.png') });
  // jump test
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ROOT, 'screenshot-easier2-jump.png') });
  // run right + force a respawn
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__cat.invincible = 0;
    // expose the loseLife helper so the test can force a death
    if (typeof window.__catRunner.loseLife === 'function') {
      window.__catRunner.loseLife();
    }
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(ROOT, 'screenshot-easier2-tryagain.png') });
  const state = await page.evaluate(() => ({
    lives: window.__world.lives,
    respawnMsg: window.__world.respawnMsg,
    checkpoint: window.__world.checkpoint,
    catX: window.__cat.x,
    catY: window.__cat.y,
  }));
  console.log('after respawn:', JSON.stringify(state));
  await browser.close();
  server.kill();
  if (errs.length) { console.error('FAIL:'); errs.forEach(e => console.error('  -', e)); process.exit(1); }
  console.log('OK');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
