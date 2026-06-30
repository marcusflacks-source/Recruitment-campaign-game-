import type { GameContext, GameInstance, GameModule } from "@/game/engine/types";
import { CAREER_TIERS, tierForHeight } from "@/lib/tiers";
import { BRAND } from "@/lib/brand";

// ─────────────────────────────────────────────────────────────────────────────
// "Break the ceiling" — endless vertical climber.
//
// Loop: the broker auto-oscillates left↔right beneath the next concrete ceiling.
// Each ceiling has a single weak point (the gap). Tap to SMASH upward — if the
// broker is aligned with the gap, the ceiling shatters, you rise a level and
// your career tier climbs. Miss, and you bonk solid concrete: the run ends.
//
// One control (tap / click / space). Simple to learn, hard to master: the gap
// narrows and the oscillation quickens the higher you climb. One run ≈ 30–90s.
// ─────────────────────────────────────────────────────────────────────────────

const HEIGHT_PER_CEILING = 10; // each broken ceiling adds this to the score

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Ceiling {
  gapX: number; // left edge of the weak point
  gapW: number; // width of the weak point
}

class BreakTheCeiling implements GameInstance {
  private ctx: GameContext;
  private g: CanvasRenderingContext2D;
  private raf = 0;
  private running = false;
  private paused = false;
  private over = false;

  private W: number;
  private H: number;

  // Run state
  private height = 0;
  private broken = 0;
  private startedAt = 0;
  private elapsedActive = 0;
  private lastTs = 0;

  // Broker oscillation
  private avatarX = 0;
  private dir = 1;
  private avatarY: number;
  private readonly avatarSize: number;

  // Current target ceiling
  private ceiling: Ceiling;
  private ceilingY: number;

