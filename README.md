# Gold Miner

A browser remake of the classic Flash game *Gold Miner* (黃金礦工). Swing the hook, grab gold, beat the money goal before the clock runs out, and buy upgrades between levels.

- Runs anywhere as static files. No backend, no frameworks, no downloaded assets: all art is drawn on a canvas and all sound is synthesized with Web Audio.
- Desktop and mobile. Keyboard on desktop, tap anywhere on touch screens.
- English, 简体中文 and 繁體中文. Auto-detected from the browser, switchable in the menu, or forced with `?lang=en|zh-CN|zh-TW`.
- Installable PWA. On iPhone/iPad open the link in Safari, tap Share → Add to Home Screen; it launches full-screen with its own icon and splash screen and works offline thanks to a service worker (`vite-plugin-pwa`).
- Save links. Every new game gets a URL like `…/#g=AVp_1qUBAAAAAAAAxg`. Open it later on any device to continue from the current level with your money and purchased items. Progress is also mirrored in localStorage.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Drop the hook / start level | Space, ↓ or Enter (or click) | Tap the screen |
| Throw dynamite | ↑ or D | Dynamite button (bottom right, appears when you own some) |
| Pause | P or Esc | Pause button (bottom left) |
| Mute | M | Sound toggle in the menu |

## Rules

- 60 seconds per level. Reach the goal or it is game over; you can retry the same level.
- The hook swings slowly on level 1 (3 s per swing) and speeds up each level until it reaches full speed (1.7 s) at level 8.
- Money carries over. Goals follow the classic curve ($650, $1150, $2150, $3650, $5650…). From level 4 item values scale with the goal so a level stays clearable in roughly a dozen grabs.
- Items: small/medium/large/huge gold, small/large rocks (heavy, nearly worthless), diamonds (light, $600), mystery bags (cash or a free item), moles (fast, $2) and moles carrying a diamond.
- Shop items last for one level: Dynamite (destroys whatever is on the hook), Strength Drink (reel 50% faster), Rock Collector's Book (rocks ×3), Diamond Polish (diamonds ×1.5), Lucky Clover (bags are always good).

## Development

```sh
npm install
npm run dev       # http://localhost:5173/gold-miner/ (also on your LAN for phone testing)
npm test          # vitest: RNG, save codec, level generation, hook physics, game flow
npm run build     # type-check + production build into dist/
npm run preview
```

The build base path defaults to `/gold-miner/` for a GitHub Pages project site. Set `VITE_BASE=/` to host at a domain root (Cloudflare Pages, Netlify, any static server).

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages. In the repository settings, set **Pages → Source** to **GitHub Actions** once.

## Layout

```
src/
  game/     pure game logic (no DOM): rng, save codec, level generation, hook physics, shop, state machine
  render/   canvas renderer and procedural sprites
  ui/       DOM overlay screens (menu, level cards, shop, pause, game over) and SVG icons
  audio/    Web Audio synth
  i18n/     en, zh-CN, zh-TW string tables
test/       vitest unit tests for everything in src/game and src/i18n
```
