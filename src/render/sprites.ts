import { ITEM_SPECS, type Entity } from '../game/entities';
import { Rng } from '../game/rng';

type Ctx = CanvasRenderingContext2D;

/** Blob outline for gold nuggets: a jittered circle, stable per entity variant. */
function blobPath(ctx: Ctx, r: number, variant: number, points = 9): void {
  const rng = new Rng(variant);
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = i === points ? 0 : i;
    const rr = r * (0.82 + 0.22 * new Rng(variant * 31 + k).next());
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else {
      const pa = ((i - 0.5) / points) * Math.PI * 2;
      const pr = r * (0.9 + 0.15 * rng.next());
      ctx.quadraticCurveTo(Math.cos(pa) * pr, Math.sin(pa) * pr, x, y);
    }
  }
  ctx.closePath();
}

export function drawGold(ctx: Ctx, r: number, variant: number): void {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, '#fff3a0');
  g.addColorStop(0.45, '#ffd51c');
  g.addColorStop(1, '#d99a00');
  blobPath(ctx, r, variant);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.strokeStyle = '#8a5a00';
  ctx.stroke();
  // Highlight
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.35, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();
}

export function drawRock(ctx: Ctx, r: number, variant: number): void {
  const rng = new Rng(variant);
  ctx.beginPath();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const rr = r * rng.range(0.8, 1.05);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#9aa3ad');
  g.addColorStop(1, '#5c6670');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.strokeStyle = '#2f373f';
  ctx.stroke();
  // Cracks
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, -r * 0.1);
  ctx.lineTo(-r * 0.05, r * 0.15);
  ctx.lineTo(r * 0.25, r * 0.05);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = Math.max(1.5, r * 0.04);
  ctx.stroke();
}

