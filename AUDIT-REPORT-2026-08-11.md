# Annabelle's Cat Runner — Exhaustive Repository Audit
**Date:** 2026-08-11
**Branch:** `2026-08-11__methodical-notes__exhaustive-audit` (commit `6bee161`)
**Merged into:** `2026-07-25__methodical-notes__initial-cat-runner-game` (commit `d20567e`)
**Live URL:** https://annabelle-catgame.onrender.com
**Live MD5:** `2de6b1d3bef5080d92b66100cb526607`
**Local MD5:** `2de6b1d3bef5080d92b66100cb526607`
**Operator:** Luis (paisabrazilfl-cpu) for Annabelle (10y)

---

## EXECUTIVE SUMMARY

The repository was audited line-by-line. 4 defects were found, all fixed and
verified. All 7 core smoke tests pass. Live URL serves the new code, MD5
verified byte-identical to the local build.

| ID | Severity | Status | Description |
|---|---|---|---|
| F1 | HIGH (real bug, reproducible) | FIXED + REGRESSION TESTED | `gameOver()` setTimeout race; pressing R/SPACE/PLAY AGAIN within 350ms of death left a "Game Over" card slammed over the running game |
| F2 | HIGH (rebuild would fail) | FIXED | All 13 smoke tests hardcoded `/usr/local/lib/node_modules/playwright/index.js`. Fresh clone + `npm install` would put Playwright in `node_modules/` and tests would still fail |
| F3 | LOW (memory leak on mode switch) | FIXED | `reset()` cleared endless-mode arrays but not platform-mode arrays; switching modes repeatedly leaked memory |
| F4 | COSMETIC (stale comment) | FIXED | Header comment in `index.html` said "one white-pixel texture" but the game actually uses `fillRect` calls |

---

## METHOD

1. **Read every source file end-to-end** (`index.html`, `serve.js`, `package.json`, `render.yaml`, `.gitignore`, `README.md`, `PLAY.sh`, `bootstrap.sh`, all 13 `smoke-*.js` files).
2. **Reproduced** each defect that was reproducible (F1, F2). F3 and F4 were evident from code reading.
3. **Implemented** the smallest possible fix for each.
4. **Verified** with regression tests added to the existing smoke suite.
5. **Pushed, deployed, re-verified** against the live URL.

---

## DEFECT 1 (F1) — gameOver setTimeout race [FIXED + REGRESSION TESTED]

### Reproduction (BEFORE the fix)

```js
// BEFORE — gameOver() in index.html
setTimeout(() => {
  const o = document.getElementById('overlay');
  o.classList.remove('hidden');                              // ← would re-show overlay
  o.querySelector('.card').innerHTML = `... Game Over ...`;  // ← would replace card text
  document.getElementById('startBtn').addEventListener('click', restart);
}, 350);

// BEFORE — restart() in index.html
function restart() { reset(); world.started = true; world.over = false; document.getElementById('overlay').classList.add('hidden'); }
//  ↑ No clearTimeout — the pending setTimeout would still fire 250ms later
```

Repro test result (BEFORE the fix):
```
FINAL STATE:
  overlay hidden: false       ← BUG: overlay reappeared
  card text: "💥 Game OverTEST"  ← BUG: card replaced with Game Over
  world.over: true            ← BUG: state reverted
  world.started: false        ← BUG: state reverted
```

### Fix

```js
// AFTER — track the timeout id at module scope
let _gameOverOverlayTimer = 0;
function gameOver() {
  if (world.over) return;
  world.over = true;
  // ... particles, score, persist best ...
  _gameOverOverlayTimer = setTimeout(() => {
    _gameOverOverlayTimer = 0;
    if (!world.over) return;   // belt-and-suspenders: if user already restarted, bail
    // ... show overlay as before ...
  }, 350);
}

// AFTER — restart() and reset() both cancel the timer
function restart() {
  if (_gameOverOverlayTimer) { clearTimeout(_gameOverOverlayTimer); _gameOverOverlayTimer = 0; }
  reset();
  world.started = true;
  world.over = false;
  document.getElementById('overlay').classList.add('hidden');
}
```

### Verification (AFTER the fix)

New regression test `smoke-gameover-race.js` covers 4 scenarios:

| Scenario | Expected | Result |
|---|---|---|
| Death → `restart()` within 350ms | Overlay stays hidden, card shows start screen, `world.over=false` | ✅ PASS |
| Death → `restart()` within 350ms → repeat | Same | ✅ PASS |
| Death → click PLAY AGAIN button (real user path) | Overlay hidden, `lives=7`, `world.over=false` | ✅ PASS |
| Death → no action → wait 350ms | Overlay shows Game Over with score, best, PLAY AGAIN button | ✅ PASS |

Also verified end-to-end on the live URL: `https://annabelle-catgame.onrender.com`. See "Live verification" below.

---

## DEFECT 2 (F2) — Hardcoded Playwright global path [FIXED]

### Reproduction (BEFORE the fix)

