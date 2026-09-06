import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { Game, type BagOutcome } from './game/Game';
import { ITEM_SPECS, isRock } from './game/entities';
import { clearStoredSave, readSaveFromHash, readSaveFromStorage } from './game/save';
import { detectLang, onLangChange, setLang, t, type StringKey } from './i18n';
import { Renderer } from './render/renderer';
import { Overlay } from './ui/overlay';
import { Sfx } from './audio/sfx';
import { ITEM_ICON, PAUSE_ICON } from './ui/icons';

setLang(detectLang(), false);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const dynamiteBtn = document.getElementById('dynamiteBtn') as HTMLButtonElement;
const sfx = new Sfx();
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const game = new Game({
  onStateChange: (state) => {
    pauseBtn.classList.toggle('hidden', state !== 'playing');
    switch (state) {
      case 'menu':
        overlay.pendingSave = game.save.level > 0 && game.save.seed ? { ...game.save } : readSaveFromStorage();
        overlay.menu();
        break;
      case 'levelIntro':
        overlay.levelIntro();
        break;
      case 'playing':
        overlay.hide();
        break;
      case 'paused':
        overlay.paused();
        break;
      case 'levelResult':
        sfx.levelClear();
        overlay.levelResult();
        break;
      case 'shop':
        overlay.shop(() => sfx.buy());
        break;
      case 'gameOver':
        sfx.gameOver();
        overlay.gameOver();
        break;
    }
    updateDynamiteBtn();
  },
  onFire: () => sfx.fire(),
  onGrab: (e) => (isRock(e.kind) ? sfx.rock() : sfx.grab()),
  onCash: (e, amount) => {
    sfx.cash(amount >= ITEM_SPECS.goldL.value || e.kind === 'diamond' || e.kind === 'moleDiamond');
    updateDynamiteBtn();
  },
  onBag: (o: BagOutcome) => {
    sfx.bag(o.type !== 'nothing');
    if (o.type === 'cash') overlay.toast(t('bag.cash', { amount: o.amount }));
    else if (o.type === 'item') overlay.toast(t('bag.item', { item: t(`item.${o.item}` as StringKey) }));
    else overlay.toast(t('bag.nothing'));
    updateDynamiteBtn();
  },
  onDynamite: () => {
    sfx.dynamite();
    updateDynamiteBtn();
  },
  onTick: (s) => {
    if (s <= 5 && s > 0) sfx.tick();
  },
});

const overlay = new Overlay(game, {
  newGame: () => {
    sfx.unlock();
    game.newGame();
  },
  continueGame: (s) => {
    sfx.unlock();
    game.continueGame(s);
  },
  toggleSound: () => {
    sfx.unlock();
    sfx.setMuted(!sfx.muted);
    return sfx.muted;
  },
  isMuted: () => sfx.muted,
  isTouch: () => isTouch,
});

const renderer = new Renderer(canvas);

function updateDynamiteBtn(): void {
  const show = game.state === 'playing' && game.buffs.dynamite > 0;
  dynamiteBtn.classList.toggle('hidden', !show);
  dynamiteBtn.innerHTML = `${ITEM_ICON.dynamite} <span>${game.buffs.dynamite}</span>`;
  dynamiteBtn.title = t('hud.dynamite');
  dynamiteBtn.setAttribute('aria-label', t('hud.dynamite'));
}

/* ---------- Input ---------- */

canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  sfx.unlock();
  game.primary();
});
pauseBtn.addEventListener('click', () => game.pause());
dynamiteBtn.addEventListener('click', () => game.useDynamite());

window.addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
  const tag = (ev.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  switch (ev.code) {
    case 'Space':
    case 'ArrowDown':
    case 'Enter':
    case 'NumpadEnter':
      if (game.state === 'playing' || game.state === 'levelIntro') {
        ev.preventDefault();
        sfx.unlock();
        game.primary();
      } else if (game.state === 'paused' && ev.code !== 'Enter') {
        game.resume();
      }
      break;
    case 'ArrowUp':
    case 'KeyD':
      if (game.state === 'playing') {
        ev.preventDefault();
        game.useDynamite();
      }
      break;
    case 'KeyP':
    case 'Escape':
      if (game.state === 'playing') game.pause();
      else if (game.state === 'paused') game.resume();
      break;
    case 'KeyM':
      sfx.unlock();
      sfx.setMuted(!sfx.muted);
      overlay.toast(`${t('menu.sound')}: ${sfx.muted ? t('menu.off') : t('menu.on')}`);
      break;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});
window.addEventListener('blur', () => game.pause());

/* ---------- Resize ---------- */

const ro = new ResizeObserver(() => renderer.resize());
ro.observe(canvas);
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 150));

/* ---------- Language ---------- */

onLangChange(() => {
  overlay.refresh();
  updateDynamiteBtn();
});
document.title = t('app.title');
pauseBtn.title = t('hud.pause');
pauseBtn.setAttribute('aria-label', t('hud.pause'));
pauseBtn.innerHTML = PAUSE_ICON;

/* ---------- Boot ---------- */

const hashSave = readSaveFromHash();
if (location.hash.startsWith('#g=') && !hashSave) {
  overlay.toast(t('menu.badLink'));
  history.replaceState(null, '', location.pathname + location.search);
  clearStoredSave();
}
overlay.pendingSave = hashSave ?? readSaveFromStorage();
overlay.menu();

if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;

// Offline support / installability. Updates are applied on the next launch.
registerSW({ immediate: true });

/* ---------- Loop ---------- */

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.frame(dt);
  const h = game.hook;
  sfx.reel(game.state === 'playing' && h.phase === 'retract', h.grabbed ? 300 / (0.5 + ITEM_SPECS[h.grabbed.kind].weight) : 700);
  renderer.draw(game, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
