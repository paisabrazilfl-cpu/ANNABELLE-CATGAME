// Regression test: after the cat dies, the user can press R / click PLAY
// within the 350ms "death animation" window and the game-over overlay
// MUST NOT reappear over the running game.
//
// Bug found in 2026-08-11 audit (F1): the gameOver() setTimeout was not
// cancelled on restart(), so the deferred overlay-update fired anyway.
// Fix: track the timeout id in _gameOverOverlayTimer, clear it from
// both restart() and reset().
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
  const PORT = 9400;
  const ROOT = path.resolve(__dirname);
  const server = spawn('node', ['serve.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  await waitForServer(PORT);

  const browser = await chromium.launch({
    headless: true, executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console',   m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => !!window.__catRunner);

  // === Test 1: real death followed by immediate restart ===
  await page.evaluate(() => window.__catRunner.start());
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    // Force a death by colliding with a dog at the cat's exact position
    window.__obstacles.length = 0;
    window.__obstacles.push({ kind:'dog', x: window.__cat.x, y: window.__cat.y, w: 50, h: 48, duckable:false });
    window.__cat.invincible = 0;
  });
  // Wait long enough for the collision to register and the setTimeout to be scheduled,
  // but short enough to be inside the 350ms window
  await page.waitForTimeout(80);
  // Confirm we're in the death window
  const inDeathWindow = await page.evaluate(() => window.__world.over === true);
  console.log('In death window (world.over === true):', inDeathWindow);
  if (!inDeathWindow) errs.push('death not registered');

  // Restart within the 350ms window
  await page.evaluate(() => window.__catRunner.restart());

  // Wait long enough for the OLD setTimeout to have fired
  await page.waitForTimeout(500);

  // The overlay must be hidden and the card must NOT say "Game Over"
  const after1 = await page.evaluate(() => ({
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    cardText: document.querySelector('#overlay .card').textContent.replace(/\s+/g, ' ').substring(0, 100),
    worldOver: window.__world.over,
    worldStarted: window.__world.started,
  }));
  console.log('After restart + 500ms:');
  console.log('  overlay hidden:', after1.overlayHidden);
  console.log('  card text:', after1.cardText);
  console.log('  world.over:', after1.worldOver, '  world.started:', after1.worldStarted);
  if (!after1.overlayHidden) errs.push('overlay reappeared after restart');
  if (after1.cardText.includes('Game Over')) errs.push('card still says Game Over after restart');
  if (after1.worldOver !== false) errs.push('world.over was not reset to false');

  // === Test 2: rapid restart from a fresh death should work the same way ===
  await page.evaluate(() => {
    window.__obstacles.length = 0;
    window.__obstacles.push({ kind:'dog', x: window.__cat.x, y: window.__cat.y, w: 50, h: 48, duckable:false });
    window.__cat.invincible = 0;
  });
  await page.waitForTimeout(80);
  // restart again immediately
  await page.evaluate(() => window.__catRunner.restart());
  await page.waitForTimeout(500);
  const after2 = await page.evaluate(() => ({
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    cardText: document.querySelector('#overlay .card').textContent.replace(/\s+/g, ' ').substring(0, 100),
  }));
  if (!after2.overlayHidden) errs.push('second death/restart: overlay reappeared');
  if (after2.cardText.includes('Game Over')) errs.push('second death/restart: card still says Game Over');

  // === Test 2b: clicking the actual PLAY AGAIN button on the game-over card
  //               must also hide the overlay (this is the user-facing path) ===
  await page.evaluate(() => {
    window.__obstacles.length = 0;
    window.__obstacles.push({ kind:'dog', x: window.__cat.x, y: window.__cat.y, w: 50, h: 48, duckable:false });
    window.__cat.invincible = 0;
  });
  // Wait for the game-over overlay to fully appear
  await page.waitForTimeout(450);
  const cardVisible = await page.evaluate(() => document.querySelector('#overlay .card').textContent.includes('Game Over'));
  if (!cardVisible) errs.push('Game Over card did not appear after natural death');
  // Click the real PLAY AGAIN button
  await page.click('#startBtn');
  await page.waitForTimeout(300);
  const afterButton = await page.evaluate(() => ({
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    worldOver: window.__world.over,
    worldStarted: window.__world.started,
    lives: window.__world.lives,
  }));
  console.log('After clicking PLAY AGAIN:');
  console.log('  overlay hidden:', afterButton.overlayHidden, '  lives:', afterButton.lives);
  if (!afterButton.overlayHidden) errs.push('PLAY AGAIN button: overlay did not hide');
  if (afterButton.worldOver) errs.push('PLAY AGAIN button: world.over still true');
  if (afterButton.lives !== 7) errs.push('PLAY AGAIN button: lives not reset to 7');

  // === Test 3: when the user does NOT restart, the game-over overlay
  //               should appear normally after 350ms ===
  await page.evaluate(() => {
    window.__obstacles.length = 0;
    window.__obstacles.push({ kind:'dog', x: window.__cat.x, y: window.__cat.y, w: 50, h: 48, duckable:false });
    window.__cat.invincible = 0;
  });
  // wait for the full 350ms + 50ms buffer
  await page.waitForTimeout(450);
  const after3 = await page.evaluate(() => ({
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    cardText: document.querySelector('#overlay .card').textContent.replace(/\s+/g, ' ').substring(0, 100),
  }));
  console.log('After death + 450ms (no restart):');
  console.log('  overlay hidden:', after3.overlayHidden);
  console.log('  card text:', after3.cardText);
  if (after3.overlayHidden) errs.push('overlay did not appear after 350ms when user did not restart');
  if (!after3.cardText.includes('Game Over')) errs.push('card does not show Game Over after natural death');

  await page.screenshot({ path: path.join(ROOT, 'screenshot-smoke-gameover-race.png') });
  await browser.close();
  server.kill();

  if (errs.length) {
    console.error('FAIL:');
    errs.forEach(e => console.error('  -', e));
    process.exit(1);
  }
  console.log('✅ GAMEOVER RACE SMOKE OK');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
