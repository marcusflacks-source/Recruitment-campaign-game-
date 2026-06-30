import type { GameContext, GameInstance, GameModule } from "@/game/engine/types";
import { CAREER_TIERS, tierForHeight } from "@/lib/tiers";
import { BRAND } from "@/lib/brand";
import { tierUpQuip, milestoneCrossed } from "@/lib/voice";

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

type ParticleKind = "chunk" | "dust" | "spark";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  rot: number;
  vr: number;
  drag: number;
  kind: ParticleKind;
}

interface Shock {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  color: string;
}

interface Ceiling {
  gapX: number; // left edge of the weak point
  gapW: number; // width of the weak point
  drift: number; // horizontal drift speed (px/s) — the gap moves at higher tiers
  dir: number; // drift direction
  minX: number;
  maxX: number;
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
  private shocks: Shock[] = [];
  private trail: { x: number; y: number }[] = [];
  private combo = 0; // consecutive clean breaks — intensifies juice
  private t = 0; // animation clock (seconds)
  private shake = 0;
  private flash = 0; // smash flash 0..1
  private climbAnim = 0; // 0..1 transition after a break
  private targetBeaten = false;

  // Witty in-run callouts (tier-ups + career milestones).
  private toast: { text: string; sub?: string; life: number } | null = null;

  // Deterministic cloud seeds for the rising-skyline backdrop.
  private readonly cloudSeeds = [
    { x: 0.2, y: 0.1, s: 0.22, par: 2.2 },
    { x: 0.66, y: 0.42, s: 0.3, par: 1.6 },
    { x: 0.44, y: 0.76, s: 0.18, par: 2.9 },
  ];

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
    const minX = margin;
    const maxX = this.W - margin - gapW;
    const gapX = minX + Math.random() * (maxX - minX);
    // Above ~200m the weak point starts to drift — a moving target to master.
    const drift = height > 200 ? Math.min(this.W * 0.55, (height - 200) * 0.6) : 0;
    return { gapX, gapW, drift, dir: Math.random() < 0.5 ? -1 : 1, minX, maxX };
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
    this.shocks = [];
    this.trail = [];
    this.combo = 0;
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

    if (inGap) {
      // Break through: rise a level. Combo intensifies the juice.
      this.combo += 1;
      this.flash = Math.min(1, 0.7 + this.combo * 0.06);
      this.shake = 9 + Math.min(8, this.combo);
      this.broken += 1;
      const prevHeight = this.height;
      this.height = this.broken * HEIGHT_PER_CEILING;

      // Voice: a tier-up trumps a milestone; otherwise surface the milestone.
      const prevTierKey = tierForHeight(prevHeight).key;
      const newTier = tierForHeight(this.height);
      if (newTier.key !== prevTierKey) {
        this.toast = { text: newTier.title, sub: tierUpQuip(newTier.key), life: 2.3 };
      } else {
        const ms = milestoneCrossed(prevHeight, this.height);
        if (ms) this.toast = { text: ms.label, life: 1.8 };
      }

      this.spawnDebris(true);
      this.spawnShock(this.avatarX, this.ceilingY, BRAND.palette.salmon);
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
      this.combo = 0;
      this.flash = 1;
      this.shake = 14;
      this.spawnDebris(false);
      this.spawnShock(this.avatarX, this.ceilingY, BRAND.palette.powder);
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

  private spawnShock(x: number, y: number, color: string) {
    this.shocks.push({ x, y, r: this.avatarSize * 0.4, life: 0.5, max: 0.5, color });
  }

  // A layered burst: heavy concrete chunks (tumbling), a soft dust cloud, and a
  // few bright sparks. Scales up with the combo for escalating spectacle.
  private spawnDebris(success: boolean) {
    const x = this.avatarX;
    const y = this.ceilingY;
    const boost = success ? Math.min(1.8, 1 + this.combo * 0.12) : 1.3;
    const chunkCols = success
      ? [BRAND.palette.denim, BRAND.palette.powder, "#34607f"]
      : [BRAND.palette.denim, BRAND.palette.slate, "#243b48"];

    // Concrete chunks — angular, tumbling, gravity-bound.
    const chunks = Math.round((success ? 16 : 22) * boost);
    for (let i = 0; i < chunks; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const sp = (160 + Math.random() * 320) * boost;
      this.particles.push({
        x: x + (Math.random() - 0.5) * this.ceiling.gapW * 0.6,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 60,
        life: 0.7 + Math.random() * 0.6,
        max: 1.3,
        color: chunkCols[(Math.random() * chunkCols.length) | 0],
        size: 4 + Math.random() * 9,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 14,
        drag: 0.0,
        kind: "chunk",
      });
    }

    // Dust cloud — soft, slow, grows and fades.
    const dust = Math.round(14 * boost);
    for (let i = 0; i < dust; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * this.ceiling.gapW,
        y: y + (Math.random() - 0.5) * 14,
        vx: (Math.random() - 0.5) * 120,
        vy: -20 - Math.random() * 80,
        life: 0.6 + Math.random() * 0.6,
        max: 1.2,
        color: success ? "#cdb9a6" : "#9fb3bd",
        size: 14 + Math.random() * 22,
        rot: 0,
        vr: 0,
        drag: 2.2,
        kind: "dust",
      });
    }

