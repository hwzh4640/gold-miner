import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { Game, type BagOutcome, type GameEvents, type GameState, type GameView } from './game/Game';
import { ITEM_SPECS, isRock } from './game/entities';
import { WORLD_W } from './game/Level';
import { clearStoredSave, readSaveFromHash, readSaveFromStorage, type SaveState } from './game/save';
import { detectLang, onLangChange, setLang, t, type StringKey } from './i18n';
import { Renderer } from './render/renderer';
import { Overlay } from './ui/overlay';
import { Sfx } from './audio/sfx';
import { ITEM_ICON, PAUSE_ICON } from './ui/icons';
import { PeerLink, webrtcSupported } from './net/PeerLink';
import { HostSession } from './net/HostSession';
import { RemoteGame } from './net/RemoteGame';
import { clearHash, deliverReply, extractCode, inviteLink, listenForReply, parseHash, replyLink } from './net/signal';

setLang(detectLang(), false);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const dynamiteBtn = document.getElementById('dynamiteBtn') as HTMLButtonElement;
const dynamiteBtn2 = document.getElementById('dynamiteBtn2') as HTMLButtonElement;
const sfx = new Sfx();
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

/* ---------- UI reactions shared by the local game and the online mirror ---------- */

const uiEvents: GameEvents = {
  onStateChange: (state: GameState) => {
    pauseBtn.classList.toggle('hidden', state !== 'playing');
    switch (state) {
      case 'menu':
        endOnline();
        overlay.pendingSave = view.save.level > 0 && view.save.seed ? { ...view.save } : readSaveFromStorage();
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
};

const localGame = new Game(uiEvents);
/** Whatever is currently being played and drawn: the local game or the guest mirror. */
let view: GameView = localGame;
let host: HostSession | null = null;
let remote: RemoteGame | null = null;
/** Link being negotiated in a lobby (before a session exists). */
let pendingLink: PeerLink | null = null;
let stopReplyListener: (() => void) | null = null;

function setView(v: GameView): void {
  view = v;
  overlay.setGame(v);
  updateDynamiteBtn();
}

function endOnline(): void {
  stopReplyListener?.();
  stopReplyListener = null;
  pendingLink?.close();
  pendingLink = null;
  if (host) {
    host.end();
    host = null;
  }
  if (remote) {
    remote.link.close();
    remote = null;
  }
  if (view !== localGame) setView(localGame);
}

const overlay = new Overlay(localGame, {
  newGame: (players) => {
    sfx.unlock();
    endOnline();
    localGame.newGame(players);
  },
  continueGame: (s) => {
    sfx.unlock();
    endOnline();
    localGame.continueGame(s);
  },
  createOnline: () => {
    sfx.unlock();
    void startHosting();
  },
  joinWithCode: () => {
    sfx.unlock();
    overlay.pasteInvite(
      (text) => {
        const code = extractCode(text, 'invite');
        if (code) void startJoining(code);
        else overlay.toast(t('online.badCode'));
      },
      () => localGame.quitToMenu(),
    );
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

/* ---------- Online: host ---------- */

async function startHosting(): Promise<void> {
  if (!webrtcSupported()) {
    overlay.toast(t('online.failed'));
    return;
  }
  endOnline();
  const resumeSave: SaveState | null = overlay.pendingSave;
  let resume = !!resumeSave;
  const cancel = () => localGame.quitToMenu();
  overlay.lobby({ status: 'preparing', onRetry: startHosting, onCancel: cancel });
  const link = new PeerLink('host');
  pendingLink = link;
  let code: string;
  try {
    code = await link.createInvite();
  } catch {
    overlay.lobby({ status: 'failed', onRetry: startHosting, onCancel: cancel });
    return;
  }
  if (pendingLink !== link) return; // cancelled meanwhile
  const url = inviteLink(code);
  let busy = false;
  const onReply = async (text: string) => {
    if (busy || pendingLink !== link) return;
    const reply = extractCode(text, 'reply');
    if (!reply) {
      overlay.toast(t('online.badCode'));
      return;
    }
    busy = true;
    overlay.lobby({ status: 'connecting', onRetry: startHosting, onCancel: cancel });
    try {
      await link.acceptReply(reply);
    } catch (e) {
      busy = false;
      if (pendingLink !== link) return;
      const status = (e as Error).message === 'expired' ? 'expired' : 'failed';
      overlay.lobby({ status, onRetry: startHosting, onCancel: cancel });
      return;
    }
    if (pendingLink !== link) return;
    pendingLink = null;
    stopReplyListener?.();
    stopReplyListener = null;
    overlay.toast(t('online.connected'));
    host = new HostSession(link, uiEvents, () => {
      overlay.peerLeft(
        () => void startHosting(),
        () => {
          // Keep playing solo from the same save.
          const save = host?.game.save ?? localGame.save;
          endOnline();
          localGame.continueGame({ ...save, players: 1 });
        },
        () => localGame.quitToMenu(),
      );
    });
    setView(host.game);
    host.start(resume ? resumeSave : null);
  };
  const showInvite = () =>
    overlay.lobby({
      status: 'invite',
      link: url,
      onReply,
      onRetry: startHosting,
      onCancel: cancel,
      resume: resumeSave
        ? {
            level: resumeSave.level,
            money: resumeSave.money,
            enabled: resume,
            toggle: () => {
              resume = !resume;
            },
          }
        : undefined,
    });
  showInvite();
  stopReplyListener?.();
  stopReplyListener = listenForReply((c) => void onReply(c));
}

/* ---------- Online: guest ---------- */

async function startJoining(code: string): Promise<void> {
  if (!webrtcSupported()) {
    overlay.toast(t('online.failed'));
    return;
  }
  endOnline();
  const cancel = () => {
    clearHash();
    localGame.quitToMenu();
  };
  const retry = () => void startJoining(code);
  overlay.join({ status: 'joining', onRetry: retry, onCancel: cancel });
  const link = new PeerLink('guest');
  pendingLink = link;
  let reply: string;
  try {
    reply = await link.acceptInvite(code);
  } catch (e) {
    if (pendingLink !== link) return;
    overlay.join({ status: (e as Error).message === 'bad-invite' ? 'bad' : 'failed', onRetry: retry, onCancel: cancel });
    return;
  }
  if (pendingLink !== link) return;
  overlay.join({ status: 'reply', link: replyLink(reply), onRetry: retry, onCancel: cancel });
  try {
    await link.waitOpen(10 * 60 * 1000);
  } catch {
    if (pendingLink !== link) return;
    overlay.join({ status: 'failed', onRetry: retry, onCancel: cancel });
    return;
  }
  if (pendingLink !== link) return;
  pendingLink = null;
  clearHash();
  overlay.toast(t('online.connected'));
  remote = new RemoteGame(link, uiEvents, () => {
    overlay.hostLeft(() => localGame.quitToMenu());
  });
  setView(remote);
}

/* ---------- HUD buttons ---------- */

function updateDynamiteBtn(): void {
  const twoLocal = view.players.length === 2 && !view.isOnline;
  document.body.classList.toggle('two-local', twoLocal);
  const show = view.state === 'playing' && view.buffs.dynamite > 0;
  for (const [btn, visible] of [
    [dynamiteBtn, show],
    [dynamiteBtn2, show && twoLocal],
  ] as const) {
    btn.classList.toggle('hidden', !visible);
    btn.innerHTML = `${ITEM_ICON.dynamite} <span>${view.buffs.dynamite}</span>`;
    btn.title = t('hud.dynamite');
    btn.setAttribute('aria-label', t('hud.dynamite'));
  }
}

/** Which player a tap at this client position controls. */
function playerForPointer(clientX: number): number {
  if (view.players.length < 2) return 0;
  if (view.isOnline) return view.localPlayer;
  return renderer.toWorld(clientX, 0).x < WORLD_W / 2 ? 0 : 1;
}

/* ---------- Input ---------- */

canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  sfx.unlock();
  view.primary(playerForPointer(ev.clientX));
});
pauseBtn.addEventListener('click', () => view.pause());
dynamiteBtn.addEventListener('click', () => view.useDynamite(view.isOnline ? view.localPlayer : 0));
dynamiteBtn2.addEventListener('click', () => view.useDynamite(1));

window.addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
  const tag = (ev.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const twoLocal = view.players.length === 2 && !view.isOnline;
  const me = view.isOnline ? view.localPlayer : 0;
  // Two players on one keyboard: P1 = S/A/Space fire, W dynamite; P2 = ↓/→ fire, ↑ dynamite.
  const fireKeys: Record<string, number> = twoLocal
    ? { Space: 0, KeyS: 0, KeyA: 0, Enter: 0, NumpadEnter: 0, ArrowDown: 1, ArrowRight: 1 }
    : { Space: me, ArrowDown: me, Enter: me, NumpadEnter: me };
  const dynKeys: Record<string, number> = twoLocal ? { KeyW: 0, ArrowUp: 1 } : { ArrowUp: me, KeyD: me };
  if (ev.code in fireKeys) {
    if (view.state === 'playing' || view.state === 'levelIntro') {
      ev.preventDefault();
      sfx.unlock();
      view.primary(fireKeys[ev.code]);
    } else if (view.state === 'paused' && ev.code !== 'Enter') {
      view.resume();
    }
    return;
  }
  if (ev.code in dynKeys) {
    if (view.state === 'playing') {
      ev.preventDefault();
      view.useDynamite(dynKeys[ev.code]);
    }
    return;
  }
  switch (ev.code) {
    case 'KeyP':
    case 'Escape':
      if (view.state === 'playing') view.pause();
      else if (view.state === 'paused') view.resume();
      break;
    case 'KeyM':
      sfx.unlock();
      sfx.setMuted(!sfx.muted);
      overlay.toast(`${t('menu.sound')}: ${sfx.muted ? t('menu.off') : t('menu.on')}`);
      break;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) view.pause();
});
window.addEventListener('blur', () => view.pause());

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

const hash = parseHash();
if (hash.kind === 'invite') {
  overlay.pendingSave = readSaveFromStorage();
  void startJoining(hash.code);
} else if (hash.kind === 'reply') {
  // Opened from the reply link on the host's phone: hand the code to the game tab.
  clearHash();
  void deliverReply(hash.code).then((ok) => overlay.replyDelivered(hash.code, ok));
} else {
  const hashSave = readSaveFromHash();
  if (location.hash.startsWith('#g=') && !hashSave) {
    overlay.toast(t('menu.badLink'));
    clearHash();
    clearStoredSave();
  }
  overlay.pendingSave = hashSave ?? readSaveFromStorage();
  overlay.menu();
}

if (import.meta.env.DEV) {
  const w = window as unknown as { __game: Game; __view: () => GameView; __PeerLink: typeof PeerLink };
  w.__game = localGame;
  w.__view = () => view;
  w.__PeerLink = PeerLink;
}

// Offline support / installability. Updates are applied on the next launch.
registerSW({ immediate: true });

/* ---------- Loop ---------- */

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  view.frame(dt);
  host?.frame(dt);
  const h = view.players[view.isOnline ? view.localPlayer : 0]?.hook;
  const reeling = view.state === 'playing' && view.players.some((p) => p.hook.phase === 'retract');
  sfx.reel(reeling, h?.grabbed ? 300 / (0.5 + ITEM_SPECS[h.grabbed.kind].weight) : 700);
  renderer.draw(view, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
