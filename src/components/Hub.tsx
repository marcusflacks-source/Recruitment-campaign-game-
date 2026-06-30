"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GameHost from "@/game/GameHost";
import Leaderboard from "@/components/Leaderboard";
import LeadForm from "@/components/LeadForm";
import ShareRow from "@/components/ShareRow";
import { GAMES, DEFAULT_GAME_ID } from "@/game/registry";
import { tierForHeight } from "@/lib/tiers";
import { gameOverQuip } from "@/lib/voice";
import { emit } from "@/lib/analytics";
import { BRAND } from "@/lib/brand";
import type { SegmentKey } from "@/lib/segments";

type Screen = "home" | "playing" | "result";

interface VerifiedResult {
  height: number;
  tierKey: string;
  tierTitle: string;
  receipt: string | null; // null when the run couldn't be verified
}

interface SavedInfo {
  displayName: string;
  segment: SegmentKey;
  office: string | null;
}

export default function Hub({
  challengeTarget,
  challengeBy,
  code,
}: {
  challengeTarget?: number | null;
  challengeBy?: string | null;
  code?: string | null;
}) {
  const game = GAMES.find((g) => g.id === DEFAULT_GAME_ID)!;

  const [screen, setScreen] = useState<Screen>("home");
  const [runId, setRunId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifiedResult | null>(null);
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  const [boardRefresh, setBoardRefresh] = useState(0);

  const tokenRef = useRef<string | null>(null);
  const segmentRef = useRef<SegmentKey | null>(null);
  const sourceCodeRef = useRef<string | null>(code ?? null);

  // Persist segment + source code so returning players keep their tag + link.
  useEffect(() => {
    try {
      const seg = localStorage.getItem("bh_segment") as SegmentKey | null;
      if (seg) segmentRef.current = seg;
      if (code) {
        localStorage.setItem("bh_code", code);
        sourceCodeRef.current = code;
      } else {
        const stored = localStorage.getItem("bh_code");
        if (stored) sourceCodeRef.current = stored;
      }
    } catch {
      /* private mode */
    }
  }, [code]);

  const analyticsBase = useCallback(
    () => ({ game: game.id, segment: segmentRef.current }),
    [game.id],
  );

  const startPlay = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: game.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) throw new Error("session_failed");
      tokenRef.current = data.token;
      setResult(null);
      setSaved(null);
      setRunId((n) => n + 1);
      setScreen("playing");
      emit("play_start", {
        ...analyticsBase(),
        meta: { challenge: challengeTarget ?? null },
      });
    } catch {
      alert("Couldn’t start a game. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, game.id, analyticsBase, challengeTarget]);

  const handleGameOver = useCallback(
    async (r: { height: number; durationMs: number }) => {
      emit("play_end", { ...analyticsBase(), score: r.height });
      const token = tokenRef.current;
      const tier = tierForHeight(r.height);
      if (!token) {
        setResult({ height: r.height, tierKey: tier.key, tierTitle: tier.title, receipt: null });
        setScreen("result");
        return;
      }
      try {
        const res = await fetch("/api/score", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token,
            game: game.id,
            score: r.height,
            durationMs: r.durationMs,
          }),
        });
        const data = await res.json();
        if (res.ok && data.verified) {
          setResult({
            height: data.height,
            tierKey: data.tier.key,
            tierTitle: data.tier.title,
            receipt: data.receipt,
          });
        } else {
          // Verification failed — show the run but don't allow a save.
          setResult({ height: r.height, tierKey: tier.key, tierTitle: tier.title, receipt: null });
        }
      } catch {
        setResult({ height: r.height, tierKey: tier.key, tierTitle: tier.title, receipt: null });
      } finally {
        tokenRef.current = null;
        setScreen("result");
      }
    },
    [analyticsBase, game.id],
  );

  const handleSaved = useCallback(
    (info: SavedInfo & { crmDelivered: boolean }) => {
      segmentRef.current = info.segment;
      try {
        localStorage.setItem("bh_segment", info.segment);
      } catch {
        /* ignore */
      }
      setSaved({ displayName: info.displayName, segment: info.segment, office: info.office });
      setBoardRefresh((n) => n + 1);
      const base = { game: game.id, segment: info.segment };
      emit("score_saved", { ...base, score: result?.height });
      emit("lead_captured", {
        ...base,
        meta: { office: info.office, crmDelivered: info.crmDelivered },
      });
    },
    [game.id, result?.height],
  );

  // ── Screens ────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 pb-8 pt-5">
      <Header />

      {challengeTarget && screen === "home" && (
        <div className="mb-3 animate-rise rounded-xl bg-denim px-4 py-3 text-sm text-white">
          <span className="font-semibold">{challengeBy || "A betterhomes broker"}</span>{" "}
          challenged you to beat{" "}
          <span className="font-semibold">{challengeTarget} m</span>. Can you climb higher?
        </div>
      )}

      {screen === "home" && (
        <HomeScreen onPlay={startPlay} busy={busy} board={
          <Leaderboard game={game.id} refreshKey={boardRefresh} highlightName={saved?.displayName} />
        } />
      )}

      {screen === "playing" && (
        <section className="animate-rise flex flex-1 flex-col">
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-slate shadow-card">
            <GameHost
              key={runId}
              module={game}
              targetScore={challengeTarget ?? null}
              onScore={() => {}}
              onGameOver={handleGameOver}
            />
          </div>
          <p className="mt-3 text-center text-sm text-slate/60">
            Tap anywhere to smash up through the gap. Miss the concrete.
          </p>
        </section>
      )}

      {screen === "result" && result && (
        <ResultScreen
          result={result}
          saved={saved}
          sourceCode={sourceCodeRef.current}
          challengeBy={challengeBy}
          onSaved={handleSaved}
          onPlayAgain={startPlay}
          board={
            <Leaderboard
              game={game.id}
              refreshKey={boardRefresh}
              highlightName={saved?.displayName}
            />
          }
          onShareEmit={(channel) =>
            emit("share_clicked", {
              game: game.id,
              segment: segmentRef.current,
              meta: { channel, height: result.height },
            })
          }
        />
      )}

      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="mb-4 text-center">
      <p className="text-xs font-semibold tracking-[0.2em] text-powder">
        {BRAND.name} careers
      </p>
      <h1 className="font-head text-3xl text-slate">Break the ceiling</h1>
      <p className="mt-1 text-sm text-denim">{BRAND.campaign}</p>
    </header>
  );
}

