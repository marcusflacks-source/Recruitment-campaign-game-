"use client";

import { useEffect, useRef } from "react";
import type { GameInstance, GameModule } from "./engine/types";

interface Props {
  module: GameModule;
  targetScore?: number | null;
  onScore: (height: number) => void;
  onGameOver: (r: { height: number; durationMs: number }) => void;
  onTargetBeaten?: () => void;
}

// Mounts a GameModule onto a responsive, portrait canvas and wires its lifecycle
// to React callbacks. Game-agnostic: any module implementing the contract works.
export default function GameHost({
  module,
  targetScore,
  onScore,
  onGameOver,
  onTargetBeaten,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep latest callbacks without re-creating the game on every render.
  const cbs = useRef({ onScore, onGameOver, onTargetBeaten });
  cbs.current = { onScore, onGameOver, onTargetBeaten };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const rect = wrap.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const g = canvas.getContext("2d");
    if (g) g.scale(dpr, dpr);

    let instance: GameInstance;
    try {
      instance = module.create({
        canvas,
        width,
        height,
        devicePixelRatio: dpr,
        targetScore: targetScore ?? null,
        onScore: (h) => cbs.current.onScore(h),
        onGameOver: (r) => cbs.current.onGameOver(r),
        onTargetBeaten: () => cbs.current.onTargetBeaten?.(),
      });
    } catch (e) {
      console.error("[GameHost] failed to create game:", e);
      return;
    }

    instance.start();

    const onVisibility = () => {
      if (document.hidden) instance.pause();
      else instance.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      instance.destroy();
    };
    // module/targetScore identity is stable per run (GameHost is keyed by runId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} className="relative h-full w-full touch-none select-none">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
