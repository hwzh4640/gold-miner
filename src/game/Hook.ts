import { ITEM_SPECS, type Entity } from './entities';
import { WORLD_W, WORLD_H } from './Level';

export type HookPhase = 'swing' | 'extend' | 'retract';

export const PIVOT_X = WORLD_W / 2;
export const PIVOT_Y = 118;
/** Swing amplitude either side of straight down, radians. */
export const SWING_AMPLITUDE = (80 * Math.PI) / 180;
export const SWING_PERIOD = 1.7;
export const EXTEND_SPEED = 620; // world units / s
export const BASE_RETRACT_SPEED = 620;
export const EMPTY_RETRACT_SPEED = 700;
export const MIN_LENGTH = 34;
export const HOOK_RADIUS = 12;

/** Weight → retract speed. Heavier is slower; weight 0.5 is nearly as fast as empty. */
export function retractSpeed(weight: number, reelMultiplier: number): number {
  return (BASE_RETRACT_SPEED / (0.5 + weight)) * 1.2 * reelMultiplier;
}

export class Hook {
  phase: HookPhase = 'swing';
  /** Angle from straight down; positive = towards the right. */
  angle = 0;
  length = MIN_LENGTH;
  /** Clock driving the pendulum. */
  private swingT = 0;
  grabbed: Entity | null = null;
  /** Set on the tick an item is hooked; the caller reads and clears it. */
  justGrabbed: Entity | null = null;
  reelMultiplier = 1;

  reset(): void {
    this.phase = 'swing';
    this.length = MIN_LENGTH;
    this.grabbed = null;
    this.justGrabbed = null;
  }

  get tipX(): number {
    return PIVOT_X + Math.sin(this.angle) * this.length;
  }
  get tipY(): number {
    return PIVOT_Y + Math.cos(this.angle) * this.length;
  }

  fire(): boolean {
    if (this.phase !== 'swing') return false;
    this.phase = 'extend';
    return true;
  }

  /** Blow up whatever is on the hook. Returns the destroyed entity or null. */
  dynamite(): Entity | null {
    if (this.phase !== 'retract' || !this.grabbed) return null;
    const e = this.grabbed;
    e.taken = true;
    this.grabbed = null;
    return e;
  }

  /**
   * Advance by dt seconds. Returns an entity when it has been reeled all the way in
   * (the caller cashes it), otherwise null.
   */
  update(dt: number, entities: Entity[]): Entity | null {
    switch (this.phase) {
      case 'swing': {
        this.swingT += dt;
        this.angle = SWING_AMPLITUDE * Math.sin((this.swingT / SWING_PERIOD) * Math.PI * 2);
        return null;
      }
      case 'extend': {
        this.length += EXTEND_SPEED * dt;
        const x = this.tipX;
        const y = this.tipY;
        // Hit an item?
        for (const e of entities) {
          if (e.taken) continue;
          const r = ITEM_SPECS[e.kind].radius;
          if (Math.hypot(e.x - x, e.y - y) <= r + HOOK_RADIUS * 0.5) {
            e.taken = true;
            this.grabbed = e;
            this.justGrabbed = e;
            this.phase = 'retract';
            return null;
          }
        }
        // Hit the edge of the world?
        if (x < 0 || x > WORLD_W || y > WORLD_H) this.phase = 'retract';
        return null;
      }
      case 'retract': {
        const speed = this.grabbed
          ? retractSpeed(ITEM_SPECS[this.grabbed.kind].weight, this.reelMultiplier)
          : EMPTY_RETRACT_SPEED;
        this.length -= speed * dt;
        if (this.grabbed) {
          // Item hangs a bit below the hook tip.
          const r = ITEM_SPECS[this.grabbed.kind].radius;
          this.grabbed.x = PIVOT_X + Math.sin(this.angle) * (this.length + r * 0.8);
          this.grabbed.y = PIVOT_Y + Math.cos(this.angle) * (this.length + r * 0.8);
        }
        if (this.length <= MIN_LENGTH) {
          this.length = MIN_LENGTH;
          this.phase = 'swing';
          const e = this.grabbed;
          this.grabbed = null;
          return e;
        }
        return null;
      }
    }
  }
}