function HomeScreen({
  onPlay,
  busy,
  board,
}: {
  onPlay: () => void;
  busy: boolean;
  board: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="animate-rise rounded-2xl bg-gradient-to-b from-slate to-denim p-6 text-center text-mist shadow-card">
        <p className="mx-auto max-w-xs text-sm text-powder">
          Every ceiling you smash is a promotion. New broker to Director — see how
          high your career can climb in one run.
        </p>
        <div className="mt-5">
          <button onClick={onPlay} disabled={busy} className="cta-diamond text-base">
            {busy ? "Loading…" : "Play now"}
          </button>
        </div>
        <p className="mt-3 text-xs text-powder/70">No sign-up to play. 30–90 seconds.</p>
      </div>
      {board}
    </div>
  );
}

function ResultScreen({
  result,
  saved,
  sourceCode,
  challengeBy,
  onSaved,
  onPlayAgain,
  onShareEmit,
  board,
}: {
  result: VerifiedResult;
  saved: SavedInfo | null;
  sourceCode: string | null;
  challengeBy?: string | null;
  onSaved: (i: SavedInfo & { crmDelivered: boolean }) => void;
  onPlayAgain: () => void;
  onShareEmit: (channel: string) => void;
  board: React.ReactNode;
}) {
  const tier = tierForHeight(result.height);
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="animate-rise rounded-2xl bg-white p-6 text-center shadow-card">
        <p className="text-sm text-slate/60">You climbed to</p>
        <p className="font-head text-6xl text-slate">
          {result.height}
          <span className="ml-1 text-2xl text-sand">m</span>
        </p>
        <span
          className="mt-2 inline-block rounded-full px-4 py-1 text-sm font-semibold text-white"
          style={{ background: tier.color }}
        >
          {result.tierTitle}
        </span>
        <p className="mt-1 text-xs text-denim">{tier.earnings}</p>

        <p className="mx-auto mt-3 max-w-xs text-sm italic text-slate/70">
          {gameOverQuip(result.height, result.tierKey)}
        </p>

        {saved ? (
          <div className="mt-5">
            <p className="rounded-xl bg-mist px-4 py-3 text-sm text-slate">
              Saved. You&rsquo;re on the weekly board as{" "}
              <span className="font-semibold">{saved.displayName}</span>.
            </p>
            <ShareRow
              height={result.height}
              name={saved.displayName}
              sourceCode={sourceCode}
              onShareEmit={onShareEmit}
            />
            <button onClick={onPlayAgain} className="mt-4 text-sm font-semibold text-denim underline">
              Play again
            </button>
          </div>
        ) : result.receipt ? (
          <div className="mt-5">
            <LeadForm receipt={result.receipt} sourceCode={sourceCode} onSaved={onSaved} />
            <button onClick={onPlayAgain} className="mt-3 text-sm font-semibold text-denim underline">
              Skip and play again
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <p className="rounded-xl bg-mist px-4 py-3 text-sm text-slate/70">
              We couldn&rsquo;t verify that run. Play another quick game to save your score.
            </p>
            <button onClick={onPlayAgain} className="cta-diamond mt-4">
              Play again
            </button>
          </div>
        )}
      </div>
      {board}
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-6 text-center text-xs text-slate/40">
      <p>
        {BRAND.name} — {BRAND.campaign}{" "}
        <a href="/careers/play/privacy" className="underline hover:text-denim">
          Privacy &amp; data
        </a>
      </p>
    </footer>
  );
}
