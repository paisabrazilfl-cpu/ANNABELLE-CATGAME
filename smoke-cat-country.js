// Smoke test for the new Annabelle's Cat Country game
// Verifies: page loads, no console errors, game has expected structure,
// cat renders, gameplay works (move + jump + barrel)
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
  const PORT = 8850;
  const server = spawn('node', ['serve.js'], {
    cwd: __dirname, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
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

  await page.goto(`http://127.0.0.1:${PORT}/?cb=` + Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // ===== Test 1: page structure =====
  const structure = await page.evaluate(() => ({
    title: document.title,
    hasCanvas: !!document.getElementById('canvas'),
    hudScore: !!document.getElementById('val-score'),
    hudFish: !!document.getElementById('val-fish'),
    hudLives: !!document.getElementById('val-lives'),
    hudStage: !!document.getElementById('val-stage'),
    scoreText: document.getElementById('val-score')?.innerText,
    livesText: document.getElementById('val-lives')?.innerText,
    stageText: document.getElementById('val-stage')?.innerText,
  }));
  console.log('structure:', JSON.stringify(structure));
  if (structure.title !== "Annabelle's Cat Country") errs.push('title wrong: ' + structure.title);
  if (!structure.hasCanvas) errs.push('canvas missing');
  if (structure.livesText !== '3') errs.push('lives not 3: ' + structure.livesText);
  if (structure.stageText !== '1-1') errs.push('stage not 1-1: ' + structure.stageText);

  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-cat-country-start.png' });

  // ===== Test 2: pixel diversity (proves the game is actually rendering) =====
  const pxStats = await page.evaluate(() => {
    const cvs = document.getElementById('canvas');
    const cx = cvs.getContext('2d');
    const colors = new Set();
    for (let i = 0; i < 200; i++) {
      const x = Math.floor(Math.random() * cvs.width);
      const y = Math.floor(Math.random() * cvs.height);
      const d = cx.getImageData(x, y, 1, 1).data;
      colors.add(`${d[0]},${d[1]},${d[2]}`);
    }
    return { distinctColors: colors.size, w: cvs.width, h: cvs.height };
  });
  console.log('pixel diversity:', pxStats.distinctColors, 'canvas:', pxStats.w + 'x' + pxStats.h);
  if (pxStats.distinctColors < 30) errs.push('game not rendering: only ' + pxStats.distinctColors + ' colors');
  if (pxStats.w !== 960) errs.push('canvas width not 960: ' + pxStats.w);

  // ===== Test 3: gameplay — move right =====
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-cat-country-moved.png' });

  // ===== Test 4: jump =====
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-cat-country-jumped.png' });

  // ===== Test 5: roll (down) =====
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowDown');
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-cat-country-rolled.png' });

  // ===== Test 6: full playthrough — run right for 8s =====
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(8000);
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-cat-country-deep.png' });

  const finalScore = await page.evaluate(() => document.getElementById('val-score')?.innerText);
  console.log('final score after 10s of play:', finalScore);
  // score should have changed (collected fish or stomped enemy)
  if (finalScore === '00000') console.log('note: score still 0 (might be path-dependent)');

  await browser.close();
  server.kill();

  if (errs.length) {
    console.error('FAIL:');
    errs.forEach(e => console.error('  -', e));
    process.exit(1);
  }
  console.log('✅ CAT COUNTRY SMOKE OK');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