    // Sparks — only on a successful break; bright salmon, fast, short-lived.
    if (success) {
      const sparks = Math.round(10 * boost);
      for (let i = 0; i < sparks; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        const sp = 320 + Math.random() * 420;
        this.particles.push({
          x,
          y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 0.25 + Math.random() * 0.3,
          max: 0.55,
          color: BRAND.palette.salmon,
          size: 2 + Math.random() * 2.5,
          rot: 0,
          vr: 0,
          drag: 0.4,
          kind: "spark",
        });
      }
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
    this.t += dt;

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

      // Drift the weak point sideways at higher tiers (a moving target).
      if (this.ceiling.drift > 0) {
        this.ceiling.gapX += this.ceiling.dir * this.ceiling.drift * dt;
        if (this.ceiling.gapX < this.ceiling.minX) {
          this.ceiling.gapX = this.ceiling.minX;
          this.ceiling.dir = 1;
        } else if (this.ceiling.gapX > this.ceiling.maxX) {
          this.ceiling.gapX = this.ceiling.maxX;
          this.ceiling.dir = -1;
        }
      }

      // Record the broker's recent path for a motion trail.
      this.trail.push({ x: this.avatarX, y: this.avatarY });
      if (this.trail.length > 10) this.trail.shift();
    }

    // Rise transition after a successful break.
    if (this.climbAnim > 0) {
      this.climbAnim = Math.max(0, this.climbAnim - dt * 3.2);
      if (this.climbAnim === 0) {
        // New ceiling for the next level.
        this.ceiling = this.makeCeiling(this.height);
      }
    }

