# 🐱 Annabelle's Cat Runner

A fun 2D game starring an orange tabby with big green eyes — built as a single-file HTML5 game that runs in any modern browser. Zero install, kid-readable code, two game modes.

**Live:** https://annabelle-catgame.onrender.com

## 🎮 How to Play

| Key | Action |
|---|---|
| **SPACE / ↑ / W** | Jump (tap again in mid-air in endless mode for a **double jump**!) |
| **↓ / S** | Duck (slide under low birds) / drop through platforms |
| **A / ←, D / →** | Run |
| **R** | Restart after game over |
| **ESC / P** | Pause |
| **Click / Tap** | Jump or start (mobile touch bar appears automatically) |

### Endless mode
Run forever, grab fish 🐟 and yarn 🧶, dodge dogs 🐶, jump on rocks 🪨 and birds 🐦 to **stomp them** (+50 each, with a juicy +50 pop, dust particles, and a screen-shake). The game speeds up gradually as you go.

### Platform mode (SNES-style)
3 hand-designed levels. Climb ladders, collect fish, reach the goal 🎀. Stomp dogs (1 per level so you can learn the mechanic), dodge rolling barrels in level 3. You get **7 lives** and a **checkpoint** at every third of the level, so dying respawns you nearby instead of at the start.

## ▶️ Run It

### Locally
```bash
./PLAY.sh              # starts server on :4321 and opens browser
# or
node serve.js          # starts server on :10000 (or PORT env)
```
Then open http://127.0.0.1:4321/ (or whatever PORT you set).

You can also just open `index.html` directly in a browser — the game runs without a server, `serve.js` is only needed for the Render deploy.

### Hosted (Render)
This repo is configured for Render as a **Node Web Service** (per the standing rule that all services are web services, not static sites or Blueprints). `serve.js` is the tiny static-file server. See `render.yaml` for the service spec (deploy is triggered manually from the Render dashboard, not via Blueprint).

## 🧱 What's Inside
- **`index.html`** (~2500 lines) — the entire game: HTML + CSS + JS, one file
- **`serve.js`** — tiny Node static server (Render web service entry point)
- **`package.json`** — Node project manifest
- **`render.yaml`** — Render Web Service spec (documentation; service is created from the dashboard, not via Blueprint)
- **`smoke-*.js`** — Playwright headless smoke tests covering mechanics, platform mode, mobile controls, fall physics, gravity, Mario-style features, and live visual regression
- **`bootstrap.sh`** — one-shot GitHub create+push script

The whole game is in one HTML file you can read top-to-bottom. The cat sprite is hand-drawn pixel art on a `<canvas>`. The SNES-jungle background, mountain characters that wave at the player, and the level banners are all built from rectangles — no image files.

## 🎨 Graphics: pure pixel art
- The orange tabby cat has a white belly, pink ears, blush cheeks, a multi-segment tail, and tabby stripes.
- The jungle canopy has 3 parallax layers, hanging vines, ferns, and misty bands.
- The mountain silhouettes have tiny pixel characters that wave (faster when the cat is in the air).
- Platforms are carved dirt with grass tops, chiseled rock faces, and embedded rock chunks.

## ✏️ Fun Things to Tweak
- `world.maxScrollSpeed` — how fast the game can go
- `cat.vy = -880` in `catJump()` — how high the cat jumps
- `body = '#ff9a4d'` in `drawCat()` — make the cat any color you want
- The `LEVELS` array in `index.html` — hand-design your own levels
- `spawnObstacle()` in endless mode — add a new enemy type

## 🚧 Future ideas
- 🏆 Combo bonus (3 fish in a row = bonus)
- 🌈 Random cat colors on each run
- 🌙 Day/night cycle
- 🎵 Background music

Have fun, and purr on! 🐾
