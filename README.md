# Gold Miner

A browser remake of the classic Flash game *Gold Miner* (黃金礦工). Swing the hook, grab gold, beat the money goal before the clock runs out, and buy upgrades between levels.

- Runs anywhere as static files. No backend, no frameworks, no downloaded assets: all art is drawn on a canvas and all sound is synthesized with Web Audio.
- Desktop and mobile. Keyboard on desktop, tap anywhere on touch screens.
- English, 简体中文 and 繁體中文. Auto-detected from the browser, switchable in the menu, or forced with `?lang=en|zh-CN|zh-TW`.
- Two-player co-op on one screen or across two phones (see below).
- Installable PWA. On iPhone/iPad open the link in Safari, tap Share → Add to Home Screen; it launches full-screen with its own icon and splash screen and works offline thanks to a service worker (`vite-plugin-pwa`).
- Save links. Every new game gets a URL like `…/#g=AVp_1qUBAAAAAAAAxg`. Open it later on any device to continue from the current level with your money and purchased items. Progress is also mirrored in localStorage; when a link and local storage disagree about the same game, the further progress wins, and a different local game is offered as a second "Continue" button. Note that iOS Safari may clear site storage after seven days without a visit, so the link is the durable copy.

## Two players

Both modes are co-op like the classic 双人版: two miners on one field, one shared money goal (earn targets are 1.6× the solo ones), one shared shop.

- **Same screen:** tap the left half of the screen for player 1 and the right half for player 2. Keyboard: `S`/`A` fire and `W` dynamite for player 1, `↓`/`→` fire and `↑` dynamite for player 2.
- **Online, phone to phone:** the host taps *Create online game* and gets a six-letter room code plus a link like `…/#room=K7PM3Q` (share it, or let the other phone scan the QR code). The guest opens the link, or types the code under *Join with a code*, and both phones start together. Progress lives on the host and is saved like a normal game, so a co-op run can be continued later by creating a new room from it. Short connection drops recover automatically; a guest who closes the page can rejoin with the same link.

  The relay is a Cloudflare Worker with one Durable Object per room (`worker/`), which only forwards messages between the two phones. It runs comfortably on Cloudflare's free tier. Deployment happens in the GitHub Actions workflow when the repository secrets `CLOUDFLARE_API_TOKEN` (an "Edit Cloudflare Workers" token) and `CLOUDFLARE_ACCOUNT_ID` exist; the site build then bakes the worker URL in as `VITE_RELAY_URL`. Without them the site still deploys and online play shows "not set up". For local development run `npm run relay:dev` next to `npm run dev`.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Drop the hook / start level | Space, ↓ or Enter (or click) | Tap the screen |
| Throw dynamite | ↑ or D | Dynamite button (bottom right, appears when you own some) |
| Pause | P or Esc | Pause button (bottom left) |
| Mute | M | Sound toggle in the menu |
| Two players on one device | S/A/W (P1), ↓/→/↑ (P2) | Left half / right half of the screen |

## Rules

- 60 seconds per level. Reach the goal or it is game over; you can retry the same level.
- The hook swings slowly on level 1 (3 s per swing) and speeds up each level until it reaches full speed (1.7 s) at level 8.
- Money carries over, but goals are relative: each level's goal is the money you had when the previous level ended plus that level's earn target ($650, $900, $1,250, $1,700, $2,250, $2,900…). Carried-over money never clears a level by itself, and whatever you spend in the shop widens the gap.
- From level 6 item values scale with the earn target so a level stays clearable in roughly a dozen grabs. Difficulty comes from the field holding less spare value as levels climb (2.4× the target on level 1, 1.6× from level 11), more rocks, and the faster swing.
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
  net/      online co-op: relay client, host session, guest mirror, message protocol
  audio/    Web Audio synth
worker/     Cloudflare Worker relay (Durable Object per room)
  i18n/     en, zh-CN, zh-TW string tables
test/       vitest unit tests for everything in src/game and src/i18n
```
