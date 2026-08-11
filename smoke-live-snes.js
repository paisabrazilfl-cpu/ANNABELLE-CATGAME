// Live verification: SNES-jungle graphics + gravity on Render URL
const { chromium } = require('playwright');
(async () => {
  const URL = 'https://annabelle-catgame.onrender.com';
  const browser = await chromium.launch({
    headless: true, executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console',   m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('requestfailed', r => {
    const u = r.url();
    if (!u.includes('favicon')) errs.push('requestfailed: ' + u + ' ' + r.failure().errorText);
  });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => !!window.__catRunner, { timeout: 15000 });

  // Click platform mode
  await page.click('#platformBtn');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/workspace/annabelle-catgame/screenshot-live-snes.png' });

  // Verify SNES-jungle elements: leaf clusters, vines, ferns, bananas
  const checks = await page.evaluate(() => ({
    hasDrawLeafCluster: typeof drawLeafCluster === 'function',
    hasDrawVine: typeof drawVine === 'function',
    hasDrawFern: typeof drawFern === 'function',
    hasDrawBanana: typeof drawBanana === 'function',
    hasFireflies: typeof _fireflies !== 'undefined' ? _fireflies.length : 0,
    wasOnGroundPlatform: typeof window.__cat.wasOnGroundPlatform !== 'undefined',
    catY: window.__cat.y,
    platformCount: window.__platforms.length,
  }));
  console.log('checks:', JSON.stringify(checks));

  if (!checks.hasDrawLeafCluster) errs.push('drawLeafCluster missing');
  if (!checks.hasDrawVine)        errs.push('drawVine missing');
  if (!checks.hasDrawFern)        errs.push('drawFern missing');
  if (!checks.hasDrawBanana)      errs.push('drawBanana missing');
  if (!checks.wasOnGroundPlatform) errs.push('wasOnGroundPlatform field missing on cat');
  if (checks.platformCount < 6)   errs.push('expected 6 platforms, got ' + checks.platformCount);

  // pixel diversity
  const pxStats = await page.evaluate(() => {
    const cvs = document.getElementById('game');
    const cx = cvs.getContext('2d');
    const colors = new Set();
    for (let i = 0; i < 200; i++) {
      const x = Math.floor(Math.random() * cvs.width);
      const y = Math.floor(Math.random() * cvs.height);
      const d = cx.getImageData(x, y, 1, 1).data;
      colors.add(`${d[0]},${d[1]},${d[2]}`);
    }
    return { distinctColors: colors.size };
  });
  console.log('pixel diversity:', pxStats.distinctColors);
  if (pxStats.distinctColors < 50) errs.push('live background not rich enough: ' + pxStats.distinctColors);

  await browser.close();
  if (errs.length) {
    console.error('FAIL:');
    errs.forEach(e => console.error('  -', e));
    process.exit(1);
  }
  console.log('✅ LIVE SNES-JUNGLE OK');
})().catch(e => { console.error('FATAL:', e); process.exit(99); });
