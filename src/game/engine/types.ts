// Pluggable game-module contract. A game is a self-contained factory that the
// GameHost mounts onto a canvas. Adding a new game = implement GameModule and
// register it — the hub shell, leaderboard and capture services don't change.

export interface GameContext {
  canvas: HTMLCanvasElement;
  /** Logical play area size in CSS pixels (portrait, mobile-first). */
  width: number;
  height: number;
  devicePixelRatio: number;
  /** Optional target to beat (head-to-head challenge links). */
  targetScore?: number | null;
  /** Called continuously so the host can render live height/tier UI. */
  onScore: (height: number) => void;
  /** Called once when the run ends. duration is ms of active play. */
  onGameOver: (result: { height: number; durationMs: number }) => void;
  /** Called when the player passes the challenge target (for celebratory UI). */
  onTargetBeaten?: () => void;
}

export interface GameInstance {
  /** Begin a run. */
  start(): void;
  /** Pause/resume (e.g. tab blur). */
  pause(): void;
  resume(): void;
  /** Tear down listeners + animation frames. */
  destroy(): void;
}

export interface GameModule {
  id: string; // stable id used by anti-cheat rules + leaderboards
  title: string;
  tagline: string;
  /** One run target length, for copy ("a run is 30–90s"). */
  create(ctx: GameContext): GameInstance;
}