  // Effects
  private particles: Particle[] = [];
  private shake = 0;
  private flash = 0; // smash flash 0..1
  private climbAnim = 0; // 0..1 transition after a break
  private targetBeaten = false;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    const g = ctx.canvas.getContext("2d");
    if (!g) throw new Error("2D canvas context unavailable");
    this.g = g;
    this.W = ctx.width;
    this.H = ctx.height;
    this.avatarSize = Math.max(26, this.W * 0.09);
    this.avatarY = this.H * 0.68;
    this.ceilingY = this.H * 0.3;
    this.avatarX = this.W / 2;
    this.ceiling = this.makeCeiling(0);
  }

  // ── Difficulty model ──────────────────────────────────────────────────────
  private makeCeiling(height: number): Ceiling {
    const minGap = this.W * 0.16;
    const maxGap = this.W * 0.42;
    // Gap narrows with height; clamps at minGap.
    const gapW = Math.max(minGap, maxGap - height * 0.18);
    const margin = this.W * 0.06;
    const gapX = margin + Math.random() * (this.W - 2 * margin - gapW);
    return { gapX, gapW };
  }

  private oscSpeed(): number {
    // px/sec, rises with height. Capped so it stays humanly readable.
    return Math.min(this.W * 1.7, this.W * 0.55 + this.height * 1.1);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  start(): void {
    this.running = true;
    this.over = false;
    this.height = 0;
    this.broken = 0;
    this.particles = [];
    this.elapsedActive = 0;
    this.startedAt = performance.now();
    this.lastTs = this.startedAt;
    this.ceiling = this.makeCeiling(0);
    this.bindInput();
    this.ctx.onScore(0);
    this.loop(this.startedAt);
  }

  pause(): void {
    this.paused = true;
  }
  resume(): void {
    if (this.over) return;
    this.paused = false;
    this.lastTs = performance.now();
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.unbindInput();
  }

  // ── Input (single control) ────────────────────────────────────────────────
  private onTap = (e: Event) => {
    e.preventDefault();
    this.smash();
  };
  private onKey = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter") {
      e.preventDefault();
      this.smash();
    }
  };
  private bindInput() {
    const c = this.ctx.canvas;
    c.addEventListener("pointerdown", this.onTap, { passive: false });
    window.addEventListener("keydown", this.onKey);
  }
  private unbindInput() {
    this.ctx.canvas.removeEventListener("pointerdown", this.onTap);
    window.removeEventListener("keydown", this.onKey);
  }

  // ── The smash ─────────────────────────────────────────────────────────────
  private smash() {
    if (!this.running || this.over || this.paused || this.climbAnim > 0) return;
    const center = this.avatarX;
    const inGap =
      center > this.ceiling.gapX && center < this.ceiling.gapX + this.ceiling.gapW;

    this.flash = 1;
    this.shake = 8;

    if (inGap) {
      // Break through: rise a level.
      this.broken += 1;
      this.height = this.broken * HEIGHT_PER_CEILING;
      this.spawnDebris(true);
      this.climbAnim = 1; // triggers the rise transition
      this.ctx.onScore(this.height);
      if (
        this.ctx.targetScore &&
        !this.targetBeaten &&
        this.height >= this.ctx.targetScore
      ) {
        this.targetBeaten = true;
        this.ctx.onTargetBeaten?.();
      }
    } else {
      // Bonked concrete: game over.
      this.spawnDebris(false);
      this.endRun();
    }
  }

  private endRun() {
    if (this.over) return;
    this.over = true;
    this.running = false;
    this.shake = 16;
    const durationMs = Math.round(this.elapsedActive);
    // Let the final frame paint, then report.
    setTimeout(() => {
      this.ctx.onGameOver({ height: this.height, durationMs });
    }, 250);
  }

  private spawnDebris(success: boolean) {
    const count = success ? 22 : 30;
    const palette = success
      ? [BRAND.palette.powder, BRAND.palette.sand, BRAND.palette.mist]
      : [BRAND.palette.denim, BRAND.palette.slate, BRAND.palette.powder];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: this.avatarX,
        y: this.ceilingY,
        vx: (Math.random() - 0.5) * 320,
        vy: (Math.random() - 0.9) * 280,
        life: 0.6 + Math.random() * 0.5,
        color: palette[(Math.random() * palette.length) | 0],
        size: 3 + Math.random() * 6,
      });
    }
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  private loop = (ts: number) => {
    if (!this.running && !this.over) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    if (this.paused) return;
    if (!this.over) this.elapsedActive += dt * 1000;
    this.update(dt);
    this.render();
  };

  private update(dt: number) {
    // Oscillate the broker.
    if (!this.over && this.climbAnim === 0) {
      const speed = this.oscSpeed();
      this.avatarX += this.dir * speed * dt;
      const margin = this.avatarSize * 0.5;
      if (this.avatarX > this.W - margin) {
        this.avatarX = this.W - margin;
        this.dir = -1;
      } else if (this.avatarX < margin) {
        this.avatarX = margin;
        this.dir = 1;
      }
    }

    // Rise transition after a successful break.
    if (this.climbAnim > 0) {
      this.climbAnim = Math.max(0, this.climbAnim - dt * 3.2);
      if (this.climbAnim === 0) {
        // New ceiling for the next level.
        this.ceiling = this.makeCeiling(this.height);
      }
    }

    // Particles
    for (const p of this.particles) {
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    this.flash = Math.max(0, this.flash - dt * 4);
    this.shake = Math.max(0, this.shake - dt * 40);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  private render() {
    const g = this.g;
    const W = this.W;
    const H = this.H;
    g.save();
    if (this.shake > 0) {
      g.translate(
        (Math.random() - 0.5) * this.shake,
        (Math.random() - 0.5) * this.shake,
      );
    }

    // Background: slate gradient, brighter the higher you are.
    const tier = tierForHeight(this.height);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#16252e");
    grad.addColorStop(1, BRAND.palette.slate);
    g.fillStyle = grad;
    g.fillRect(-20, -20, W + 40, H + 40);

    // Faint guide rails.
    g.strokeStyle = "rgba(123,160,178,0.15)";
    g.lineWidth = 2;
    const rail = W * 0.06;
    g.beginPath();
    g.moveTo(rail, 0);
    g.lineTo(rail, H);
    g.moveTo(W - rail, 0);
    g.lineTo(W - rail, H);
    g.stroke();

    // The next ceiling (concrete slab with a glowing gap), lifting away during climb.
    const lift = this.climbAnim * (this.ceilingY + 40);
    this.drawCeiling(g, this.ceilingY - lift, 1 - this.climbAnim * 0.6);

    // The broker avatar.
    this.drawAvatar(g, tier.color);

    // Particles.
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
      g.fillStyle = p.color;
      g.fillRect(p.x, p.y, p.size, p.size);
    }
    g.globalAlpha = 1;

    // Smash flash.
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,120,122,${this.flash * 0.25})`;
      g.fillRect(-20, -20, W + 40, H + 40);
    }

    g.restore();

    // HUD (drawn unshaken).
    this.drawHud(g);
  }

  private drawCeiling(g: CanvasRenderingContext2D, y: number, alpha: number) {
    const W = this.W;
    const thickness = Math.max(34, this.H * 0.06);
    g.globalAlpha = alpha;
    // Slab
    g.fillStyle = BRAND.palette.denim;
    g.fillRect(0, y - thickness / 2, this.ceiling.gapX, thickness);
    g.fillRect(
      this.ceiling.gapX + this.ceiling.gapW,
      y - thickness / 2,
      W - (this.ceiling.gapX + this.ceiling.gapW),
      thickness,
    );
    // Slab texture line
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(0, y - thickness / 2, this.ceiling.gapX, 4);
    g.fillRect(
      this.ceiling.gapX + this.ceiling.gapW,
      y - thickness / 2,
      W - (this.ceiling.gapX + this.ceiling.gapW),
      4,
    );
    // Glowing weak point (salmon — the thing to aim for).
    g.fillStyle = "rgba(255,120,122,0.18)";
    g.fillRect(this.ceiling.gapX, y - thickness / 2, this.ceiling.gapW, thickness);
    g.strokeStyle = BRAND.palette.salmon;
    g.lineWidth = 3;
    g.strokeRect(
      this.ceiling.gapX + 1.5,
      y - thickness / 2 + 1.5,
      this.ceiling.gapW - 3,
      thickness - 3,
    );
    g.globalAlpha = 1;
  }

  private drawAvatar(g: CanvasRenderingContext2D, accent: string) {
    const s = this.avatarSize;
    const x = this.avatarX;
    const y = this.avatarY - this.climbAnim * 30;
    // Body (rounded square)
    g.fillStyle = BRAND.palette.mist;
    roundRect(g, x - s / 2, y - s / 2, s, s, s * 0.22);
    g.fill();
    // Accent helmet bar in the current tier colour.
    g.fillStyle = accent;
    roundRect(g, x - s / 2, y - s / 2, s, s * 0.28, s * 0.18);
    g.fill();
    // Upward aim indicator.
    g.fillStyle = "rgba(255,120,122,0.9)";
    g.beginPath();
    g.moveTo(x, y - s * 0.78);
    g.lineTo(x - s * 0.18, y - s * 0.52);
    g.lineTo(x + s * 0.18, y - s * 0.52);
    g.closePath();
    g.fill();
  }

  private drawHud(g: CanvasRenderingContext2D) {
    const W = this.W;
    const tier = tierForHeight(this.height);
    const tierIndex = CAREER_TIERS.findIndex((t) => t.key === tier.key);

    // Height (score), top-left.
    g.fillStyle = BRAND.palette.mist;
    g.font = `600 ${Math.round(W * 0.075)}px "Ivy Epic", "Segoe UI", sans-serif`;
    g.textBaseline = "top";
    g.textAlign = "left";
    g.fillText(`${this.height} m`, 16, 14);

    g.font = `500 ${Math.round(W * 0.034)}px "Ivy Epic", "Segoe UI", sans-serif`;
    g.fillStyle = BRAND.palette.powder;
    g.fillText("height", 18, 14 + W * 0.082);

    // Tier banner + rising earnings indicator, top-right.
    g.textAlign = "right";
    g.fillStyle = tier.color;
    g.font = `600 ${Math.round(W * 0.05)}px "Ivy Epic", "Segoe UI", sans-serif`;
    g.fillText(tier.title, W - 16, 16);
    g.fillStyle = BRAND.palette.powder;
    g.font = `500 ${Math.round(W * 0.032)}px "Ivy Epic", "Segoe UI", sans-serif`;
    g.fillText(tier.earnings, W - 16, 16 + W * 0.058);

    // Career ladder pips.
    const pipY = 16 + W * 0.1;
    const pipR = W * 0.012;
    for (let i = 0; i < CAREER_TIERS.length; i++) {
      g.beginPath();
      g.arc(W - 16 - i * (pipR * 3), pipY, pipR, 0, Math.PI * 2);
      g.fillStyle = i <= tierIndex ? CAREER_TIERS[i].color : "rgba(255,255,255,0.2)";
      g.fill();
    }

    // Challenge target marker.
    if (this.ctx.targetScore) {
      g.textAlign = "center";
      g.fillStyle = this.targetBeaten ? BRAND.palette.salmon : BRAND.palette.sand;
      g.font = `600 ${Math.round(W * 0.036)}px "Ivy Epic", "Segoe UI", sans-serif`;
      g.fillText(
        this.targetBeaten
          ? "target beaten — keep climbing"
          : `beat ${this.ctx.targetScore} m`,
        W / 2,
        14,
      );
    }
  }
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export const breakTheCeiling: GameModule = {
  id: "break-the-ceiling",
  title: "Break the ceiling",
  tagline: "Smash upward. Every ceiling is a promotion.",
  create(ctx: GameContext): GameInstance {
    return new BreakTheCeiling(ctx);
  },
};
