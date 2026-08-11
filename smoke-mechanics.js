// Smoke test for the Mario-style air-control + stomp mechanics.
// Simulates: run left, run right, jump, jump onto an enemy, verify score/stomps.
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
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
  throw new Error('server did not start in time');
}

(async () => {
  // boot the local server
  const PORT = 8766;
  const server = spawn('node', ['serve.js'], {
    cwd: __dirname, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  await waitForServer(PORT);

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newContext({ viewport: { width: 1000, height: 600 } }).then(c => c.newPage());
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console',   m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('requestfailed', r => errs.push('requestfailed: ' + r.url() + ' ' + r.failure().errorText));

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => !!window.__catRunner);

  // Start the game
  await page.evaluate(() => window.__catRunner.start());
  await page.waitForTimeout(400);

  // Test 1: cat can move left and right (on ground)
  const catStart = await page.evaluate(() => window.__cat.x);
  console.log('catStart x:', catStart);

  // Press D for 0.5s, then A for 0.5s, capture cat.x
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  const xAfterD = await page.evaluate(() => window.__cat.x);
  await page.keyboard.up('d');
  // give friction a moment to settle
  await page.waitForTimeout(400);
  await page.keyboard.down('a');
  await page.waitForTimeout(500);
  const xAfterA = await page.evaluate(() => window.__cat.x);
  await page.keyboard.up('a');
  console.log('x after D (should be > start):', xAfterD);
  console.log('x after A (should be < xAfterD):', xAfterA);
  if (xAfterD <= catStart.x + 20) errs.push(`cat did not move right (start=${catStart.x}, afterD=${xAfterD})`);
  if (xAfterA >= xAfterD - 20)     errs.push(`cat did not move left (afterD=${xAfterD}, afterA=${xAfterA})`);

  // Test 2: cat can move mid-air (jump, hold D while in air, verify x changes while vy<0)
  // First wait for cat to be fully stopped
  await page.waitForTimeout(500);
  // Pick the cat up into the air by directly setting vy (testing air control)
  await page.evaluate(() => { window.__cat.vy = -300; window.__cat.onGround = false; });
  const xAirStart = await page.evaluate(() => window.__cat.x);
  const vyStart   = await page.evaluate(() => window.__cat.vy);
  console.log('pre-air x:', xAirStart, 'vy:', vyStart);
  await page.keyboard.down('d');
  await page.waitForTimeout(250);
  const xMidAir = await page.evaluate(() => window.__cat ? window.__cat.x : null);
  const vyMid   = await page.evaluate(() => window.__cat ? window.__cat.vy : null);
  await page.keyboard.up('d');
  console.log('after mid-air D x:', xMidAir, 'vy:', vyMid, '(should be > xAirStart)');
  if (xMidAir !== null && xMidAir <= xAirStart + 5) errs.push('cat did not move mid-air (only ' + (xMidAir - xAirStart).toFixed(1) + 'px in 250ms)');

  // Wait for landing
  await page.waitForTimeout(800);

  // Test 3: STOMP mechanic — inject a rock directly under the cat, set cat.vy > 0,
  // verify stomps increments and obstacle is removed.
  // First, wait for the cat to be back on the ground.
  await page.waitForTimeout(600);
  const stompBefore = await page.evaluate(() => window.__world.stomps);
  console.log('stomps before stomp test:', stompBefore);
  // Jump first, then place rock below, then re-trigger physics by setting vy positive.
  // We do it in one shot: place rock, make cat airborne and falling, then check after a frame.
  const stompOutcome = await page.evaluate(() => {
    // clear any existing obstacles
    // (access via globals the smoke test has set up)
    // We need access to the obstacles array; expose it for tests
    // (handled below in the test file)
    return 'unreachable-from-eval-without-accessor';
  });
  // Manually verify stomp logic by directly manipulating the obstacle array via window.__obstacles
  // First: reset world to avoid side-effects from earlier tests
  await page.evaluate(() => window.__catRunner.restart());
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    // ensure clean state
    if (window.__obstacles) window.__obstacles.length = 0;
    window.__world.spawnTimer = 999;   // freeze spawning
    // place a rock directly under the cat
    const cat = window.__cat;
    if (!window.__obstacles) return;
    const rock = { kind: 'rock', x: cat.x - 5, y: cat.y + cat.h - 10, w: 44, h: 36, duckable: false };
    window.__obstacles.push(rock);
    // put the cat mid-air just above the rock, falling
    cat.y = rock.y - cat.h + 4;
    cat.vy = 400;        // falling
    cat.onGround = false;
  });
  // Inspect immediately after injection
  const inspectAfterInject = await page.evaluate(() => {
    const c = window.__cat;
    const o = window.__obstacles[0];
    return { catY: c.y, catVY: c.vy, catBottom: c.y + c.h, catOnGround: c.onGround,
             rockY: o.y, rockBottom: o.y + o.h,
             overlap: (c.x < o.x + o.w) && (c.x + c.w > o.x) && (c.y + c.h > o.y) && (c.y < o.y + o.h) };
  });
  console.log('after inject:', JSON.stringify(inspectAfterInject));
  await page.waitForTimeout(120);   // a few frames for physics + collision
  // Capture a single tick of stomp-check internals
  const frame = await page.evaluate(() => {
    const c = window.__cat;
    const o = window.__obstacles[0];
    if (!o) return { note: 'no obstacle left' };
    const catY = c.y, catBottom = c.y + c.h;
    // emulate the stomp check
    const prevCatBottom = catBottom - c.vy * (1/60);
    return { catY, catVY: c.vy, catBottom, rockY: o.y, rockBottom: o.y + o.h,
             wasAbove: prevCatBottom <= o.y + 4, isFalling: c.vy > 50, over: window.__world.over };
  });
  console.log('single-frame stomp check:', JSON.stringify(frame));
  const inspectAfterFrames = await page.evaluate(() => {
    const c = window.__cat;
    return { catY: c.y, catVY: c.vy, catOnGround: c.onGround, over: window.__world.over, stomps: window.__world.stomps };
  });
  console.log('after 120ms:', JSON.stringify(inspectAfterFrames));
  const stompAfter = await page.evaluate(() => window.__world.stomps);
  const obCount    = await page.evaluate(() => window.__obstacles.length);
  console.log('stomps after stomp test:', stompAfter, 'obstacles left:', obCount);
  if (stompAfter <= stompBefore) errs.push('stomp did not increment');
  if (obCount !== 0)              errs.push('rock not removed after stomp (' + obCount + ' left)');

  // Wait a moment for the cat to land, then resume normal play
  await page.waitForTimeout(800);

  // Test 4: just let the game run a couple seconds and ensure no errors,
  // cat is alive, score is incrementing.
  const t0 = await page.evaluate(() => window.__catRunner.state());
  await page.waitForTimeout(2000);
  const t1 = await page.evaluate(() => window.__catRunner.state());
  console.log('after 2s play, state:', JSON.stringify(t1));
  if (t1.score <= t0.score && !t1.over) errs.push('score not incrementing over 2s of play');

  // Take a screenshot
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-mechanics.png' });

  await browser.close();
  server.kill();

  if (errs.length) {
    console.error('SMOKE FAIL:');
    errs.forEach(e => console.error('  -', e));
    process.exit(1);
  }
  console.log('✅ MECHANICS SMOKE OK');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
