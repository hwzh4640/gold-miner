import { PLAYER_COLORS, type GameView } from '../game/Game';
import { isGold, isRock, type ItemKind } from '../game/entities';
import { PIVOT_Y } from '../game/Hook';
import { GROUND_Y, WORLD_H, WORLD_W } from '../game/Level';
import { formatMoney, t } from '../i18n';
import { drawClaw, drawEntity, drawMiner, type MinerPose } from './sprites';

/** A miner's current idle behaviour and when to roll a new one. */
interface MinerState extends MinerPose {
  smoking: boolean;
  nextChange: number;
}

interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  age: number;
  life: number;
}

const GRAVITY = 1100;

function debrisColors(kind: ItemKind): string[] {
  if (isRock(kind)) return ['#9aa3b0', '#6f7986', '#525b68', '#3f4753'];
  if (isGold(kind)) return ['#ffe36b', '#f2c12e', '#c99a1a', '#8a6a0f'];
  if (kind === 'diamond' || kind === 'moleDiamond') return ['#dffbff', '#8fe4ff', '#4fc3f7', '#2a8fc4'];
  return ['#a0785a', '#7a5637', '#5a3d24'];
}

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans CJK TC", sans-serif';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  private bg: HTMLCanvasElement | null = null;
  private reelSpin: number[] = [0, 0];
  private time = 0;
  private miners: MinerState[] = [];
  private debris: Debris[] = [];
  private blasts: { x: number; y: number; age: number }[] = [];

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

  /** Spawn flying chunks and a dust ring where dynamite just went off. */
  burst(x: number, y: number, kind: ItemKind): void {
    const colors = debrisColors(kind);
    const n = isRock(kind) ? 22 : 16;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
      const sp = 180 + Math.random() * 360;
      this.debris.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 16,
        size: 4 + Math.random() * 9,
        color: colors[Math.floor(Math.random() * colors.length)]!,
        age: 0,
        life: 0.6 + Math.random() * 0.5,
      });
    }
    this.blasts.push({ x, y, age: 0 });
  }

  private minerState(i: number): MinerState {
    let s = this.miners[i];
    if (!s) {
      s = { sit: false, smoke: 0, smokeT: Math.random() * 10, smoking: false, nextChange: this.time + 3 + Math.random() * 5 };
      this.miners[i] = s;
    }
    return s;
  }

  /** Idle behaviour: every few seconds while the hook swings, maybe sit down or light up. */
  private updateMiner(s: MinerState, swinging: boolean, dt: number): void {
    s.smokeT += dt;
    if (swinging && this.time >= s.nextChange) {
      s.sit = Math.random() < 0.45;
      s.smoking = Math.random() < 0.5;
      s.nextChange = this.time + 6 + Math.random() * 8;
    }
    // While smoking the hand goes to the lips for a drag and back to the knee.
    const target = s.smoking && Math.sin(s.smokeT * 0.8) > -0.3 ? 1 : 0;
    s.smoke += (target - s.smoke) * Math.min(1, dt * 3);
  }

  private drawEffects(dt: number): void {
    const ctx = this.ctx;
    for (const b of this.blasts) {
      b.age += dt;
      const k = b.age / 0.45;
      if (k >= 1) continue;
      ctx.strokeStyle = `rgba(255,214,140,${(1 - k) * 0.8})`;
      ctx.lineWidth = 10 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 12 + k * 90, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(120,90,60,${(1 - k) * 0.35})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 20 + k * 60, 0, Math.PI * 2);
      ctx.fill();
    }
    this.blasts = this.blasts.filter((b) => b.age < 0.45);
    for (const d of this.debris) {
      d.age += dt;
      d.vy += GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      const k = d.age / d.life;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.moveTo(-d.size, -d.size * 0.6);
      ctx.lineTo(d.size * 0.7, -d.size);
      ctx.lineTo(d.size, d.size * 0.5);
      ctx.lineTo(-d.size * 0.5, d.size * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    this.debris = this.debris.filter((d) => d.age < d.life && d.y < WORLD_H + 40);
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
      // Wavy boundary between layers; the top layer meets the ground line flat so the
      // ledge the miner stands on is never buried by a dune.
      for (let x = 0; x <= WORLD_W; x += 40) {
        const wave = i === 0 ? 0 : Math.sin(x / 140 + i * 1.7) * 18 + Math.sin(x / 47 + i) * 6;
        g.lineTo(x, y0 + wave);
      }
      g.lineTo(WORLD_W, WORLD_H);
      g.lineTo(0, WORLD_H);
      g.closePath();
      g.fill();
    }
    // Ground line, drawn last so it sits on top of every layer and lines up with the ledge.
    g.fillStyle = '#6f4a1e';
    g.fillRect(0, GROUND_Y - 10, WORLD_W, 14);
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

  draw(game: GameView, dt: number): void {
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
      const grabbed = new Set(game.players.map((p) => p.hook.grabbed));
      for (const e of game.level.entities) {
        if (e.taken && !grabbed.has(e)) continue;
        drawEntity(ctx, e, this.time);
      }
      for (const p of game.players) {
        const hook = p.hook;
        // Rope
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(hook.pivotX, PIVOT_Y);
        ctx.lineTo(hook.tipX, hook.tipY);
        ctx.stroke();
        let spin = this.reelSpin[p.index] ?? 0;
        if (hook.phase === 'retract') spin += dt * 10;
        else if (hook.phase === 'extend') spin -= dt * 10;
        this.reelSpin[p.index] = spin;
        const ms = this.minerState(p.index);
        this.updateMiner(ms, hook.phase === 'swing', dt);
        drawMiner(ctx, hook.pivotX, PIVOT_Y, spin, hook.phase, p.index, ms);
        drawClaw(ctx, hook.tipX, hook.tipY, hook.angle, hook.grabbed ? 0 : 1);
        // Local-player marker in two-player games
        if (game.players.length > 1 && p.index === game.localPlayer && game.isOnline) {
          const mx = hook.pivotX - 64;
          const my = PIVOT_Y - 70 + Math.sin(this.time * 4) * 4;
          ctx.fillStyle = PLAYER_COLORS[p.index] ?? '#fff';
          ctx.strokeStyle = '#5a3a12';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(mx - 12, my - 16);
          ctx.lineTo(mx + 12, my - 16);
          ctx.lineTo(mx, my);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      this.drawEffects(dt);
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

  private drawHud(game: GameView): void {
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
    const secs = Math.ceil(game.timeLeft);
    const moneyColor = game.money >= game.level.goal ? '#1c8f2e' : '#1a7b2a';
    const rx = WORLD_W - 40;
    let dynX = (game.players[0]?.hook.pivotX ?? WORLD_W / 2) + 130;
    if (game.players.length === 1) {
      // Left: money + goal
      label(t('hud.money'), 40, 18);
      value(formatMoney(game.money), 150, 12, moneyColor);
      label(t('hud.goal'), 40, 68);
      value(formatMoney(game.level.goal), 150, 62, '#b8420c');
      // Right: time + level
      label(t('hud.time'), rx - 150, 18, 'right');
      value(String(secs), rx, 12, secs <= 10 ? '#d21f1f' : '#b8420c', 'right');
      label(t('hud.level'), rx - 150, 68, 'right');
      value(String(game.level.level), rx, 62, '#b8420c', 'right');
    } else {
      // Two players: each player's own money at their edge, shared total + goal in the middle,
      // time and level in the middle band above the winches.
      const [p1, p2] = game.players;
      label(t('hud.player', { n: 1 }), 40, 18);
      value(formatMoney(p1?.levelMoney ?? 0), 40, 50, '#1a7b2a');
      label(t('hud.player', { n: 2 }), rx, 18, 'right');
      value(formatMoney(p2?.levelMoney ?? 0), rx, 50, '#1a7b2a', 'right');
      const cx = WORLD_W / 2;
      label(`${t('hud.money')}`, cx - 12, 8, 'right');
      value(formatMoney(game.money), cx + 12, 2, moneyColor, 'left');
      label(`${t('hud.goal')}`, cx - 12, 48, 'right');
      value(formatMoney(game.level.goal), cx + 12, 42, '#b8420c', 'left');
      ctx.font = `600 22px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = secs <= 10 ? '#d21f1f' : '#5a3a12';
      ctx.fillText(`${t('hud.time')} ${secs}   ·   ${t('hud.level')} ${game.level.level}`, cx, 92);
      dynX = (p1?.hook.pivotX ?? 0) - 200;
    }
    // Dynamite count
    if (game.buffs.dynamite > 0) {
      const x = dynX;
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