    // Particles — physics varies by kind.
    for (const p of this.particles) {
      if (p.kind === "chunk") {
        p.vy += 1300 * dt;
        p.rot += p.vr * dt;
      } else if (p.kind === "dust") {
        p.vy += 90 * dt;
        p.size += 26 * dt; // billow outward
      } else {
        p.vy += 240 * dt; // spark
      }
      if (p.drag > 0) {
        const f = Math.max(0, 1 - p.drag * dt);
        p.vx *= f;
        p.vy *= f;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // Shockwave rings.
    for (const s of this.shocks) {
      s.life -= dt;
      s.r += (this.W * 1.6) * dt;
    }
    this.shocks = this.shocks.filter((s) => s.life > 0);

    this.flash = Math.max(0, this.flash - dt * 4);
    this.shake = Math.max(0, this.shake - dt * 40);
    if (this.toast) {
      this.toast.life -= dt;
      if (this.toast.life <= 0) this.toast = null;
    }
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

    // Background: the Dubai skyline you climb — sky brightens, the city sinks
    // below you and clouds take over as your career rises.
    const tier = tierForHeight(this.height);
    this.drawSky(g, this.height);

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

    // The next ceiling (concrete slab + animated targeting reticle), lifting away
    // during the climb transition.
    const lift = this.climbAnim * (this.ceilingY + 40);
    const ceilY = this.ceilingY - lift;
    this.drawCeiling(g, ceilY, 1 - this.climbAnim * 0.6);

    // Lock-on beam when the broker is aligned with the gap — telegraphs "now".
    const aligned =
      !this.over &&
      this.climbAnim === 0 &&
      this.avatarX > this.ceiling.gapX &&
      this.avatarX < this.ceiling.gapX + this.ceiling.gapW;
    if (aligned) {
      const beamW = this.avatarSize * 0.55;
      const grad = g.createLinearGradient(0, ceilY, 0, this.avatarY);
      grad.addColorStop(0, "rgba(255,120,122,0.4)");
      grad.addColorStop(1, "rgba(255,120,122,0)");
      g.fillStyle = grad;
      g.fillRect(this.avatarX - beamW / 2, ceilY, beamW, this.avatarY - ceilY);
    }

    // Shockwave rings.
    for (const s of this.shocks) {
      const k = s.life / s.max;
      g.globalAlpha = k * 0.5;
      g.strokeStyle = s.color;
      g.lineWidth = 3 + 4 * k;
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;

    // Broker motion trail (afterimages).
    for (let i = 0; i < this.trail.length; i++) {
      const tp = this.trail[i];
      const k = i / this.trail.length;
      g.globalAlpha = k * 0.22;
      g.fillStyle = BRAND.palette.powder;
      const ts = this.avatarSize * (0.4 + k * 0.4);
      roundRect(g, tp.x - ts / 2, tp.y - ts / 2, ts, ts, ts * 0.25);
      g.fill();
    }
    g.globalAlpha = 1;

    // The broker avatar.
    this.drawAvatar(g, tier.color, aligned);

    // Particles — dust (soft), sparks (bright), concrete chunks (tumbling).
    for (const p of this.particles) {
      const k = Math.max(0, Math.min(1, p.life / p.max));
      if (p.kind === "dust") {
        g.globalAlpha = k * 0.26;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === "spark") {
        g.globalAlpha = Math.min(1, k * 2);
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      } else {
        g.globalAlpha = Math.min(1, k * 1.6);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.82);
        g.restore();
      }
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
    const thickness = Math.max(42, this.H * 0.07);
    const gx = this.ceiling.gapX;
    const gw = this.ceiling.gapW;
    const top = y - thickness / 2;
    const bot = y + thickness / 2;
    g.save();
    g.globalAlpha = alpha;

    // ── Concrete slab segments (left + right of the gap) ──
    const drawSlab = (x0: number, x1: number) => {
      const w = x1 - x0;
      if (w <= 0) return;
      const grad = g.createLinearGradient(0, top, 0, bot);
      grad.addColorStop(0, "#3a6086");
      grad.addColorStop(0.5, BRAND.palette.denim);
      grad.addColorStop(1, "#1b3750");
      g.fillStyle = grad;
      g.fillRect(x0, top, w, thickness);
      g.fillStyle = "rgba(255,255,255,0.12)"; // lit top edge
      g.fillRect(x0, top, w, 3);
      g.fillStyle = "rgba(0,0,0,0.30)"; // shadowed underside
      g.fillRect(x0, bot - 5, w, 5);
      // concrete speckle (deterministic so it doesn't crawl)
      g.fillStyle = "rgba(0,0,0,0.16)";
      const dots = Math.floor(w / 13);
      for (let i = 0; i < dots; i++) {
        const hx = x0 + hash(i * 1.7 + x0) * w;
        const hy = top + 6 + hash(i * 3.1 + x0) * (thickness - 12);
        g.fillRect(hx, hy, 2, 2);
      }
    };
    drawSlab(0, gx);
    drawSlab(gx + gw, W);

    // ── Stress cracks radiating from the gap edges ──
    g.strokeStyle = "rgba(0,0,0,0.28)";
    g.lineWidth = 1.5;
    const crack = (ox: number, sign: number) => {
      for (let c = 0; c < 3; c++) {
        let cx = ox;
        let cy = top + thickness * (0.25 + c * 0.25);
        g.beginPath();
        g.moveTo(cx, cy);
        for (let s = 0; s < 3; s++) {
          cx += sign * (6 + hash(c * 7 + s + ox) * 16);
          cy += (hash(c * 5 + s + ox) - 0.5) * 12;
          g.lineTo(cx, cy);
        }
        g.stroke();
      }
    };
    crack(gx, -1);
    crack(gx + gw, 1);

    // ── Targeting reticle (the weak point to smash through) ──
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    const glow = g.createLinearGradient(0, top, 0, bot);
    glow.addColorStop(0, `rgba(255,120,122,${0.1 + 0.1 * pulse})`);
    glow.addColorStop(0.5, `rgba(255,120,122,${0.3 + 0.18 * pulse})`);
    glow.addColorStop(1, `rgba(255,120,122,${0.1 + 0.1 * pulse})`);
    g.fillStyle = glow;
    g.fillRect(gx, top, gw, thickness);

    // Rising chevrons: "smash up here".
    const cw = gw * 0.32;
    const cxc = gx + gw / 2;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = Math.max(2.5, gw * 0.022);
    for (let i = 0; i < 2; i++) {
      const phase = (this.t * 1.4 + i * 0.5) % 1;
      const cy = bot - phase * thickness;
      g.globalAlpha = alpha * Math.sin(phase * Math.PI) * 0.95;
      g.beginPath();
      g.moveTo(cxc - cw / 2, cy + cw * 0.32);
      g.lineTo(cxc, cy - cw * 0.12);
      g.lineTo(cxc + cw / 2, cy + cw * 0.32);
      g.stroke();
    }
    g.globalAlpha = alpha;

    // Reticle corner brackets framing the gap.
    g.strokeStyle = BRAND.palette.salmon;
    g.lineWidth = 3;
    const bl = Math.min(gw, thickness) * 0.32;
    const corners: [number, number, number, number][] = [
      [gx, top, 1, 1],
      [gx + gw, top, -1, 1],
      [gx, bot, 1, -1],
      [gx + gw, bot, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      g.beginPath();
      g.moveTo(cx + sx * bl, cy);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + sy * bl);
      g.stroke();
    }

    // Shine sweeping across the portal.
    const sweep = (this.t * 0.5) % 1;
    const ssx = gx + sweep * gw;
    const shine = g.createLinearGradient(ssx - gw * 0.16, 0, ssx + gw * 0.16, 0);
    shine.addColorStop(0, "rgba(255,255,255,0)");
    shine.addColorStop(0.5, "rgba(255,255,255,0.22)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = shine;
    g.fillRect(gx, top, gw, thickness);

    g.restore();
  }

  private drawAvatar(g: CanvasRenderingContext2D, accent: string, aligned: boolean) {
    const s = this.avatarSize;
    const x = this.avatarX;
    const y = this.avatarY - this.climbAnim * 30;
    // Aligned glow — the broker is locked onto the gap.
    if (aligned) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 11);
      g.globalAlpha = 0.35 + 0.4 * pulse;
      g.fillStyle = BRAND.palette.salmon;
      g.beginPath();
      g.arc(x, y, s * 0.92, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
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

    // Combo streak, beside the height once you string clean breaks together.
    if (this.combo >= 3) {
      g.font = `600 ${Math.round(W * 0.075)}px "Ivy Epic", "Segoe UI", sans-serif`;
      const hw = g.measureText(`${this.height} m`).width;
      g.fillStyle = BRAND.palette.salmon;
      g.font = `700 ${Math.round(W * 0.05)}px "Ivy Epic", "Segoe UI", sans-serif`;
      g.fillText(`×${this.combo}`, 16 + hw + 12, 22);
    }

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

    // Witty tier-up / milestone toast, centred just above the next ceiling.
    if (this.toast) {
      const a = Math.min(1, this.toast.life * 1.6);
      g.globalAlpha = a;
      g.textAlign = "center";
      g.fillStyle = BRAND.palette.mist;
      g.font = `600 ${Math.round(W * 0.052)}px "Ivy Mode", Georgia, serif`;
      g.fillText(this.toast.text, W / 2, this.H * 0.165);
      if (this.toast.sub) {
        g.fillStyle = BRAND.palette.sand;
        g.font = `500 ${Math.round(W * 0.036)}px "Ivy Epic", "Segoe UI", sans-serif`;
        g.fillText(this.toast.sub, W / 2, this.H * 0.165 + W * 0.062);
      }
      g.globalAlpha = 1;
    }
  }

  // ── Rising skyline backdrop ─────────────────────────────────────────────────
  private drawSky(g: CanvasRenderingContext2D, height: number) {
    const W = this.W;
    const H = this.H;
    const t = Math.min(1, height / 1600); // altitude 0..1
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, lerpColor("#16252e", "#1c3f5e", t));
    grad.addColorStop(1, lerpColor("#1F343F", "#4a7ba0", t));
    g.fillStyle = grad;
    g.fillRect(-20, -20, W + 40, H + 40);

    this.drawCity(g, height, 0); // far district
    this.drawCity(g, height, 1); // near district
    this.drawBurj(g, height); // the landmark, rising above the skyline
    this.drawClouds(g, height, t);
  }

  // The Burj Khalifa on the horizon — a distant, towering landmark that sinks
  // slowly and fades as you ascend past it into the clouds.
  private drawBurj(g: CanvasRenderingContext2D, height: number) {
    const W = this.W;
    const H = this.H;
    const fade = Math.min(1, height / 1500);
    const alpha = 0.5 * (1 - 0.85 * fade);
    if (alpha <= 0.02) return;

    const cx = W * 0.64;
    // Anchored so the spire sits near the top at ground level (the whole tower
    // is visible), then sinks slowly as you climb past it.
    const ground = H * 1.02 + height * 0.3;
    const totalH = H * 0.95;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = "#2c5274";

    // Three tapering tiers (widest at the base) → the Burj's stepped silhouette.
    const tiers = [
      { wTop: W * 0.052, wBot: W * 0.14, h: totalH * 0.44 },
      { wTop: W * 0.03, wBot: W * 0.052, h: totalH * 0.34 },
      { wTop: W * 0.012, wBot: W * 0.03, h: totalH * 0.14 },
    ];
    let yb = ground;
    for (const tr of tiers) {
      const yt = yb - tr.h;
      g.beginPath();
      g.moveTo(cx - tr.wBot / 2, yb);
      g.lineTo(cx - tr.wTop / 2, yt);
      g.lineTo(cx + tr.wTop / 2, yt);
      g.lineTo(cx + tr.wBot / 2, yb);
      g.closePath();
      g.fill();
      // faint vertical fins for the tower's ribbed facade
      g.strokeStyle = "rgba(255,255,255,0.05)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx, yb);
      g.lineTo(cx, yt);
      g.stroke();
      yb = yt;
    }

    // The spire.
    const spireH = totalH * 0.1;
    g.strokeStyle = "#2c5274";
    g.lineWidth = Math.max(2, W * 0.006);
    g.beginPath();
    g.moveTo(cx, yb);
    g.lineTo(cx, yb - spireH);
    g.stroke();

    // Blinking aviation light at the tip.
    g.globalAlpha = alpha * (0.55 + 0.45 * Math.sin(this.t * 3));
    g.fillStyle = BRAND.palette.sand;
    g.beginPath();
    g.arc(cx, yb - spireH, Math.max(2, W * 0.009), 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // A parallax band of tower silhouettes that sinks as you climb, then fades
  // away once you're above the city. `depth` 0 = far/slow, 1 = near/fast.
  private drawCity(g: CanvasRenderingContext2D, height: number, depth: number) {
    const W = this.W;
    const H = this.H;
    const parallax = depth === 0 ? 2.4 : 4.6;
    const colW = depth === 0 ? W * 0.13 : W * 0.19;
    const maxH = depth === 0 ? H * 0.26 : H * 0.34;
    const tint = depth === 0 ? "#21455e" : "#142028";
    const fade = Math.min(1, height / 1300);
    const alpha = (depth === 0 ? 0.55 : 0.8) * (1 - 0.9 * fade);
    if (alpha <= 0.02) return;

    const span = H * 0.5;
    const baseY = H * 0.5 + ((height * parallax) % span);
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = tint;
    for (let copy = 0; copy < 2; copy++) {
      const by = baseY - copy * span;
      let col = 0;
      for (let x = -colW; x < W + colW; x += colW, col++) {
        const hh = maxH * (0.35 + hash(col + depth * 53) * 0.65);
        const top = by - hh;
        g.fillRect(x + colW * 0.08, top, colW * 0.84, H - top); // fill to bottom
      }
    }
    g.restore();
  }

  private drawClouds(g: CanvasRenderingContext2D, height: number, t: number) {
    const alpha = Math.min(0.55, t * 0.7); // only appear up high
    if (alpha < 0.02) return;
    const span = this.H * 0.7;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = BRAND.palette.mist;
    for (const c of this.cloudSeeds) {
      const y = (c.y * span + height * c.par) % span;
      this.cloudBlob(g, c.x * this.W, y, c.s * this.W);
      this.cloudBlob(g, ((c.x + 0.5) % 1) * this.W, (y + span * 0.5) % span, c.s * this.W * 0.8);
    }
    g.restore();
  }

  private cloudBlob(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
    g.beginPath();
    g.arc(x, y, r * 0.6, 0, Math.PI * 2);
    g.arc(x + r * 0.5, y + r * 0.1, r * 0.45, 0, Math.PI * 2);
    g.arc(x - r * 0.5, y + r * 0.12, r * 0.4, 0, Math.PI * 2);
    g.arc(x + r * 0.1, y - r * 0.2, r * 0.4, 0, Math.PI * 2);
    g.fill();
  }
}

// Deterministic 0..1 hash for procedural building heights (no per-frame jitter).
function hash(i: number): number {
  const s = Math.sin(i * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Interpolate between two hex colours; returns an rgb() string.
function lerpColor(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
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
