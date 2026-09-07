import type { GameView } from '../game/Game';
import { type SaveState, shareUrl } from '../game/save';
import { formatMoney, getLang, LANG_NAMES, LANGS, setLang, t, type Lang, type StringKey } from '../i18n';

import { ITEM_ICON } from './icons';

export interface OverlayActions {
  newGame(players: 1 | 2): void;
  continueGame(save: SaveState): void;
  toggleSound(): boolean;
  isMuted(): boolean;
  isTouch(): boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `btn ${cls}`.trim(), text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** DOM screens layered over the canvas. Re-rendered on language change. */
export class Overlay {
  private root: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private current: (() => void) | null = null;
  pendingSave: SaveState | null = null;
  /** A different game found in local storage when the page was opened from a save link. */
  alternativeSave: SaveState | null = null;

  constructor(private game: GameView, private actions: OverlayActions) {
    this.root = document.getElementById('overlay')!;
    this.toastEl = document.getElementById('toast')!;
    document.getElementById('orientation')!.textContent = t('orientation.hint');
  }

  /** Point the overlays at a different view (local game vs. remote mirror). */
  setGame(g: GameView): void {
    this.game = g;
  }

  /** Re-render the current screen (used after language switches). */
  refresh(): void {
    document.title = t('app.title');
    document.getElementById('orientation')!.textContent = t('orientation.hint');
    this.current?.();
  }

