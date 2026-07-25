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
  await page.goto('http://127.0.0.1:8902/?cb=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__catRunner);
  await page.click('#platformBtn');
  // capture the LEVEL banner at t=1s
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-easier-banner.png' });
  // check banner is visible
  const bannerState = await page.evaluate(() => ({
    levelBanner: window.__world.levelBanner,
    level: window.__world.level,
    lives: window.__world.lives,
    checkpoint: window.__world.checkpoint,
  }));
  console.log('banner state:', JSON.stringify(bannerState));
  // play through — run right
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-easier-play.png' });
  // walk past the midpoint to trigger checkpoint
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');
  const cpState = await page.evaluate(() => ({
    checkpoint: window.__world.checkpoint,
    catX: window.__cat.x,
  }));
  console.log('after passing midpoint:', JSON.stringify(cpState));
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-easier-mid.png' });
  // jump to test
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-easier-jump.png' });
  await browser.close();
  if (errs.length) { console.error('FAIL:'); errs.forEach(e => console.error('  -', e)); process.exit(1); }
  console.log('OK');
})();
