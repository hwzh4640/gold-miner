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
  // Ears (drawn first so the head overlaps their base)
  for (const ex of [r * 0.6, r * 1.02]) {
    ctx.beginPath();
    ctx.arc(ex, -r * 0.56, r * 0.19, 0, Math.PI * 2);
    ctx.fillStyle = '#7a5637';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex, -r * 0.56, r * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#e9a0b0';
    ctx.fill();
  }
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

/** Cosmetic idle behaviour of a miner: sitting with legs out, and a cigarette in the free hand. */
export interface MinerPose {
  sit: boolean;
  /** 0 = hand resting on the knee, 1 = cigarette at the lips. */
  smoke: number;
  /** Clock for the drifting smoke puffs. */
  smokeT: number;
}

export const KNEELING: MinerPose = { sit: false, smoke: 0, smokeT: 0 };

/** The miner with a winch, drawn at the pivot point. `spin` rotates the reel. */
export function drawMiner(ctx: Ctx, px: number, py: number, spin: number, phase: string, player = 0, pose: MinerPose = KNEELING): void {
  const shirt = player === 1 ? '#3f7fbf' : '#b97b3f';
  const shirtDark = player === 1 ? '#234a73' : '#6b4520';
  const hat = player === 1 ? '#4a6b8a' : '#c98a3a';
  const hatBand = player === 1 ? '#22364a' : '#5a3a1a';
  ctx.save();
  ctx.translate(px, py);
  // Ledge / platform
  ctx.fillStyle = '#7a4b1c';
  ctx.fillRect(-100, 22, 200, 12);

  // ---- Miner: a stocky dwarf sitting to the right of the winch, cranking it ----
  ctx.save();
  ctx.translate(58, 0); // legs end exactly on the ledge top (y = 22)
  const cranking = phase === 'retract' || phase === 'extend';
  const crank = cranking ? spin * 3 : 0;
  const skin = '#f0c39a';
  const skinLine = '#8a5a3a';
  const hair = '#f4f4f4';
  const hairLine = '#b9b9b9';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Short legs
  if (pose.sit) {
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath();
    ctx.roundRect(-44, 8, 58, 14, 7);
    ctx.fill();
    ctx.fillStyle = '#3a2411';
    ctx.beginPath();
    ctx.roundRect(-58, 10, 20, 12, 4);
    ctx.fill();
  } else {
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath();
    ctx.roundRect(-12, 6, 34, 16, 6);
    ctx.fill();
    ctx.fillStyle = '#3a2411';
    ctx.beginPath();
    ctx.roundRect(-22, 12, 20, 10, 4);
    ctx.fill();
  }

  // Wide barrel torso with suspenders and a belt
  ctx.fillStyle = shirt;
  ctx.strokeStyle = shirtDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-24, -38, 54, 46, 12);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = shirtDark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, -36);
  ctx.lineTo(-10, 2);
  ctx.moveTo(16, -36);
  ctx.lineTo(16, 2);
  ctx.stroke();
  ctx.fillStyle = '#3a2411';
  ctx.fillRect(-24, 0, 54, 8);
  ctx.fillStyle = '#e0b13a';
  ctx.strokeStyle = '#8a6a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-4, -1, 11, 10, 2);
  ctx.fill();
  ctx.stroke();

  // Big round head, sitting straight on the shoulders (no neck)
  ctx.fillStyle = skin;
  ctx.strokeStyle = skinLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -64, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Ear
  ctx.beginPath();
  ctx.arc(25, -64, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e0a888';
  ctx.beginPath();
  ctx.arc(25.5, -64, 3, 0, Math.PI * 2);
  ctx.fill();
  // Rosy cheeks
  ctx.fillStyle = 'rgba(226,110,100,0.35)';
  ctx.beginPath();
  ctx.arc(15, -55, 6, 0, Math.PI * 2);
  ctx.arc(-12, -53, 5, 0, Math.PI * 2);
  ctx.fill();
  // Eyes: whites, pupils, glints
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = skinLine;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(-9, -70, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(9, -70, 5.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(-10.5, -70, 3, 0, Math.PI * 2);
  ctx.arc(7.5, -70, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-11.5, -71.5, 1.1, 0, Math.PI * 2);
  ctx.arc(6.5, -71.5, 1.1, 0, Math.PI * 2);
  ctx.fill();
  // Bushy white eyebrows
  ctx.strokeStyle = hair;
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(-19, -79);
  ctx.quadraticCurveTo(-11, -84, -3, -79);
  ctx.moveTo(3, -79);
  ctx.quadraticCurveTo(11, -84, 19, -79);
  ctx.stroke();
  // Big bulbous nose
  ctx.fillStyle = '#eba58a';
  ctx.strokeStyle = '#a56a4a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(-14, -60, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(-17, -63, 3, 0, Math.PI * 2);
  ctx.fill();

  // Huge beard: from the cheeks down over the chest, tied with a leather ring
  ctx.fillStyle = hair;
  ctx.strokeStyle = hairLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-24, -58);
  ctx.quadraticCurveTo(-36, -30, -26, -6);
  ctx.quadraticCurveTo(-14, 8, 0, 6);
  ctx.quadraticCurveTo(16, 8, 28, -6);
  ctx.quadraticCurveTo(38, -30, 24, -58);
  ctx.quadraticCurveTo(12, -44, 0, -46);
  ctx.quadraticCurveTo(-12, -44, -24, -58);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#d6d6d6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, -40);
  ctx.quadraticCurveTo(-18, -24, -12, -8);
  ctx.moveTo(2, -38);
  ctx.quadraticCurveTo(2, -22, 2, -6);
  ctx.moveTo(16, -40);
  ctx.quadraticCurveTo(20, -24, 14, -8);
  ctx.stroke();
  ctx.fillStyle = '#8a5a2a';
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-5, -14, 12, 7, 3);
  ctx.fill();
  ctx.stroke();
  // Bushy moustache under the nose
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = hairLine;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(-13, -49, 12, 5, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(7, -48, 12, 5, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Hat: wide brim over the brows + tall crown with a band
  ctx.fillStyle = hat;
  ctx.strokeStyle = shirtDark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, -86, 40, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-21, -86);
  ctx.quadraticCurveTo(-23, -104, -11, -108);
  ctx.quadraticCurveTo(2, -111, 16, -108);
  ctx.quadraticCurveTo(27, -104, 25, -86);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hatBand;
  ctx.beginPath();
  ctx.rect(-21, -97, 46, 7);
  ctx.fill();

  // Arm to the crank handle (rotates with the reel); drawn over the beard so it reads
  const hx = -58 + Math.cos(crank) * 22;
  const hy = -6 + Math.sin(crank) * 22;
  ctx.strokeStyle = shirt;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(-14, -26);
  ctx.quadraticCurveTo(-34, -30 + Math.sin(crank) * 6, hx, hy);
  ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hx, hy, 7, 0, Math.PI * 2);
  ctx.fill();

  // Free (near) arm: rests on the knee, or brings a cigarette up to the lips.
  const restX = 28;
  const restY = 4;
  if (pose.smoke > 0.001) {
    const k = pose.smoke * pose.smoke * (3 - 2 * pose.smoke); // smoothstep
    const fx = restX + (-34 - restX) * k;
    const fy = restY + (-54 - restY) * k;
    ctx.strokeStyle = shirt;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(18, -26);
    ctx.quadraticCurveTo(38, -10 - 34 * k, fx, fy);
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.strokeStyle = skinLine;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(fx, fy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Cigarette: points away from the face when at the lips, hangs down when resting.
    const ang = -0.35 + (Math.PI * 0.45) * (1 - k);
    const cx = fx - 5;
    const cy = fy - 1;
    const ex = cx + Math.cos(Math.PI + ang) * 18;
    const ey = cy + Math.sin(Math.PI + ang) * 18;
    ctx.strokeStyle = '#6b5a4a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = '#f8f5ee';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.arc(ex, ey, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // Smoke drifts up from the ember
    if (k > 0.85) {
      for (let i = 0; i < 3; i++) {
        const ph = (pose.smokeT * 0.45 + i / 3) % 1;
        ctx.fillStyle = `rgba(230,230,230,${(1 - ph) * 0.55})`;
        ctx.beginPath();
        ctx.arc(ex - 4 - ph * 12 + Math.sin((pose.smokeT + i) * 3) * 4, ey - 8 - ph * 34, 3 + ph * 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.strokeStyle = shirt;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(18, -26);
    ctx.quadraticCurveTo(38, -10, restX, restY);
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(restX, restY, 7, 0, Math.PI * 2);
    ctx.fill();
  }
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
