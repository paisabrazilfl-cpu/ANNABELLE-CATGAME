// Test: cat falls between platforms + visual background richness
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
  const PORT = 8802;
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
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console',   m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('requestfailed', r => errs.push('requestfailed: ' + r.url() + ' ' + r.failure().errorText));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__catRunner);

  console.log('=== GRAVITY BETWEEN PLATFORMS ===');
  await page.click('#platformBtn');
  await page.waitForTimeout(600);

  // Dump all platforms so we can see what's where
  const platformInfo = await page.evaluate(() =>
    window.__platforms.map(p => ({ x: p.x, y: p.y, w: p.w, range: [p.x, p.x + p.w] }))
  );
  console.log('platforms:', JSON.stringify(platformInfo));

  // Place cat in midair at a known position, falling with sideways velocity so it
  // misses platforms[5] and lands on platforms[2] below.
  // platforms[5] is at y=120, x:200-700. platforms[2] is at y=360, x:460-820.
  // Start at x=460 (left edge of platforms[2]) with vx=+300. Cat will move right
  // as it falls. At y=120 (platforms[5]), cat will be at x ~ 460+15 = 475, which
  // is past x=200-700... wait, 475 IS in 200-700, so cat lands on platforms[5].
  // Need to start further right or with more velocity.
  // Start at x=550 with vx=+400, y=10. After ~1s of fall, cat moves right 400px
  // and lands somewhere. But max x = 550+400 = 950, which is past platforms[2]'s
  // right edge of 820.
  // Better: just remove platforms[5] from the platforms array temporarily and
  // let the cat fall straight down to platforms[2].
  await page.evaluate(() => {
    window.__ladders.length = 0;
    // hide platforms[5] (topmost) so the cat can fall through to platforms[2]
    const saved = window.__platforms[5];
    window.__platforms.splice(5, 1);
    window.__cat.x = 600;   // in platforms[2]'s x range
    window.__cat.y = 10;
    window.__cat.vx = 0; window.__cat.vy = 0;
    window.__cat.onGround = false;
    window.__cat.coyoteTime = 0;
    window.__cat.dropThroughTimer = 0;
    window.__cat.wasOnGroundPlatform = null;
    window.__world.onLadder = null;
    // restore after 2 seconds
    setTimeout(() => window.__platforms.splice(5, 0, saved), 2000);
  });
  // wait for fall + landing
  await page.waitForTimeout(1200);
  const afterFall = await page.evaluate(() => ({
    x: window.__cat.x, y: window.__cat.y, vy: window.__cat.vy, onGround: window.__cat.onGround,
  }));
  console.log('after falling between platforms:', JSON.stringify(afterFall));

  // dump platforms and which is closest
  const debug = await page.evaluate(() => {
    const cx = window.__cat.x, cy = window.__cat.y;
    return window.__platforms.map((p, i) => {
      const onTop = cx + 70 > p.x && cx < p.x + p.w && Math.abs((cy + 70) - p.y) < 5;
      return { i, x: p.x, y: p.y, w: p.w, dist: Math.abs((cy + 70) - p.y), onTop };
    }).sort((a, b) => a.dist - b.dist).slice(0, 3);
  });
  console.log('closest platforms:', JSON.stringify(debug));

  // Verify gravity worked: cat should have moved down (y increased). It should
  // land on SOME platform (not the floor) — that proves the gravity-between-
  // platforms fix works.
  if (afterFall.y <= 50) errs.push('cat did not fall (y=' + afterFall.y + ')');
  if (afterFall.y === 356) errs.push('cat fell all the way to the floor (x=' + afterFall.x + ', y=' + afterFall.y + ')');
  if (!debug.some(p => p.onTop)) errs.push('cat not on any platform after falling');

  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-gravity-fall.png' });

  // Test 2: gravity acceleration — drop cat from very high, verify vy grows.
  // (We don't need a starting platform; we can just put the cat in midair and
  // let gravity do its work.)
  await page.evaluate(() => {
    window.__cat.x = 50;   // outside any platform range initially
    window.__cat.y = 10;
    window.__cat.vx = 0; window.__cat.vy = 0;
    window.__cat.onGround = false;
    window.__cat.coyoteTime = 0;
    window.__cat.dropThroughTimer = 0;
    window.__cat.wasOnGroundPlatform = null;
    window.__world.onLadder = null;
  });
  // sample vy over time
  const samples = [];
  for (const ms of [50, 150, 280, 420, 600, 800]) {
    await page.waitForTimeout(ms - (samples.length ? samples[samples.length-1].atMs : 0));
    const s = await page.evaluate(() => ({ vy: window.__cat.vy, y: window.__cat.y, onGround: window.__cat.onGround, atMs: performance.now() }));
    samples.push(s);
  }
  console.log('gravity samples:', JSON.stringify(samples.map(s => ({y: s.y|0, vy: s.vy|0, g: s.onGround}))));
  const inAir = samples.filter(s => !s.onGround);
  if (inAir.length >= 2) {
    if (Math.abs(inAir[inAir.length-1].vy) <= Math.abs(inAir[0].vy)) {
      errs.push('gravity not accelerating: ' + JSON.stringify(inAir.map(s => s.vy|0)));
    }
  } else {
    errs.push('not enough in-air samples (' + inAir.length + ') to verify gravity');
  }

  // Test 3: visual richness — sample 200 pixels
  const pixelStats = await page.evaluate(() => {
    const cvs = document.getElementById('game');
    const ctx = cvs.getContext('2d');
    const colors = new Set();
    for (let i = 0; i < 200; i++) {
      const x = Math.floor(Math.random() * cvs.width);
      const y = Math.floor(Math.random() * cvs.height);
      const d = ctx.getImageData(x, y, 1, 1).data;
      colors.add(`${d[0]},${d[1]},${d[2]}`);
    }
    return { distinctColors: colors.size, totalSamples: 200 };
  });
  console.log('pixel diversity (200 samples):', pixelStats.distinctColors);
  if (pixelStats.distinctColors < 50) errs.push('background not rich enough: ' + pixelStats.distinctColors + ' colors');

  // Test 4: check air streaks function exists and works
  const airStreaks = await page.evaluate(() => {
    window.__cat.x = 50;
    window.__cat.y = 10;
    window.__cat.vx = 0; window.__cat.vy = 0; window.__cat.onGround = false;
    return typeof drawAirStreaks === 'function';
  });
  if (!airStreaks) errs.push('drawAirStreaks not defined');
  await page.waitForTimeout(500);   // let air streaks spawn

  // Test 5: check ambient particles (shooting stars, fireflies)
  const ambient = await page.evaluate(() => ({
    fireflies: typeof _fireflies !== 'undefined' ? _fireflies.length : 0,
    shootingStars: typeof _shootingStars !== 'undefined' ? _shootingStars.length : 0,
  }));
  console.log('ambient particles:', JSON.stringify(ambient));

  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-gravity-mid.png' });

  // ENDLESS BACKGROUND TEST
  console.log('=== ENDLESS BACKGROUND ===');
  await page.evaluate(() => window.__catRunner.restart());
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__world.mode = 'endless'; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-endless-gravity.png' });

  await browser.close();
  server.kill();

  if (errs.length) {
    console.error('FAIL:');
    errs.forEach(e => console.error('  -', e));
    process.exit(1);
  }
  console.log('✅ GRAVITY + BACKGROUND SMOKE OK');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
