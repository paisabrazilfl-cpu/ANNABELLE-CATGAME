// Comprehensive smoke test for fall-down + physics + graphics
const { chromium, devices } = require('playwright');
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
  const PORT = 8786;
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

  // ===================== PLATFORM MODE TESTS =====================
  console.log('=== PLATFORM MODE: FALL + PHYSICS + GRAPHICS ===');
  await page.click('#platformBtn');
  await page.waitForTimeout(600);

  // Test 1: cat has the new physics fields
  const hasFields = await page.evaluate(() => {
    const c = window.__cat;
    return {
      hasCoyote: 'coyoteTime' in c,
      hasBuffer:  'jumpBuffer' in c,
      hasDrop:    'dropThroughTimer' in c,
      hasTerminal:'terminalVel' in c,
      terminalVal: c.terminalVel,
    };
  });
  console.log('physics fields:', JSON.stringify(hasFields));
  if (!hasFields.hasCoyote)   errs.push('missing coyoteTime field');
  if (!hasFields.hasBuffer)    errs.push('missing jumpBuffer field');
  if (!hasFields.hasDrop)      errs.push('missing dropThroughTimer field');
  if (!hasFields.hasTerminal)  errs.push('missing terminalVel field');
  if (hasFields.terminalVal < 500 || hasFields.terminalVal > 2000) errs.push('terminal velocity seems wrong: ' + hasFields.terminalVal);

  // Test 2: walk off the RIGHT edge of a platform — cat should fall
  // Use a platform with NO ladders on it. There isn't one in level 1 (all
  // platforms have ladder access), so we manually remove a ladder.
  await page.evaluate(() => {
    // remove all ladders for the test, just to have a clean platform
    window.__ladders.length = 0;
    const p = window.__platforms[1];
    window.__cat.x = p.x + 10;
    window.__cat.y = p.y - window.__cat.h;
    window.__cat.vx = 0; window.__cat.vy = 0; window.__cat.onGround = true;
    window.__cat.coyoteTime = 0;
    window.__world.onLadder = null;
  });
  await page.waitForTimeout(150);
  // sample y mid-fall (cat should be falling for at least 100ms after walking off)
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1200);  // cat walks off + falls
  await page.keyboard.up('ArrowRight');
  const afterWalkOff = await page.evaluate(() => ({
    x: window.__cat.x, y: window.__cat.y, vy: window.__cat.vy, onGround: window.__cat.onGround,
  }));
  console.log('after walking off platform right edge:', JSON.stringify(afterWalkOff));
  // The cat was at y=290 on platforms[1], then walked off. With the magnetic-
  // platform bug fix, the cat should fall to platforms[2] (y=290) OR to the
  // floor (y=356). Either is correct. The key is: the cat should NOT be
  // stuck at y=290 on platforms[1] with the same x as when it started.
  if (afterWalkOff.x <= 360) errs.push('cat did not walk off the platform (x=' + afterWalkOff.x + ' should be > 360)');
  if (!afterWalkOff.onGround) errs.push('cat still falling after 1200ms (y=' + afterWalkOff.y + ', vy=' + afterWalkOff.vy + ')');
  // Cat should be on EITHER a lower platform (y=170, 290) OR the floor (y=356)
  const validYs = [50, 170, 290, 356];   // platforms[5,4/3,2/1, floor]
  if (!validYs.includes(afterWalkOff.y)) errs.push('cat at unexpected y=' + afterWalkOff.y + ' (valid: ' + validYs.join(',') + ')');

  // Test 3: drop-through with DOWN + JUMP
  // Reset cat to a platform first
  await page.evaluate(() => {
    const p = window.__platforms[2];
    window.__cat.x = p.x + 30;
    window.__cat.y = p.y - window.__cat.h;
    window.__cat.vx = 0; window.__cat.vy = 0; window.__cat.onGround = true;
    window.__cat.coyoteTime = 0;
    window.__cat.dropThroughTimer = 0;
  });
  await page.waitForTimeout(100);
  const yBeforeDrop = await page.evaluate(() => window.__cat.y);
  // DOWN + SPACE
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  await page.keyboard.up('Space');
  await page.keyboard.up('ArrowDown');
  const afterDrop = await page.evaluate(() => ({
    y: window.__cat.y, vy: window.__cat.vy, onGround: window.__cat.onGround,
    dropTimer: window.__cat.dropThroughTimer,
  }));
  console.log('drop-through: y before=' + yBeforeDrop + ', after=' + afterDrop.y);
  if (afterDrop.y <= yBeforeDrop + 5) errs.push('drop-through did not drop the cat (y went from ' + yBeforeDrop + ' to ' + afterDrop.y + ')');

  // Test 4: jump buffer — set cat to be falling just above a platform, with a
  // queued jump, and verify the jump fires on landing.
  // We sample RIGHT AFTER the cat would land (within 30ms) to catch the jump
  // mid-arc, before the cat comes back down to the platform.
  await page.evaluate(() => {
    const p = window.__platforms[3];
    window.__cat.x = p.x + 20;
    window.__cat.y = p.y - window.__cat.h - 6;   // 6px above platform
    window.__cat.vy = 100;                       // falling
    window.__cat.onGround = false;
    window.__cat.coyoteTime = 0;
    window.__cat.jumpBuffer = 0.10;              // queued jump
  });
  await page.waitForTimeout(110);                // cat lands (~60ms) + jump fires + arcs up a bit
  const afterBuffer = await page.evaluate(() => ({
    y: window.__cat.y, vy: window.__cat.vy, onGround: window.__cat.onGround,
  }));
  console.log('after jump buffer test:', JSON.stringify(afterBuffer));
  // The jump fires on landing then arcs up. The cat should have negative vy
  // (going up) at this point.
  if (afterBuffer.vy >= 0) errs.push('jump buffer did not fire (vy=' + afterBuffer.vy + ' after buffered jump)');

  // Test 5: coyote time — leave a platform, jump within 100ms, should still jump
  await page.evaluate(() => {
    const p = window.__platforms[3];
    window.__cat.x = p.x + 20;
    window.__cat.y = p.y - window.__cat.h;
    window.__cat.vx = 200; window.__cat.vy = 0; window.__cat.onGround = true;
    window.__cat.coyoteTime = 0;
  });
  await page.waitForTimeout(50);
  // jump right as we leave the platform
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const afterCoyote = await page.evaluate(() => ({ vy: window.__cat.vy, onGround: window.__cat.onGround }));
  console.log('after coyote jump:', JSON.stringify(afterCoyote));

  // Screenshot
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-platform-better.png' });

  // ===================== ENDLESS MODE GRAPHICS TEST =====================
  console.log('=== ENDLESS MODE: GRAPHICS ===');
  await page.evaluate(() => window.__catRunner.restart());
  await page.waitForTimeout(300);
  // make sure endless mode
  await page.evaluate(() => { window.__world.mode = 'endless'; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-endless-better.png' });

  // ===================== VISUAL QUALITY CHECKS =====================
  // Sample some pixels from the canvas to verify rendering is non-trivial
  const pixelStats = await page.evaluate(() => {
    const cvs = document.getElementById('game');
    const ctx = cvs.getContext('2d');
    // sample 100 random pixels and count distinct colors
    const colors = new Set();
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(Math.random() * cvs.width);
      const y = Math.floor(Math.random() * cvs.height);
      const d = ctx.getImageData(x, y, 1, 1).data;
      colors.add(`${d[0]},${d[1]},${d[2]}`);
    }
    return { distinctColors: colors.size, totalSamples: 100 };
  });
  console.log('pixel diversity:', JSON.stringify(pixelStats));
  if (pixelStats.distinctColors < 10) errs.push('canvas looks too uniform (' + pixelStats.distinctColors + ' distinct colors)');

  await browser.close();
  server.kill();

  if (errs.length) {
    console.error('FAIL:');
    errs.forEach(e => console.error('  -', e));
    process.exit(1);
  }
  console.log('✅ FALL + PHYSICS + GRAPHICS SMOKE OK');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
