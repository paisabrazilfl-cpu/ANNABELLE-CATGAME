// Platform-mode smoke test
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
  const PORT = 8780;
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

  // Click PLATFORM button
  const platformBtn = await page.$('#platformBtn');
  if (!platformBtn) { console.error('no platform button'); process.exit(1); }
  await platformBtn.click();
  await page.waitForTimeout(800);

  // Verify mode set
  const state = await page.evaluate(() => ({
    mode: window.__world.mode,
    level: window.__world.level,
    lives: window.__world.lives,
    catY: window.__cat.y,
    catX: window.__cat.x,
    nPlatforms: window.__platforms ? window.__platforms.length : 0,
    nLadders: window.__ladders ? window.__ladders.length : 0,
    nItems: window.__levelItems ? window.__levelItems.length : 0,
  }));
  console.log('after starting platform mode:', JSON.stringify(state));
  if (state.mode !== 'platform') errs.push('mode not set to platform');
  if (state.level !== 1) errs.push('level not 1');
  if (state.lives !== 5) errs.push('lives not 5: ' + state.lives);
  if (state.nPlatforms < 3) errs.push('not enough platforms loaded');

  // Check internal arrays via window globals (need to expose them)
  // Let me also screenshot the start of the level
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-platform-start.png' });

  // Test 1: move right, jump, land on a platform
  await page.waitForTimeout(300);
  const xStart = await page.evaluate(() => window.__cat.x);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  const xRight = await page.evaluate(() => window.__cat.x);
  await page.keyboard.up('ArrowRight');
  console.log('platform: moved right from', xStart, 'to', xRight);
  if (xRight <= xStart + 20) errs.push('cat did not move right');

  // Test 2: jump
  await page.waitForTimeout(300);
  const yBefore = await page.evaluate(() => window.__cat.y);
  await page.keyboard.down('Space');
  await page.waitForTimeout(120);
  const yMid = await page.evaluate(() => window.__cat.y);
  await page.keyboard.up('Space');
  await page.waitForTimeout(180);
  const yAfter = await page.evaluate(() => window.__cat.y);
  console.log('platform: jump y', yBefore, '→', yMid, '→', yAfter);
  if (yMid >= yBefore) errs.push('jump did not lift cat (mid=' + yMid + ', before=' + yBefore + ')');

  // Test 3: grab a fish (force-collect by setting cat close to an item)
  await page.waitForTimeout(400);
  const collectResult = await page.evaluate(() => {
    if (!window.__levelItems) return { err: 'no levelItems exposed' };
    // place the cat directly on the first fish
    const it = window.__levelItems[0];
    window.__cat.x = it.x - 20;
    window.__cat.y = it.y - 30;
    window.__cat.vy = 0;
    return { nItems: window.__levelItems.length, firstItem: it };
  });
  await page.waitForTimeout(200);
  const fishCount = await page.evaluate(() => window.__world.fish);
  console.log('platform: fish after collection attempt:', fishCount, 'state:', JSON.stringify(collectResult));
  if (fishCount < 1) errs.push('did not collect fish (count=' + fishCount + ')');

  // Screenshot mid-level
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-platform-mid.png' });

  // Test 4: reach the goal
  await page.evaluate(() => {
    // place the cat right at the goal
    const goal = window.__goal ? window.__goal() : null;
    if (goal) {
      window.__cat.x = goal.x;
      window.__cat.y = goal.y - 30;
      window.__cat.vy = 0;
      window.__cat.onGround = false;
    }
  });
  // Force-complete by setting fish >= goal
  await page.evaluate(() => {
    window.__world.levelFish = window.__world.levelGoal;
  });
  await page.waitForTimeout(120);
  const afterGoal = await page.evaluate(() => {
    const goal = window.__goal ? window.__goal() : null;
    return {
      level: window.__world.level,
      levelComplete: window.__world.levelComplete,
      catX: window.__cat.x, catY: window.__cat.y, catVY: window.__cat.vy,
      goalX: goal ? goal.x : null, goalY: goal ? goal.y : null,
    };
  });
  console.log('platform: after reaching goal:', JSON.stringify(afterGoal));
  if (!afterGoal.levelComplete) errs.push('level did not complete on goal reach');

  // Wait for level transition
  await page.waitForTimeout(2000);
  const newLevel = await page.evaluate(() => window.__world.level);
  console.log('platform: new level after wait:', newLevel);
  if (newLevel !== 2) errs.push('did not advance to level 2 (got ' + newLevel + ')');

  // Screenshot level 2 start
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-platform-level2.png' });

  await browser.close();
  server.kill();

  if (errs.length) {
    console.error('PLATFORM SMOKE FAIL:');
    errs.forEach(e => console.error('  -', e));
    process.exit(1);
  }
  console.log('✅ PLATFORM SMOKE OK');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
