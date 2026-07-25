// Mobile screenshot test: render the page at iPhone 12 size and capture
// both the start screen and mid-game to verify the layout is clean.
const { chromium, devices } = require('/usr/local/lib/node_modules/playwright/index.js');
const http = require('http');
const { spawn } = require('child_process');

async function waitForServer(port, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((res, rej) => {
        const req = http.get(`http://127.0.0.1:${port}/`, r => res(r.statusCode));
        req.on('error', rej);
        req.end();
      });
      return;
    } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
}

(async () => {
  const PORT = 8773;
  const server = spawn('node', ['serve.js'], {
    cwd: __dirname, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  await waitForServer(PORT);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const phone = devices['iPhone 12'] || { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  const ctx = await browser.newContext({ ...phone, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console',   m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('requestfailed', r => errs.push('requestfailed: ' + r.url() + ' ' + r.failure().errorText));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__catRunner);

  // Screenshot 1: start screen
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-mobile-fixed-start.png' });

  // inspect layout
  const layout = await page.evaluate(() => {
    const stage = document.getElementById('stage');
    const cvs = document.getElementById('game');
    const touch = document.getElementById('touchControls');
    const overlay = document.getElementById('overlay');
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      stage: stage.getBoundingClientRect().toJSON(),
      canvas: cvs.getBoundingClientRect().toJSON(),
      touch: { rect: touch.getBoundingClientRect().toJSON(), display: getComputedStyle(touch).display, opacity: getComputedStyle(touch).opacity },
      overlay: { display: getComputedStyle(overlay).display },
      hud: document.querySelector('.hud').getBoundingClientRect().toJSON(),
    };
  });
  console.log('LAYOUT (start):', JSON.stringify(layout, null, 2));

  // Start the game
  await page.click('#startBtn');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-mobile-fixed-play.png' });

  // inspect after start
  const layout2 = await page.evaluate(() => {
    const cvs = document.getElementById('game');
    const touch = document.getElementById('touchControls');
    const overlay = document.getElementById('overlay');
    return {
      canvas: cvs.getBoundingClientRect().toJSON(),
      touch: { display: getComputedStyle(touch).display, opacity: getComputedStyle(touch).opacity },
      overlay: { display: getComputedStyle(overlay).display, hidden: overlay.classList.contains('hidden') },
    };
  });
  console.log('LAYOUT (playing):', JSON.stringify(layout2, null, 2));

  // Test 1: hold RIGHT works
  const xStart = await page.evaluate(() => window.__cat.x);
  const r = await page.$('.tbtn[data-key="arrowright"]');
  const rb = await r.boundingBox();
  await page.mouse.move(rb.x + rb.width/2, rb.y + rb.height/2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  const xMid = await page.evaluate(() => window.__cat.x);
  await page.mouse.up();
  console.log('right button: x', xStart, '→', xMid, '(+', xMid - xStart, 'px)');
  if (xMid <= xStart + 20) errs.push('right button did not move cat');

  // Screenshot 3: after running right
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-mobile-fixed-running.png' });

  // Test 2: tap JUMP
  await page.waitForTimeout(500);
  const yBefore = await page.evaluate(() => window.__cat.y);
  const j = await page.$('.tbtn[data-key=" "]');
  const jb = await j.boundingBox();
  await page.touchscreen.tap(jb.x + jb.width/2, jb.y + jb.height/2);
  await page.waitForTimeout(180);
  const yAfter = await page.evaluate(() => window.__cat.y);
  console.log('jump: y', yBefore, '→', yAfter, '(' + (yAfter - yBefore) + 'px)');
  if (yAfter >= yBefore) errs.push('jump did not lift cat');

  // Screenshot 4: cat mid-jump
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-mobile-fixed-jumping.png' });

  await browser.close();
  server.kill();

  if (errs.length) {
    console.error('FAIL:');
    errs.forEach(e => console.error('  -', e));
    process.exit(1);
  }
  console.log('✅ MOBILE FIXED SMOKE OK');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
