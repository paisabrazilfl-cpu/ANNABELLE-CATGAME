# 🐱 Annabelle's Cat Runner

A fun 2D endless-runner game starring an orange tabby with big green eyes — built as a single-file HTML5 game that runs in any modern browser. Zero install, zero dependencies, kid-readable.

## 🎮 How to Play
| Key | Action |
|---|---|
| **SPACE / ↑ / W** | Jump |
| **↓ / S** | Duck (slide under low birds!) |
| **R** | Restart after game over |
| **ESC / P** | Pause |
| **Click / Tap** | Jump or start |

Grab fish 🐟 for points, dodge dogs 🐶, rocks 🪨, and birds 🐦. The game speeds up as you go!

## ▶️ Run It

### Locally
Just open `index.html` in any browser. That's it. No build step.

```bash
# from the repo root
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Hosted (Render)
This repo is configured for Render as a **Static Site** (free tier). See `render.yaml` for the service spec.

## 🧱 What's Inside
- **`index.html`** — the entire game (HTML + CSS + JS, one file)
- **`render.yaml`** — Render Static Site declaration (auto-build & publish `index.html`)

That's it. The whole game is one HTML file you can read top-to-bottom.

## 🎨 How the Graphics Work
No image files. Everything is drawn with rectangles on a `<canvas>` using `fillRect` — including the cat, the obstacles, the fish, the clouds, the hills. The whole thing is under 700 lines of plain JavaScript with no frameworks.

## ✏️ Fun Things to Tweak
- `world.maxScrollSpeed` — how fast the game can go
- `cat.vy = -780` in `catJump()` — how high the cat jumps
- `body = '#ffa55a'` in `drawCat()` — make the cat any color you want
- Add a new obstacle in `spawnObstacle()` and a new drawing function

## 🚀 Improvements for the Coder Kid
- 🦘 Double-jump (track jump count, allow one mid-air)
- 🏆 Combo bonus (3 fish in a row = bonus)
- 🐈 Random cat colors on each run
- 🌙 Day/night cycle
- 📱 Mobile touch duck (tap top half = jump, bottom half = duck)

Have fun, and purr on! 🐾
