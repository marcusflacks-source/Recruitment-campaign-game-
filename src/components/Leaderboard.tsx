"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardScope } from "@/lib/leaderboard";

interface Entry {
  rank: number;
  displayName: string;
  height: number;
  tier: string;
  office: string | null;
}

const SCOPES: { key: BoardScope; label: string }[] = [
  { key: "weekly", label: "This week" },
  { key: "global", label: "All-time" },
  { key: "office", label: "Office vs office" },
];

function formatCountdown(ms: number): string {
  if (ms <= 0) return "resetting…";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Leaderboard({
  game,
  highlightName,
  refreshKey = 0,
}: {
  game: string;
  highlightName?: string | null;
  refreshKey?: number;
}) {
  const [scope, setScope] = useState<BoardScope>("weekly");
  const [office, setOffice] = useState<string>("");
  const [offices, setOffices] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [resetsInMs, setResetsInMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/offices")
      .then((r) => r.json())
      .then((d) => {
        setOffices(d.offices ?? []);
        if (!office && d.offices?.length) setOffice(d.offices[0]);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (scope === "office" && !office) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ game, scope, limit: "25" });
      if (scope === "office") params.set("office", office);
      const res = await fetch(`/api/leaderboard?${params.toString()}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
      setResetsInMs(data.resetsInMs ?? null);
    } finally {
      setLoading(false);
    }
  }, [game, scope, office]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const highlight = useMemo(
    () => (highlightName ?? "").toLowerCase(),
    [highlightName],
  );

  return (
    <div className="rounded-2xl bg-white/70 p-4 shadow-card backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-head text-xl text-slate">Leaderboard</h2>
        {scope === "weekly" && resetsInMs != null && (
          <span className="text-xs text-denim">resets in {formatCountdown(resetsInMs)}</span>
        )}
      </div>

      <div className="mb-3 flex gap-1 rounded-full bg-mist p-1">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold transition ${
              scope === s.key ? "bg-denim text-white" : "text-slate/70 hover:text-slate"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {scope === "office" && (
        <select
          value={office}
          onChange={(e) => setOffice(e.target.value)}
          className="mb-3 w-full rounded-lg border border-powder/40 bg-white px-3 py-2 text-sm text-slate"
        >
          {offices.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}

      <div className="no-scrollbar max-h-72 overflow-y-auto">
        {loading && entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate/50">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate/50">
            No scores yet. Be the first to break the ceiling.
          </p>
        ) : (
          <ol className="space-y-1">
            {entries.map((e) => {
              const isMe = highlight && e.displayName.toLowerCase() === highlight;
              return (
                <li
                  key={`${e.rank}-${e.displayName}`}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    isMe ? "bg-salmon/15 ring-1 ring-salmon" : "odd:bg-mist/60"
                  }`}
                >
                  <span className="w-6 shrink-0 text-center font-semibold text-denim">
                    {e.rank}
                  </span>
                  <span className="flex-1 truncate font-medium text-slate">
                    {e.displayName}
                    {e.office && scope !== "office" && (
                      <span className="ml-2 text-xs text-powder">{e.office}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold text-slate">{e.height} m</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
