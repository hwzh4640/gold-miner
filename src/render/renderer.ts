import type { Game } from '../game/Game';
import { PIVOT_X, PIVOT_Y } from '../game/Hook';
import { GROUND_Y, WORLD_H, WORLD_W } from '../game/Level';
import { formatMoney, t } from '../i18n';
import { drawClaw, drawEntity, drawMiner } from './sprites';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans CJK TC", sans-serif';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  private bg: HTMLCanvasElement | null = null;
  private reelSpin = 0;
  private time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not supported');
    this.ctx = ctx;
    this.resize();
  }

  /** Fit the 1600x900 world into the element's box, letterboxing, at device pixel ratio. */
  resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.scale = Math.min(w / WORLD_W, h / WORLD_H);
    this.offsetX = (w - WORLD_W * this.scale) / 2;
    this.offsetY = (h - WORLD_H * this.scale) / 2;
    this.bg = null;
  }

  /** Convert a client-space point to world coordinates. */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / rect.width;
    const px = (clientX - rect.left) * dpr;
    const py = (clientY - rect.top) * dpr;
    return { x: (px - this.offsetX) / this.scale, y: (py - this.offsetY) / this.scale };
  }

  private buildBackground(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = WORLD_W;
    c.height = WORLD_H;
    const g = c.getContext('2d')!;
    // Sky band
    const sky = g.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, '#f9d648');
    sky.addColorStop(1, '#f0b62a');
    g.fillStyle = sky;
    g.fillRect(0, 0, WORLD_W, GROUND_Y);
    // Ground line
    g.fillStyle = '#6f4a1e';
    g.fillRect(0, GROUND_Y - 10, WORLD_W, 14);
    // Dirt strata
    const strata: [number, string, string][] = [
      [GROUND_Y, '#e2c08e', '#d6a96a'],
      [GROUND_Y + 190, '#c99a58', '#b8843f'],
      [GROUND_Y + 420, '#ad7a34', '#98652a'],
      [GROUND_Y + 620, '#8f5d27', '#7a4c1f'],
    ];
    for (let i = 0; i < strata.length; i++) {
      const [y0, c0, c1] = strata[i]!;
      const y1 = strata[i + 1]?.[0] ?? WORLD_H;
      const grad = g.createLinearGradient(0, y0, 0, y1 + 40);
      grad.addColorStop(0, c0);
      grad.addColorStop(1, c1);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, y0);
      // Wavy boundary
      for (let x = 0; x <= WORLD_W; x += 40) {
        const wave = Math.sin(x / 140 + i * 1.7) * 18 + Math.sin(x / 47 + i) * 6;
        g.lineTo(x, y0 + wave);
      }
      g.lineTo(WORLD_W, WORLD_H);
      g.lineTo(0, WORLD_H);
      g.closePath();
      g.fill();
    }
    // Dark vignette on the sides like the original
    const vig = g.createLinearGradient(0, 0, WORLD_W, 0);
    vig.addColorStop(0, 'rgba(0,0,0,0.35)');
    vig.addColorStop(0.08, 'rgba(0,0,0,0)');
    vig.addColorStop(0.92, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = vig;
    g.fillRect(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y);
    // Speckles
    g.fillStyle = 'rgba(0,0,0,0.08)';
    let s = 12345;
    for (let i = 0; i < 500; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const x = (s % WORLD_W);
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const y = GROUND_Y + (s % (WORLD_H - GROUND_Y));
      g.fillRect(x, y, 3, 3);
    }
    return c;
  }

  draw(game: Game, dt: number): void {
    this.time += dt;
    const ctx = this.ctx;
    const { canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.clip();

    if (!this.bg) this.bg = this.buildBackground();
    ctx.drawImage(this.bg, 0, 0);

    const showWorld = game.state !== 'menu';
    if (showWorld) {
      for (const e of game.level.entities) {
        if (e.taken && e !== game.hook.grabbed) continue;
        drawEntity(ctx, e, this.time);
      }
      // Rope
      const hook = game.hook;
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(PIVOT_X, PIVOT_Y);
      ctx.lineTo(hook.tipX, hook.tipY);
      ctx.stroke();
      if (hook.phase === 'retract') this.reelSpin += dt * 10;
      else if (hook.phase === 'extend') this.reelSpin -= dt * 10;
      drawMiner(ctx, PIVOT_X, PIVOT_Y, this.reelSpin, hook.angle, hook.phase);
      drawClaw(ctx, hook.tipX, hook.tipY, hook.angle, hook.grabbed ? 0 : 1);

      for (const p of game.popups) {
        const k = p.age / p.life;
        ctx.globalAlpha = 1 - k * k;
        ctx.font = `bold 34px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(p.text, p.x, p.y - k * 50);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y - k * 50);
        ctx.globalAlpha = 1;
      }
      this.drawHud(game);
    }
    ctx.restore();
  }

  private drawHud(game: Game): void {
    const ctx = this.ctx;
    ctx.textBaseline = 'top';
    const label = (txt: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
      ctx.textAlign = align;
      ctx.font = `600 26px ${FONT}`;
      ctx.fillStyle = '#5a3a12';
      ctx.fillText(txt, x, y);
    };
    const value = (txt: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') => {
      ctx.textAlign = align;
      ctx.font = `bold 34px ${FONT}`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.strokeText(txt, x, y);
      ctx.fillStyle = color;
      ctx.fillText(txt, x, y);
    };
    // Left: money + goal
    label(t('hud.money'), 40, 18);
    value(formatMoney(game.money), 150, 12, game.money >= game.level.goal ? '#1c8f2e' : '#1a7b2a');
    label(t('hud.goal'), 40, 68);
    value(formatMoney(game.level.goal), 150, 62, '#b8420c');
    // Right: time + level
    const rx = WORLD_W - 40;
    label(t('hud.time'), rx - 150, 18, 'right');
    const secs = Math.ceil(game.timeLeft);
    value(String(secs), rx, 12, secs <= 10 ? '#d21f1f' : '#b8420c', 'right');
    label(t('hud.level'), rx - 150, 68, 'right');
    value(String(game.save.level), rx, 62, '#b8420c', 'right');
    // Dynamite count near the miner
    if (game.buffs.dynamite > 0) {
      const x = PIVOT_X + 130;
      const y = 28;
      ctx.fillStyle = '#d8321f';
      ctx.strokeStyle = '#7a1a10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, 22, 40, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f7d13a';
      ctx.fillRect(x, y + 14, 22, 8);
      ctx.strokeStyle = '#6b4a1f';
      ctx.beginPath();
      ctx.moveTo(x + 16, y);
      ctx.quadraticCurveTo(x + 22, y - 12, x + 30, y - 10);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = `bold 30px ${FONT}`;
      ctx.fillStyle = '#5a3a12';
      ctx.fillText(`× ${game.buffs.dynamite}`, x + 32, 30);
    }
  }
}