```js
// All 13 smoke-*.js files contained exactly:
const { chromium } = require('/usr/local/lib/node_modules/playwright/index.js');
```

This works on the sandbox because Playwright is installed globally there. But on a fresh clone with `npm install`, Playwright would land in `./node_modules/playwright/`, the global path wouldn't exist, and **every** smoke test would fail with `MODULE_NOT_FOUND`.

### Fix

- Replaced all 13 instances of `require('/usr/local/lib/node_modules/playwright/index.js')` with `require('playwright')`.
- Ran `npm install` to fetch Playwright 1.62.1 + playwright-core 1.62.1 to local `node_modules/`. Total time: 2 seconds.
- Committed `package-lock.json` so the install is reproducible.

### Verification

- `node -e "require('playwright')"` resolves to `./node_modules/playwright/index.js`. ✅
- All 7 core smoke tests still pass. ✅
- `grep -l "/usr/local/lib/node_modules" smoke-*.js` returns 0 files. ✅
- `package-lock.json` contains only relative `node_modules/*` paths (no path-specific entries). ✅

### What this enables

A fresh clone now follows the standard Node.js workflow:

```bash
git clone https://github.com/paisabrazilfl-cpu/ANNABELLE-CATGAME.git
cd ANNABELLE-CATGAME
npm install     # ~2s
npm run smoke   # runs all 7 core tests
```

---

## DEFECT 3 (F3) — `reset()` doesn't clear platform-mode state [FIXED]

### Detection

`reset()` was clearing endless-mode state arrays but not platform-mode state:

```js
// BEFORE
obstacles.length = 0; pickups.length = 0;
particles.length = 0; pops.length = 0;
// NO clear of: platforms, ladders, levelItems, barrels, goal, onLadder
```

### Impact

Low — `draw()` is mode-gated, so dead state isn't visible. But a kid who plays platform → endless → platform → endless for hours would slowly leak memory as `platforms`/`ladders`/`levelItems`/`barrels` grow on each level load.

### Fix

```js
// AFTER
platforms.length = 0; ladders.length = 0; levelItems.length = 0;
barrels.length = 0; goal = null; world.onLadder = null;
obstacles.length = 0; pickups.length = 0;
particles.length = 0; pops.length = 0;
```

### Verification

- All 7 core smoke tests still pass. ✅
- No test specifically exercises this memory leak (would require many hours of play), but the fix is one line and obviously correct.

---

## DEFECT 4 (F4) — Stale comment in index.html [FIXED]

### Detection

```js
// BEFORE
/* One white-pixel texture stretched to draw everything (cheap + portable) */
```

But the game doesn't use a white-pixel texture. It uses individual `fillRect()` calls for every pixel of every sprite. The comment was carried over from a much earlier prototype that did use a 1×1 white texture.

### Fix

```js
// AFTER
/* Pure-pixel-art rendering: every sprite is a sequence of fillRect()
   calls (no image assets, no texture atlas — works fully offline) */
```

### Verification

- Trivial, comment-only change. Verified by reading the diff and confirming no functional change.

---

## SECURITY AUDIT (no new findings)

| Check | Result |
|---|---|
| Path traversal `GET /../package.json` | ✅ 403 Forbidden |
| Path traversal `GET /%2e%2e/package.json` (encoded) | ✅ 403 Forbidden |
| `X-Content-Type-Options` header | ✅ `nosniff` |
| `X-Frame-Options` header | ✅ `SAMEORIGIN` |
| `Referrer-Policy` header | ✅ `no-referrer` |
| `Content-Length` set on responses | ✅ Yes |
| `decodeURIComponent` on URL paths | ✅ Yes (prevents encoded traversal) |
| `path.relative()` check | ✅ Yes (prevents `..` in any form) |
| No swallowed `catch {}` blocks | ✅ Verified by grep |
| No `mock/fake/placeholder` strings in production code | ✅ Verified by grep |
| No hardcoded credentials in source | ✅ Verified by grep |

`serve.js` is 67 lines, no extra dependencies, runs under `node:http`/`node:fs`/`node:path` only.

---

## OBSERVABILITY / RUNTIME HEALTH

| Endpoint | Status | Notes |
|---|---|---|
| `GET /` | ✅ 200, 113488 bytes | Static `index.html` |
| `GET /index.html` | ✅ 200, 113488 bytes | Same |
| `GET /nonexistent` | ✅ 404 | Properly returns 404 |
| `GET /../package.json` | ✅ 403 | Path-traversal blocked |
| Deploy status | ✅ `live` | Render service `srv-d9i1ibrrjlhs73deol60` |
| Live MD5 | ✅ `2de6b1d3bef5080d92b66100cb526607` | Matches local MD5 byte-for-byte |
| Playwright headless runs | ✅ 7/7 pass | All core smoke tests pass |

---

## TEST COVERAGE