  hide(): void {
    this.current = null;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  private show(build: (panel: HTMLElement) => void, transparent = false, onBackdrop?: () => void): void {
    this.current = () => this.show(build, transparent, onBackdrop);
    this.root.innerHTML = '';
    this.root.classList.remove('hidden');
    this.root.classList.toggle('transparent', transparent);
    this.root.onpointerdown = onBackdrop
      ? (ev) => {
          // Tap anywhere that is not a control counts as the primary action.
          if ((ev.target as HTMLElement).closest('button, input')) return;
          ev.preventDefault();
          onBackdrop();
        }
      : null;
    const panel = el('div', 'panel');
    build(panel);
    this.root.appendChild(panel);
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  }

  private langRow(): HTMLElement {
    const row = el('div', 'row lang-row');
    for (const lang of LANGS) {
      const b = button(LANG_NAMES[lang], `secondary${getLang() === lang ? ' active' : ''}`, () => {
        setLang(lang as Lang);
        this.refresh();
      });
      row.appendChild(b);
    }
    return row;
  }

  private soundButton(): HTMLButtonElement {
    const label = () => `${t('menu.sound')}: ${this.actions.isMuted() ? t('menu.off') : t('menu.on')}`;
    const b = button(label(), 'secondary', () => {
      this.actions.toggleSound();
      b.textContent = label();
    });
    return b;
  }

  menu(): void {
    this.show((p) => {
      p.appendChild(el('h1', undefined, t('app.title')));
      const s = this.pendingSave;
      if (s) {
        p.appendChild(button(s.players === 2 ? t('menu.continueCoop') : t('menu.continue'), 'primary', () => this.actions.continueGame(s)));
        p.appendChild(el('p', 'muted', t('menu.continueInfo', { level: s.level, money: s.money })));
      }
      const alt = this.alternativeSave;
      if (alt) {
        p.appendChild(button(t('menu.continueOther'), 'secondary', () => this.actions.continueGame(alt)));
        p.appendChild(el('p', 'muted', t('menu.continueInfo', { level: alt.level, money: alt.money })));
      }
      p.appendChild(button(t('menu.newGame'), s ? '' : 'primary', () => this.actions.newGame(1)));
      p.appendChild(el('h2', undefined, t('menu.twoPlayers'))).style.marginTop = '16px';
      p.appendChild(button(t('menu.localCoop'), 'secondary', () => this.actions.newGame(2)));
      const how = el('p', 'muted');
      how.textContent = this.actions.isTouch() ? t('menu.howToMobile') : t('menu.howToDesktop');
      p.appendChild(el('h2', undefined, t('menu.howTo'))).style.marginTop = '16px';
      p.appendChild(how);
      p.appendChild(el('p', 'muted', t('menu.localCoopHint')));
      p.appendChild(el('p', 'muted', t('menu.saveHint')));
      const row = el('div', 'row');
      row.appendChild(this.soundButton());
      p.appendChild(row);
      p.appendChild(this.langRow());
    });
  }

  levelIntro(): void {
    const g = this.game;
    this.show((p) => {
      p.appendChild(el('h1', undefined, t('level.start', { level: g.save.level })));
      p.appendChild(el('p', undefined, t('level.goal', { goal: g.level.goal.toLocaleString('en-US') })));
      if (g.save.inventory.length) {
        const row = el('div', 'row');
        for (const id of g.save.inventory) {
          const chip = el('span', 'chip');
          chip.innerHTML = `${ITEM_ICON[id]} <span>${t(`item.${id}` as StringKey)}</span>`;
          row.appendChild(chip);
        }
        p.appendChild(row);
      }
      p.appendChild(button(t('level.tapToStart'), 'primary', () => g.primary()));
    }, true, () => g.primary());
  }

  paused(): void {
    const g = this.game;
    this.show((p) => {
      p.appendChild(el('h2', undefined, t('pause.title')));
      p.appendChild(button(t('pause.resume'), 'primary', () => g.resume()));
      const row = el('div', 'row');
      row.appendChild(button(t('pause.restartLevel'), 'secondary', () => g.restartLevel()));
      row.appendChild(button(t('pause.quit'), 'secondary', () => g.quitToMenu()));
      row.appendChild(this.soundButton());
      p.appendChild(row);
      p.appendChild(this.saveLinkBox());
      p.appendChild(this.langRow());
    });
  }

  private saveLinkBox(): HTMLElement {
    const wrap = el('div');
    wrap.appendChild(el('p', 'muted', t('pause.saveLink')));
    const box = el('div', 'link-box');
    const input = el('input');
    input.readOnly = true;
    input.value = shareUrl(this.game.save);
    input.addEventListener('focus', () => input.select());
    const copy = button(t('pause.copy'), 'secondary', async () => {
      try {
        await navigator.clipboard.writeText(input.value);
      } catch {
        input.select();
        document.execCommand('copy');
      }
      this.toast(t('pause.copied'));
    });
    copy.style.margin = '0';
    box.append(input, copy);
    wrap.appendChild(box);
    return wrap;
  }

  levelResult(): void {
    const g = this.game;
    this.show((p) => {
      p.appendChild(el('h1', undefined, t('level.cleared', { level: g.save.level })));
      p.appendChild(el('div', 'big-money', formatMoney(g.save.money)));
      p.appendChild(button(t('level.next'), 'primary', () => g.openShop()));
    });
  }

  gameOver(): void {
    const g = this.game;
    this.show((p) => {
      p.appendChild(el('h1', undefined, t('gameover.title')));
      p.appendChild(el('p', undefined, t('level.failed')));
      p.appendChild(el('p', undefined, t('gameover.summary', { level: g.save.level, money: g.money.toLocaleString('en-US') })));
      p.appendChild(button(t('level.retry'), 'primary', () => g.restartLevel()));
      const row = el('div', 'row');
      row.appendChild(button(t('menu.newGame'), 'secondary', () => this.actions.newGame(g.save.players)));
      row.appendChild(button(t('pause.quit'), 'secondary', () => g.quitToMenu()));
      p.appendChild(row);
    });
  }

  shop(onBuy: () => void): void {
    const g = this.game;
    this.show((p) => {
      p.appendChild(el('h1', undefined, t('shop.title')));
      p.appendChild(el('p', 'muted', t('shop.subtitle')));
      const money = el('div', 'big-money', formatMoney(g.save.money));
      p.appendChild(money);
      const list = el('div', 'shop-list');
      const rows: (() => void)[] = [];
      for (const offer of g.offers) {
        const item = el('div', 'shop-item');
        const icon = el('div', 'icon');
        icon.innerHTML = ITEM_ICON[offer.id];
        item.appendChild(icon);
        const info = el('div');
        info.appendChild(el('div', 'name', t(`item.${offer.id}` as StringKey)));
        info.appendChild(el('div', 'desc', t(`item.${offer.id}.desc` as StringKey)));
        item.appendChild(info);
        const right = el('div');
        right.appendChild(el('div', 'price', formatMoney(offer.price)));
        const buy = button(t('shop.buy'), '', () => {
          if (g.buy(offer)) {
            onBuy();
            money.textContent = formatMoney(g.save.money);
            rows.forEach((r) => r());
          }
        });
        right.appendChild(buy);
        item.appendChild(right);
        list.appendChild(item);
        const update = () => {
          const owned = offer.id !== 'dynamite' && g.owns(offer.id);
          const dynCount = offer.id === 'dynamite' ? g.save.inventory.filter((i) => i === 'dynamite').length : 0;
          buy.disabled = !g.canBuy(offer);
          buy.textContent = owned ? t('shop.owned') : dynCount ? `${t('shop.buy')} (${dynCount})` : g.save.money < offer.price ? t('shop.tooExpensive') : t('shop.buy');
        };
        rows.push(update);
        update();
      }
      p.appendChild(list);
      p.appendChild(button(t('shop.next'), 'primary', () => g.nextLevel()));
    });
  }
}
