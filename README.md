
# Algerian Runner (Prototype)

A tiny 90s-style side-scrolling platformer inspired by Algerian cityscapes and markets.
This prototype uses a 320×180 internal resolution scaled to 1280×720. Pixel-art assets and the color palette are derived from the provided screenshots (see `assets/palette.png`).

## Controls
- Left / Right or A / D — Move
- Space / W / Up — Jump (with **coyote time** and **jump buffering**)
- X — Shoot **Harissa Blaster** (semi-auto, cooldown)
- Goal — Reach the green zellige arch to finish a level
- Checkpoints — Stand near a flag tile to update respawn position

## Rules
- You have **3 hearts**. Each pig bite removes 1 heart. On the **third bite** you die and respawn at the last checkpoint.
- Pigs take **2 hits**. On the second hit they explode into peppery particles (cartoon only).
- Collect **chili peppers** for score; every **100 peppers** = **+1 life**.

## Files
- `index.html` – Web entry point
- `game.js` – Game code (Canvas 2D)
- `assets/sprites.png` – Atlas with tiles, hero, pig, projectile, FX, UI
- `assets/sprites.json` – Sprite coordinates
- `assets/palette.png` / `assets/palette.json` – Extracted palette
- `levels/*.json` – Three short levels + a boss arena

## Technical Notes
- **60 FPS** target; uses small pools for projectiles and explosions to minimize GC.
- Camera has a slight look-ahead in the facing direction.
- Physics: simple AABB with tile collision, variable jump, coyote time (0.12 s), and jump buffering (0.12 s).
- Tiles are 16×16. Solid tiles: ground/platform/crate; hazards: spikes.
- Content rating: **cartoon violence** only; no gore.

## Build & Run
Just open `index.html` in a local web server (required by most browsers to load local JSON).
Examples:
- Python: `python3 -m http.server` and browse to `http://localhost:8000/mnt/data/AlgerianRunner/`
- Node: `npx http-server`

## Credits
- Palette derived from uploaded screenshots and lightly organized by luminance.
- Everything else is placeholder pixel art to be replaced by real assets later.