export function drawDiamond(ctx: Ctx, r: number): void {
  const w = r * 1.5;
  const h = r * 1.4;
  ctx.beginPath();
  ctx.moveTo(-w * 0.55, -h * 0.25);
  ctx.lineTo(-w * 0.3, -h * 0.6);
  ctx.lineTo(w * 0.3, -h * 0.6);
  ctx.lineTo(w * 0.55, -h * 0.25);
  ctx.lineTo(0, h * 0.6);
  ctx.closePath();
  const g = ctx.createLinearGradient(-w, -h, w, h);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, '#9fe8ff');
  g.addColorStop(1, '#2fa8d8');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#1b6f94';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Facets
  ctx.beginPath();
  ctx.moveTo(-w * 0.55, -h * 0.25);
  ctx.lineTo(w * 0.55, -h * 0.25);
  ctx.moveTo(-w * 0.3, -h * 0.6);
  ctx.lineTo(-w * 0.15, -h * 0.25);
  ctx.lineTo(0, h * 0.6);
  ctx.moveTo(w * 0.3, -h * 0.6);
  ctx.lineTo(w * 0.15, -h * 0.25);
  ctx.lineTo(0, h * 0.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

export function drawBag(ctx: Ctx, r: number): void {
  // Sack body
  ctx.beginPath();
  ctx.moveTo(-r * 0.35, -r * 0.55);
  ctx.quadraticCurveTo(-r * 1.1, -r * 0.1, -r * 0.8, r * 0.7);
  ctx.quadraticCurveTo(0, r * 1.15, r * 0.8, r * 0.7);
  ctx.quadraticCurveTo(r * 1.1, -r * 0.1, r * 0.35, -r * 0.55);
  ctx.closePath();
  const g = ctx.createRadialGradient(-r * 0.2, 0, r * 0.1, 0, 0.2 * r, r * 1.2);
  g.addColorStop(0, '#f7dfb3');
  g.addColorStop(1, '#c9944d');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#6d4a1f';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Tie
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.6, r * 0.42, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e9c98e';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.7);
  ctx.lineTo(-r * 0.55, -r * 1.05);
  ctx.moveTo(r * 0.3, -r * 0.7);
  ctx.lineTo(r * 0.55, -r * 1.0);
  ctx.strokeStyle = '#6d4a1f';
  ctx.lineWidth = 3;
  ctx.stroke();
  // ?
  ctx.fillStyle = '#e2461f';
  ctx.font = `bold ${Math.round(r * 1.2)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 0, r * 0.25);
}

export function drawMole(ctx: Ctx, r: number, facing: number, withDiamond: boolean, t: number): void {
  ctx.save();
  ctx.scale(facing < 0 ? -1 : 1, 1);
  const bob = Math.sin(t * 14) * r * 0.06;
  ctx.translate(0, bob);
  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#6b4a2e';
  ctx.fill();
  ctx.strokeStyle = '#33210f';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Head
  ctx.beginPath();
  ctx.ellipse(r * 0.85, -r * 0.15, r * 0.55, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#7a5637';
  ctx.fill();
  ctx.stroke();
  // Nose & eye
  ctx.beginPath();
  ctx.arc(r * 1.38, -r * 0.1, r * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = '#e07a8f';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 1.0, -r * 0.3, r * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = '#111';
  ctx.fill();
  // Feet
  ctx.fillStyle = '#4a321c';
  const step = Math.sin(t * 14) * r * 0.15;
  ctx.beginPath();
  ctx.ellipse(-r * 0.5 + step, r * 0.7, r * 0.25, r * 0.12, 0, 0, Math.PI * 2);
  ctx.ellipse(r * 0.4 - step, r * 0.7, r * 0.25, r * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, 0);
  ctx.quadraticCurveTo(-r * 1.5, -r * 0.3, -r * 1.55, r * 0.1);
  ctx.strokeStyle = '#4a321c';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  if (withDiamond) {
    ctx.save();
    ctx.translate(0, -r * 0.95);
    drawDiamond(ctx, r * 0.55);
    ctx.restore();
  }
}

export function drawEntity(ctx: Ctx, e: Entity, t: number): void {
  const r = ITEM_SPECS[e.kind].radius;
  ctx.save();
  ctx.translate(e.x, e.y);
  switch (e.kind) {
    case 'goldS':
    case 'goldM':
    case 'goldL':
    case 'goldXL':
      ctx.rotate(e.rot);
      drawGold(ctx, r, e.variant);
      break;
    case 'rockS':
    case 'rockL':
      ctx.rotate(e.rot);
      drawRock(ctx, r, e.variant);
      break;
    case 'diamond':
      drawDiamond(ctx, r);
      break;
    case 'bag':
      drawBag(ctx, r);
      break;
    case 'mole':
    case 'moleDiamond':
      drawMole(ctx, r, e.vx, e.kind === 'moleDiamond', t);
      break;
  }
  ctx.restore();
}

/** The miner with a winch, drawn at the pivot point. `spin` rotates the reel. */
export function drawMiner(ctx: Ctx, px: number, py: number, spin: number, phase: string): void {
  ctx.save();
  ctx.translate(px, py);
  // Ledge / platform
  ctx.fillStyle = '#7a4b1c';
  ctx.fillRect(-100, 22, 200, 12);

  // ---- Miner (sits to the right of the winch, cranking it) ----
  ctx.save();
  ctx.translate(58, -4);
  const cranking = phase === 'retract' || phase === 'extend';
  const crank = cranking ? spin * 3 : 0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Legs (kneeling, seen from the side)
  ctx.fillStyle = '#5a3a1a';
  ctx.beginPath();
  ctx.roundRect(-12, 4, 34, 18, 6);
  ctx.fill();
  ctx.fillStyle = '#3a2411';
  ctx.beginPath();
  ctx.roundRect(-20, 14, 18, 10, 4);
  ctx.fill();

  // Torso
  ctx.fillStyle = '#b97b3f';
  ctx.strokeStyle = '#6b4520';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-14, -46, 40, 54, 10);
  ctx.fill();
  ctx.stroke();
  // Suspenders
  ctx.strokeStyle = '#6b4520';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, -44);
  ctx.lineTo(-6, 4);
  ctx.moveTo(14, -44);
  ctx.lineTo(14, 4);
  ctx.stroke();

  // Arm to the crank handle (rotates with the reel)
  const hx = -58 + Math.cos(crank) * 22;
  const hy = -6 + Math.sin(crank) * 22;
  ctx.strokeStyle = '#b97b3f';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(-8, -30);
  ctx.quadraticCurveTo(-30, -36 + Math.sin(crank) * 6, hx, hy);
  ctx.stroke();
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(hx, hy, 7, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#f2c9a0';
  ctx.strokeStyle = '#8a5a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(4, -72, 20, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Ear
  ctx.beginPath();
  ctx.arc(24, -72, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Eye and brow
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(-6, -76, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-13, -84);
  ctx.lineTo(-1, -86);
  ctx.stroke();
  // Nose
  ctx.fillStyle = '#e8b48c';
  ctx.beginPath();
  ctx.arc(-12, -68, 5, 0, Math.PI * 2);
  ctx.fill();

  // Big white beard: covers the lower face and spills over the chest
  ctx.fillStyle = '#f4f4f4';
  ctx.strokeStyle = '#b9b9b9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, -64);
  ctx.quadraticCurveTo(-30, -40, -22, -18);
  ctx.quadraticCurveTo(-14, -6, 0, -8);
  ctx.quadraticCurveTo(14, -6, 22, -18);
  ctx.quadraticCurveTo(30, -40, 22, -62);
  ctx.quadraticCurveTo(4, -52, -14, -64);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Beard strands
  ctx.strokeStyle = '#d6d6d6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -44);
  ctx.quadraticCurveTo(-12, -30, -8, -18);
  ctx.moveTo(4, -46);
  ctx.quadraticCurveTo(4, -32, 4, -16);
  ctx.moveTo(16, -44);
  ctx.quadraticCurveTo(18, -30, 14, -20);
  ctx.stroke();
  // Moustache
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-8, -60, 11, 5, -0.15, 0, Math.PI * 2);
  ctx.ellipse(8, -59, 11, 5, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b9b9b9';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Hat: wide brim + tall crown with a band
  ctx.fillStyle = '#c98a3a';
  ctx.strokeStyle = '#6b4520';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(4, -88, 34, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-16, -88);
  ctx.quadraticCurveTo(-18, -104, -8, -108);
  ctx.quadraticCurveTo(4, -111, 18, -108);
  ctx.quadraticCurveTo(26, -104, 24, -88);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#5a3a1a';
  ctx.beginPath();
  ctx.rect(-16, -98, 40, 7);
  ctx.fill();
  ctx.restore();

  // ---- Winch ----
  ctx.save();
  ctx.rotate(spin);
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#777';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(20, 0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#444';
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  // Stand legs
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-14, 6);
  ctx.lineTo(-24, 24);
  ctx.moveTo(14, 6);
  ctx.lineTo(24, 24);
  ctx.stroke();
  ctx.restore();
}

/** The claw at the rope tip. Angle = rope angle; `open` 1 = open, 0 = closed on item. */
export function drawClaw(ctx: Ctx, x: number, y: number, angle: number, open: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle);
  ctx.strokeStyle = '#3a3a3a';
  ctx.fillStyle = '#8c8c8c';
  ctx.lineWidth = 3;
  // Hub
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const spread = 0.55 + open * 0.55;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(s * 16 * spread, 14, s * 10 * spread, 26);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(0, 24);
  ctx.stroke();
  ctx.restore();
}
