const { chromium } = require('/usr/local/lib/node_modules/playwright/index.js');
(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await page.goto('http://127.0.0.1:8911/?cb=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__catRunner);
  await page.click('#platformBtn');
  await page.waitForTimeout(100);
  // capture the level banner
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-easier2-banner.png' });
  // walk to test multiple checkpoints
  await page.waitForTimeout(2700);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-easier2-start.png' });
  // jump test
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-easier2-jump.png' });
  // run right + lose life to test respawn msg
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  // simulate taking damage
  await page.evaluate(() => {
    window.__cat.invincible = 0;
    // force a death by setting lives to 1 and calling loseLife
    if (typeof window.__catRunner !== 'undefined' && window.__catRunner.loseLife) {
      window.__catRunner.loseLife();
    } else {
      // try to find loseLife via direct function call
      eval('loseLife()');
    }
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-easier2-tryagain.png' });
  const state = await page.evaluate(() => ({
    lives: window.__world.lives,
    respawnMsg: window.__world.respawnMsg,
    checkpoint: window.__world.checkpoint,
    catX: window.__cat.x,
    catY: window.__cat.y,
  }));
  console.log('after respawn:', JSON.stringify(state));
  await browser.close();
  if (errs.length) { console.error('FAIL:'); errs.forEach(e => console.error('  -', e)); process.exit(1); }
  console.log('OK');
})();