| Test | What it covers | Status |
|---|---|---|
| `smoke-mechanics.js` | Run/jump/stomp/duck/air-control in endless mode | ✅ PASS |
| `smoke-platform.js` | Platform mode: levels, ladders, fish, goal | ✅ PASS |
| `smoke-mobile-fixed.js` | Mobile viewport (390×664), touch controls, layout | ✅ PASS |
| `smoke-fall-physics.js` | Coyote time, jump buffer, drop-through, terminal velocity, jump-cut | ✅ PASS |
| `smoke-gravity-bg.js` | Gravity between platforms, jungle background visuals | ✅ PASS |
| `smoke-mario.js` | Mario-style stomp, double-jump | ✅ PASS |
| `smoke-gameover-race.js` (NEW) | F1 regression: restart within 350ms of death | ✅ PASS |
| `smoke-snes-jungle.js` | SNES jungle pixel-art visual check | ✅ PASS (offline) |
| `smoke-mtn-chars.js` | Mountain character (Donkey Kong vibe) visuals | ✅ PASS |
| `smoke-easier.js` | Difficulty easing (midpoint checkpoint) | ✅ PASS |
| `smoke-easier2.js` | Multi-checkpoint + respawn-at-checkpoint | ✅ PASS |
| `smoke-mobile.js` | Legacy mobile test (still works) | ✅ PASS |
| `smoke-live-snes.js` | Live-URL regression (hits Render) | ✅ PASS |
| `smoke-http.js` | HTTP-only smoke (caller provides URL) | ✅ PASS (not in npm run smoke) |

13 smoke tests total. 7 are in `npm run smoke` (the critical-path ones). 6 are exploratory / visual / live-only.

---

## LIVE VERIFICATION

After merge to `2026-07-25__methodical-notes__initial-cat-runner-game`:

```
$ git push origin 2026-07-25__methodical-notes__initial-cat-runner-game
   c0877cb..d20567e  2026-07-25__methodical-notes__initial-cat-runner-game -> ...

$ curl -X POST .../services/srv-d9i1ibrrjlhs73deol60/deploys
deploy id: dep-d9tb9lqjobas73chkqv0
status: live
commit: d20567e

$ curl -s https://annabelle-catgame.onrender.com/?cb=$(date +%s%N) | md5sum
2de6b1d3bef5080d92b66100cb526607  -

$ md5sum index.html
2de6b1d3bef5080d92b66100cb526607  index.html
```

Live MD5 matches local MD5 byte-for-byte. F1 fix verified on the live URL via direct Playwright test:

```
LIVE F1 fix verified:
  overlay hidden: true
  card text:  🐱 Annabelle's Cat Runner Help the orange tabby outrun the neighborhood!
  world.over: false
✅ Live F1 fix verified end-to-end
```

---

## DELIVERABLES

- **Source code:** `/workspace/annabelle-catgame/`
- **GitHub branch:** `2026-08-11__methodical-notes__exhaustive-audit` (commit `6bee161`)
- **Render-tracked branch:** `2026-07-25__methodical-notes__initial-cat-runner-game` (commit `d20567e`)
- **Live URL:** https://annabelle-catgame.onrender.com
- **Full project zip:** `/workspace/annabelle-catgame.zip` (71 KB)
- **Portable install zip:** `/workspace/annabelle-catgame-portable.zip` (37 KB)
- **Memory topic:** `annabelle-cat-runner` (in agent memory; updated with audit lessons)

---

## FOLLOWUPS (not blocking)

These are **accepted findings**, not bugs. Documented here for the next audit pass.

1. **No `smoke:visual` automation in CI** — visual tests are run on-demand. Could be wired into a `pre-deploy` hook on Render. Out of scope for this audit.
2. **No CSP header** — `Content-Security-Policy` would be a defense-in-depth improvement but isn't required for a kid's offline-friendly game. The current security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) cover the realistic threat model.
3. **No HTTP cache headers on `index.html`** — currently `no-cache`. For a single-file game that should be cache-busted on every deploy, that's correct. If we wanted browser-caching for performance, we'd need hash-busting in the URL, which adds complexity.
4. **`serve.js` is intentionally minimal** — 67 lines, no Express, no logging, no metrics. Adequate for the use case. Could be upgraded to a proper HTTP framework if the project ever needs WebSockets or streaming.
5. **No `prefers-reduced-motion` for canvas** — only for page chrome. Canvas animations are part of the game and disabling them would break the experience. Could be honored by reducing background animation speed, but would need playtesting.

---

## SIGN-OFF

- [x] All defects in the audit scope are fixed.
- [x] All 7 core smoke tests pass.
- [x] Live URL serves the new code, MD5 verified.
- [x] F1 has a dedicated regression test in the smoke suite.
- [x] Documentation of findings + fixes committed to the repo.
- [x] Memory topic updated with audit lessons.
- [x] Zips rebuilt: `/workspace/annabelle-catgame.zip` (71 KB) and `/workspace/annabelle-catgame-portable.zip` (37 KB).
- [x] No new hardcoded credentials, no new swallowed exceptions, no new mock code in production paths.

**STATUS: AUDIT COMPLETE. ALL DEFCON-1 DEFECTS RESOLVED. LIVE URL HEALTHY.**
