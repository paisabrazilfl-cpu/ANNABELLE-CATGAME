// Mobile smoke test: emulate a phone viewport, exercise touch buttons, verify
// the cat moves with simulated taps on the on-screen D-pad and JUMP.
const { chromium, devices } = require('playwright');
const http = require('http');

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
  const PORT = 8768;
  const { spawn } = require('child_process');
  const server = spawn('node', ['serve.js'], {
    cwd: __dirname, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  await waitForServer(PORT);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // iPhone 12-ish viewport
  const phone = devices['iPhone 12'] || { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  const ctx = await browser.newContext({ ...phone, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console',   m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('requestfailed', r => errs.push('requestfailed: ' + r.url() + ' ' + r.failure().errorText));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__catRunner);

  // Touch controls should be visible
  const touchVisible = await page.evaluate(() => {
    const c = document.getElementById('touchControls');
    if (!c) return 'no element';
    const rect = c.getBoundingClientRect();
    const display = getComputedStyle(c).display;
    return { display, width: rect.width, height: rect.height };
  });
  console.log('touch controls:', JSON.stringify(touchVisible));
  if (touchVisible === 'no element') errs.push('touch controls element missing');
  else if (touchVisible.display === 'none') errs.push('touch controls not displayed on mobile viewport');

  // The four buttons should exist
  const btnCount = await page.evaluate(() => document.querySelectorAll('.tbtn').length);
  console.log('tbtn count:', btnCount);
  if (btnCount < 5) errs.push('expected 5 touch buttons, got ' + btnCount);

  // Take a mobile screenshot of the start screen
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-mobile-start.png' });

  // Start the game by tapping the start button
  await page.click('#startBtn');
  await page.waitForTimeout(300);

  // Test 1: tap-and-hold the RIGHT button, cat should move right
  const xStart = await page.evaluate(() => window.__cat.x);
  const rightBtn = await page.$('.tbtn[data-key="arrowright"]');
  if (!rightBtn) errs.push('right button not found');
  else {
    const box = await rightBtn.boundingBox();
    // Press and hold: pointerdown then keep held
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(400);
    const xMid = await page.evaluate(() => window.__cat.x);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const xEnd = await page.evaluate(() => window.__cat.x);
    console.log('mobile: right button test → x: start=' + xStart + ' mid=' + xMid + ' end=' + xEnd);
    if (xMid <= xStart + 20) errs.push('mobile: holding right button did not move cat right (only ' + (xMid - xStart).toFixed(1) + 'px)');
  }

  // Test 2: tap the JUMP button while on ground → cat should leave the ground
  await page.waitForTimeout(400);   // settle
  const yBefore = await page.evaluate(() => window.__cat.y);
  const onGroundBefore = await page.evaluate(() => window.__cat.onGround);
  const jumpBtn = await page.$('.tbtn[data-key=" "]');
  if (!jumpBtn) errs.push('jump button not found');
  else {
    const box = await jumpBtn.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    // small wait, then sample y at peak of jump
    await page.waitForTimeout(180);
    const yAfter = await page.evaluate(() => window.__cat.y);
    const onGroundAfter = await page.evaluate(() => window.__cat.onGround);
    console.log('mobile: jump button → y: before=' + yBefore + ' after=' + yAfter + ' onGround(before/after)=' + onGroundBefore + '/' + onGroundAfter);
    if (yAfter >= yBefore) errs.push('mobile: jump button did not make cat rise (y went from ' + yBefore + ' to ' + yAfter + ')');
  }

  // Test 3: hold DUCK while standing → cat should duck
  await page.waitForTimeout(600);   // let cat land
  const duckBtn = await page.$('.tbtn[data-key="arrowdown"]');
  const hBefore = await page.evaluate(() => window.__cat.h);
  if (duckBtn) {
    const box = await duckBtn.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(200);
    const duckHeld = await page.evaluate(() => window.__cat.duck);
    await page.mouse.up();
    console.log('mobile: duck button → ducking=' + duckHeld);
    if (!duckHeld) errs.push('mobile: holding duck button did not set cat.duck = true');
  } else {
    errs.push('duck button not found');
  }

  // Test 4: stomp via touch — reset world first, then same trick as desktop test
  await page.evaluate(() => window.__catRunner.restart());
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__obstacles.length = 0;
    window.__world.spawnTimer = 999;
    const c = window.__cat;
    const rock = { kind: 'rock', x: c.x - 5, y: c.y + c.h - 10, w: 44, h: 36, duckable: false };
    window.__obstacles.push(rock);
    c.y = rock.y - c.h + 4;
    c.vy = 400;
    c.onGround = false;
  });
  await page.waitForTimeout(200);
  const stomps = await page.evaluate(() => window.__world.stomps);
  const obLeft = await page.evaluate(() => window.__obstacles.length);
  console.log('mobile: stomp test → stomps=' + stomps + ' obstacles left=' + obLeft);
  if (stomps < 1) errs.push('mobile: stomp did not fire (' + stomps + ')');

  // Take a mid-game mobile screenshot
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-mobile-play.png' });

  // Test 5: ensure the game keeps running and the HUD is readable on a small screen
  await page.waitForTimeout(1500);
  const finalState = await page.evaluate(() => window.__catRunner.state());
  console.log('mobile: final state:', JSON.stringify(finalState));

  await browser.close();
  server.kill();

  if (errs.length) {
    console.error('MOBILE SMOKE FAIL:');
    errs.forEach(e => console.error('  -', e));
    process.exit(1);
  }
  console.log('✅ MOBILE SMOKE OK');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
